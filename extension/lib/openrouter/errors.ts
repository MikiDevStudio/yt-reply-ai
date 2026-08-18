/**
 * Every failure the OpenRouter client can produce, as a closed set.
 *
 * The UI maps each kind to a specific message and a specific next action, so a
 * generic "something went wrong" never reaches the user. Adding a kind here
 * forces the UI to decide what to do with it.
 */
export type OpenRouterErrorKind =
  /** No key, revoked key, or wrong key. Action: reconnect. */
  | 'unauthorized'
  /**
   * The key has spent everything it was allowed to spend.
   *
   * Apart from `unauthorized` even though both arrive as 403, and apart from
   * `no_credits` even though both are about money: the cap here is on the key
   * rather than on the account behind it, so topping the account up changes
   * nothing. What to offer depends on whose key it is — see `keyIsOurs` in
   * lib/failure.ts.
   */
  | 'key_exhausted'
  /** Account or key credit limit reached. Action: top up. */
  | 'no_credits'
  /** Too many requests. Free-tier models allow 20/min and 50/day. */
  | 'rate_limited'
  /** We sent something the API rejected — a bug on our side. */
  | 'invalid_request'
  /** The model provider failed, not OpenRouter itself. Action: retry or switch model. */
  | 'upstream'
  /** DNS failure, dropped connection, OpenRouter not answering. */
  | 'network'
  /**
   * The machine has no network at all.
   *
   * Kept apart from `network` because the two need different words: blaming
   * OpenRouter for an unplugged cable sends people to check a status page
   * instead of their wifi.
   */
  | 'offline'
  /** The request succeeded but produced no text. */
  | 'empty'
  /**
   * A safety filter refused, rather than anything going wrong.
   *
   * Apart from `empty` because the cause is the comment rather than the model:
   * a model that returns nothing is retried, a filter that fired on the way in
   * returns nothing every time it is asked. Which side refused is carried in
   * `filter`, because the two have different remedies — see lib/failure.ts.
   */
  | 'filtered'
  /**
   * The model kept writing far past the length of a reply.
   *
   * Cut off deliberately rather than waited out: the tokens are billed as they
   * arrive, and one observed run reached 80,000 characters — on the default
   * paid model that would have been most of a dollar for an answer nobody could
   * use.
   */
  | 'runaway'
  /** The caller cancelled. Not shown as an error. */
  | 'aborted';

/**
 * Which limit refused the request.
 *
 * The distinction is not academic and it is not guesswork: a 429 carries
 * `metadata.limit_source`, and the two families it names have opposite
 * remedies. A popular free model can be throttled upstream while a different
 * free model answers immediately — telling that user to wait out a daily
 * allowance sends them away for hours from a one-click problem.
 */
export type RateLimitSource =
  /** OpenRouter's 20 requests a minute for free models. Waiting fixes it. */
  | 'per-minute'
  /** OpenRouter's daily free-model allowance. Only another model fixes it today. */
  | 'per-day'
  /** The provider serving this model is turning requests away. Another model fixes it. */
  | 'provider'
  /** A 429 that named no source. */
  | 'unknown';

/**
 * Which side of the request a safety filter refused.
 *
 * `comment` is the one that has to be told apart: OpenRouter screens what goes
 * into some models, and a screened comment is refused before the model ever
 * sees it. Nothing about that changes on a second attempt, so a retry button
 * would be a button that cannot work.
 */
export type FilterSide =
  /** Screened on the way in. The comment never reached the model. */
  | 'comment'
  /** The model began and stopped. Reported as `finish_reason: content_filter`. */
  | 'reply';

/** What a `filtered` refusal knows about itself. */
export interface FilterFacts {
  side: FilterSide;
  /**
   * The categories OpenRouter's moderation named, when it named any.
   *
   * The only part of the refusal that explains it. `flagged_input` sits beside
   * it in the same object and is deliberately not read: it is a truncated copy
   * of the comment, and quoting it back adds nothing the person cannot see for
   * themselves on the page.
   */
  reasons?: string[];
}

/** Everything a failure can carry besides its kind and its text. */
export interface FailureDetails {
  /** HTTP status, when the failure came from a response. */
  status?: number;
  /** Seconds until the limit resets, when the API tells us. */
  retryAfterSeconds?: number;
  /** Which limit refused, on a 429. */
  limitSource?: RateLimitSource;
  /** Which side a filter refused, on `filtered`. */
  filter?: FilterFacts;
}

