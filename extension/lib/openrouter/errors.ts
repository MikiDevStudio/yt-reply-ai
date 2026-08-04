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
  /** Offline, DNS failure, connection dropped. */
  | 'network'
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
  static fromResponse(status: number, body: string, retryAfter?: string): OpenRouterError {
    const message = extractMessage(body) ?? `HTTP ${status}`;
    const retryAfterSeconds = retryAfter ? Number(retryAfter) || undefined : undefined;

    switch (status) {
      case 401:
      case 403:
        return new OpenRouterError('unauthorized', message, status);
      case 402:
        return new OpenRouterError('no_credits', message, status);
      case 429:
        return new OpenRouterError('rate_limited', message, status, retryAfterSeconds);
      case 400:
      case 404:
      case 422:
        return new OpenRouterError('invalid_request', message, status);
      default:
        // 5xx here, but also anything unmapped: treat as the provider's problem
        // rather than claiming to know what happened.
        return new OpenRouterError('upstream', message, status);
    }
  }
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
