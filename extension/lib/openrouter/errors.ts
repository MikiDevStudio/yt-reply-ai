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
  /** The request succeeded but produced no text — often a content filter. */
  | 'empty'
  /** The caller cancelled. Not shown as an error. */
  | 'aborted';

export class OpenRouterError extends Error {
  constructor(
    readonly kind: OpenRouterErrorKind,
    message: string,
    /** HTTP status, when the failure came from a response. */
    readonly status?: number,
    /** Seconds until the limit resets, when the API tells us. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }

  /** Map an HTTP failure onto a kind. */
  static fromResponse(status: number, body: string, headers?: Headers): OpenRouterError {
    const message = extractMessage(body) ?? `HTTP ${status}`;
    return new OpenRouterError(kindForStatus(status), message, status, secondsUntilRetry(headers));
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
  static fromStreamError(error: { code?: unknown; message?: unknown }): OpenRouterError {
    const status = typeof error.code === 'number' ? error.code : undefined;
    const message =
      typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : 'The model provider failed mid-response';

    return new OpenRouterError(status ? kindForStatus(status) : 'upstream', message, status);
  }
}

function kindForStatus(status: number): OpenRouterErrorKind {
  switch (status) {
    case 401:
    case 403:
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

/**
 * How long until the request is worth repeating.
 *
 * `Retry-After` is only sent when every provider tried gave a hint, so the
 * rate-limit headers are the usual source. Their unit is not documented — the
 * reference lists `X-RateLimit-Reset` by name and nothing else — so the value is
 * classified by magnitude: a timestamp in milliseconds, a timestamp in seconds,
 * or a plain number of seconds from now. Guessing wrong here only costs the
 * message its "try again in" line, which is why nothing is derived from it.
 */
export function secondsUntilRetry(headers?: Headers): number | undefined {
  if (!headers) return undefined;

  const retryAfter = Number(headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);

  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return undefined;

  if (reset < 1e9) return Math.ceil(reset);

  const milliseconds = reset > 1e11 ? reset : reset * 1000;
  const seconds = Math.ceil((milliseconds - Date.now()) / 1000);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Pull the human-readable message out of an error body.
 *
 * OpenRouter returns `{ error: { message, code } }`, but a proxy or gateway in
 * front of it may return plain text or HTML, so this has to tolerate anything.
 */
function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  } catch {
    // Not JSON — fall through to the raw body.
  }
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length < 300 ? trimmed : undefined;
}