export class OpenRouterError extends Error {
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly limitSource?: RateLimitSource;
  readonly filter?: FilterFacts;

  constructor(
    readonly kind: OpenRouterErrorKind,
    message: string,
    details: FailureDetails = {},
  ) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.limitSource = details.limitSource;
    this.filter = details.filter;
  }

  /** Map an HTTP failure onto a kind. */
  static fromResponse(status: number, body: string, headers?: Headers): OpenRouterError {
    const { message, limitSource, resetSeconds, filter } = readErrorBody(body);
    const kind = kindForStatus(status, message, filter);

    return new OpenRouterError(kind, message ?? `HTTP ${status}`, {
      status,
      // The body first: a rate-limited response carries its reset inside
      // `metadata.headers` and sends no rate-limit headers of its own — checked
      // against the live API, where the HTTP headers came back empty.
      retryAfterSeconds: resetSeconds ?? secondsUntilRetry(headers),
      limitSource,
      filter: filterFor(kind, filter),
    });
  }

  /**
   * Map a failure that arrived inside the stream rather than as a status.
   *
   * Once the headers say 200, everything after that is chunks — a rate limit or
   * an exhausted balance hit mid-answer comes back as `{ error: { code } }` in
   * an SSE event, with `finish_reason: "error"` closing the stream. Running that
   * code through the same table is what keeps a mid-stream 429 from being
   * reported as "the provider failed", which would offer the wrong next step.
   */
  static fromStreamError(error: {
    code?: unknown;
    message?: unknown;
    metadata?: Record<string, unknown>;
  }): OpenRouterError {
    const status = typeof error.code === 'number' ? error.code : undefined;
    const message =
      typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : 'The model provider failed mid-response';
    const details = readMetadata(error.metadata);
    const kind = status ? kindForStatus(status, message, details.filter) : 'upstream';

    return new OpenRouterError(kind, message, {
      status,
      ...details,
      filter: filterFor(kind, details.filter),
    });
  }
}

/**
 * What an exhausted key says, as opposed to a revoked one.
 *
 * Both are 403 and only the text separates them: a key that has spent its limit
 * comes back as "Key limit exceeded (total limit)", checked against a live key
 * pushed over its cap. Matched loosely because the parenthetical varies with
 * which limit ran out, and the leading words are the part that identifies it.
 */
const KEY_EXHAUSTED = /key limit exceeded/i;

/**
 * A moderation 403 that carried no metadata to prove it, in its own words.
 *
 * The reference gives 403 three unrelated meanings — "insufficient permissions,
 * guardrail block, or moderation flag" — and only the moderation one comes with
 * `metadata.reasons` to identify it by. That metadata is the signal this trusts;
 * this pattern is the fallback for a provider guardrail that refuses in prose.
 *
 * Narrow on purpose, and it errs towards `unauthorized`. Calling a revoked key
 * a filtered comment takes away the reconnect button, which is the one thing
 * that would have fixed it — so a word has to be unmistakable to appear here.
 */
const FILTERED = /\b(flagged|moderation|guardrail)\b/i;

function kindForStatus(
  status: number,
  message?: string,
  filter?: FilterFacts,
): OpenRouterErrorKind {
  switch (status) {
    case 403:
      if (filter) return 'filtered';
      if (message && KEY_EXHAUSTED.test(message)) return 'key_exhausted';
      return message && FILTERED.test(message) ? 'filtered' : 'unauthorized';
    case 401:
      return 'unauthorized';
    case 402:
      return 'no_credits';
    case 429:
      return 'rate_limited';
    case 400:
    case 404:
    case 422:
      return 'invalid_request';
    default:
      // 5xx here, but also anything unmapped: treat as the provider's problem
      // rather than claiming to know what happened.
      return 'upstream';
  }
}

/** How long until the request is worth repeating, from the HTTP headers. */
export function secondsUntilRetry(headers?: Headers): number | undefined {
  if (!headers) return undefined;

  const retryAfter = Number(headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);

  return delayFromReset(headers.get('x-ratelimit-reset'));
}

/**
 * Turn a rate-limit reset value into seconds from now.
 *
 * The unit is not documented — the reference lists `X-RateLimit-Reset` by name
 * and nothing else — so the value is classified by magnitude: a timestamp in
 * milliseconds, a timestamp in seconds, or a plain number of seconds from now.
 * A live 429 carried `1786912200000`, which lands in the first case. Guessing
 * wrong here only costs the message its "try again in" line, which is why
 * nothing else is derived from it.
 */
export function delayFromReset(value: unknown): number | undefined {
  const reset = Number(value);
  if (!Number.isFinite(reset) || reset <= 0) return undefined;

  if (reset < 1e9) return Math.ceil(reset);

  const milliseconds = reset > 1e11 ? reset : reset * 1000;
  const seconds = Math.ceil((milliseconds - Date.now()) / 1000);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Read what an error body is willing to tell us.
 *
 * OpenRouter returns `{ error: { message, code, metadata } }`, but a proxy or
 * gateway in front of it may return plain text or HTML, so this has to tolerate
 * anything and give up quietly.
 */
function readErrorBody(body: string): {
  message?: string;
  limitSource?: RateLimitSource;
  resetSeconds?: number;
  filter?: FilterFacts;
} {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;

    if (typeof message === 'string' && message.length > 0) {
      const { limitSource, retryAfterSeconds, filter } = readMetadata(parsed?.error?.metadata);
      return { message, limitSource, resetSeconds: retryAfterSeconds, filter };
    }
  } catch {
    // Not JSON — fall through to the raw body.
  }

  const trimmed = body.trim();
  return { message: trimmed.length > 0 && trimmed.length < 300 ? trimmed : undefined };
}

/**
 * What a 429's `metadata` says about which limit refused and when it lifts.
 *
 * Both readings come from live responses rather than the reference, which
 * describes neither field. An account limit arrives as
 * `limit_source: "openrouter_free_tier_per_minute"` with the reset inside
 * `metadata.headers` and no rate-limit headers on the response itself; an
 * upstream one as `limit_source: "upstream_provider_shared_pool"`.
 */
function readMetadata(metadata: unknown): {
  limitSource?: RateLimitSource;
  retryAfterSeconds?: number;
  filter?: FilterFacts;
} {
  if (typeof metadata !== 'object' || metadata === null) return {};

  const {
    limit_source: source,
    headers,
    reasons,
    flagged_input: flaggedInput,
  } = metadata as {
    limit_source?: unknown;
    headers?: Record<string, unknown>;
    reasons?: unknown;
    flagged_input?: unknown;
  };

  // Either field identifies a moderation refusal; `reasons` is the one worth
  // keeping. Documented as always arriving together, so the pair is read as an
  // or rather than an and — a refusal that names no category is still a
  // refusal, and the message for it does not depend on having one.
  const moderated = Array.isArray(reasons) || typeof flaggedInput === 'string';

  return {
    limitSource: typeof source === 'string' ? classifyLimit(source) : undefined,
    retryAfterSeconds: delayFromReset(headers?.['X-RateLimit-Reset']),
    filter: moderated ? { side: 'comment', reasons: readReasons(reasons) } : undefined,
  };
}

/** The categories, when they arrived as the array of strings they should be. */
function readReasons(reasons: unknown): string[] | undefined {
  if (!Array.isArray(reasons)) return undefined;

  const named = reasons.filter((reason): reason is string => typeof reason === 'string');
  return named.length > 0 ? named : undefined;
}

/**
 * What a `filtered` error carries when the body did not spell it out.
 *
 * A filter that arrives as a status refused before the model saw the comment,
 * which is the whole difference between the two sides — so the side is settled
 * here rather than left absent for the UI to guess at.
 */
function filterFor(kind: OpenRouterErrorKind, filter?: FilterFacts): FilterFacts | undefined {
  if (kind !== 'filtered') return filter;
  return filter ?? { side: 'comment' };
}

/**
 * Sort a `limit_source` into the four cases the UI can act on.
 *
 * Matched loosely on purpose: the strings are undocumented, so a renamed
 * variant of "…per_day" should keep working, and anything that is not
 * OpenRouter's own limit is the provider's by elimination.
 */
function classifyLimit(source: string): RateLimitSource {
  if (/per[_-]?day|daily/i.test(source)) return 'per-day';
  if (/per[_-]?min/i.test(source)) return 'per-minute';
  if (/^openrouter/i.test(source)) return 'unknown';
  return 'provider';
}
