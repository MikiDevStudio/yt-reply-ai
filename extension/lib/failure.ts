import type { OpenRouterErrorKind, RateLimitSource } from './openrouter/errors';

/**
 * What every failure says, and what the user can do about it — in one table.
 *
 * The wording used to live in whichever component happened to render the error,
 * which meant four surfaces disagreed about the same 401 and one of them fell
 * back to "Something went wrong". Keeping it here makes the promise in #15
 * checkable: `COPY` is a total map over the kinds, so a new kind does not
 * compile until someone has decided what it tells the user and what it offers
 * them next.
 *
 * Nothing here touches storage or the network. It takes facts and returns text,
 * so it can run in a content script, the popup and the options page alike.
 */

/**
 * Everything that can go wrong, from the user's side.
 *
 * `interrupted` is the one kind the OpenRouter client cannot produce: it means
 * Chrome tore the service worker down while the answer was streaming. It looks
 * like a network failure and is not one — the request was fine, the browser
 * simply stopped listening.
 *
 * There used to be a `quota` kind for a daily cap of our own. The cap is gone,
 * and with it the only failure this extension ever raised by itself: every kind
 * left is something that happened on the way to OpenRouter or back.
 */
export type FailureKind = OpenRouterErrorKind | 'interrupted' | 'timeout';

/** Which OpenRouter limit is in play, when one is. See `rateLimitDetail`. */
export interface RateLimitFacts {
  /** The model in use is a free variant, so OpenRouter's free caps apply to it. */
  modelIsFree: boolean;
  /**
   * `is_free_tier` from `GET /key`, inverted: whether the account has ever
   * bought credits. `null` when the key could not be read, or when the limit
   * was not the account's to begin with — the copy then names both daily caps
   * rather than guessing which one bit.
   */
  hasPaid: boolean | null;
  /** Which limit refused, as the 429 itself reported it. */
  source: RateLimitSource;
}

export interface FailureFacts {
  kind: FailureKind;
  /** What OpenRouter said. Shown only where it carries information we lack. */
  message?: string;
  /** Seconds until the request is worth repeating, when a limit said so. */
  retryAfterSeconds?: number;
  rateLimit?: RateLimitFacts;
  /**
   * Whether a key was stored when the request failed. Splits "never connected"
   * from "the key stopped working", which read the same to us and completely
   * differently to the person holding the account.
   */
  hadKey?: boolean;
  /** Text that arrived before the failure. Kept rather than thrown away. */
  partial?: string;
}

/** Where a button leads. Rendered by `components/FailureNotice.tsx`. */
export type FailureAction =
  /** Run the same request again. Rendered only when the caller can retry. */
  | { kind: 'retry'; label: string }
  /** Open our settings page at a section. */
  | { kind: 'options'; label: string; section: '/account' | '/models' }
  /** Open a page on openrouter.ai. */
  | { kind: 'link'; label: string; url: string }
  /** Switch the stored model to the free preset, then retry. */
  | { kind: 'free-model'; label: string };

export interface Failure {
  /** One sentence naming what happened, in our words. */
  title: string;
  /** What it means, or when it lifts. */
  detail?: string;
  /** OpenRouter's own text, when it says more than we can. */
  raw?: string;
  /** Ordered; the first is the one we expect to be pressed. */
  actions: FailureAction[];
}

const CREDITS_URL = 'https://openrouter.ai/settings/credits';

/**
 * The fixed half of each message.
 *
 * Anything that depends on the failure itself — a limit, a reset time, a
 * provider's own words — is added by `describeFailure` below.
 */
const COPY: Record<FailureKind, Failure> = {
  unauthorized: {
    title: 'OpenRouter rejected the key',
    detail: 'It was revoked or deleted on OpenRouter. Connecting again issues a new one.',
    actions: [{ kind: 'options', label: 'Reconnect', section: '/account' }],
  },

  no_credits: {
    title: 'Your OpenRouter account is out of credits',
    detail:
      'Paid models bill your own account, so nothing runs until it is topped up. ' +
      'Free models keep working without credit.',
    actions: [
      { kind: 'link', label: 'Add credits', url: CREDITS_URL },
      { kind: 'free-model', label: 'Use the free model' },
    ],
  },

  rate_limited: {
    title: 'OpenRouter is rate limiting your key',
    actions: [{ kind: 'retry', label: 'Try again' }],
  },

  invalid_request: {
    title: 'OpenRouter rejected the request',
    detail: 'Usually the model id — an id that was withdrawn, or one that was never offered.',
    actions: [{ kind: 'options', label: 'Choose a model', section: '/models' }],
  },

  upstream: {
    title: 'The model provider failed',
    detail: 'The fault is at the provider behind this model, not at your account.',
    actions: [
      { kind: 'retry', label: 'Try again' },
      { kind: 'options', label: 'Change model', section: '/models' },
    ],
  },

  empty: {
    title: 'The model did not write a reply',
    detail:
      'Some models answer with nothing at all, or repeat one token until they are ' +
      'stopped, rather than say no. Another attempt often works; a different model ' +
      'almost always does.',
    actions: [
      { kind: 'retry', label: 'Try again' },
      { kind: 'options', label: 'Change model', section: '/models' },
    ],
  },

  network: {
    title: 'Could not reach OpenRouter',
    detail: 'Your connection is up, so this is OpenRouter or something between you and it.',
    actions: [{ kind: 'retry', label: 'Try again' }],
  },

  offline: {
    title: 'No internet connection',
    detail: 'Chrome reports the machine as offline. Nothing will go through until it is back.',
    actions: [{ kind: 'retry', label: 'Try again' }],
  },

  runaway: {
    title: 'The model would not stop writing',
    detail:
      'It went far past the length of a reply, so it was cut off rather than left to ' +
      'run up a bill. Smaller models do this at high creativity — another attempt ' +
      'usually lands, and a different model almost always does.',
    actions: [
      { kind: 'retry', label: 'Try again' },
      { kind: 'options', label: 'Change model', section: '/models' },
    ],
  },

  timeout: {
    title: 'The model is taking too long',
    detail:
      'It has been going long enough that typing the reply yourself would have been ' +
      'quicker. This is usually a smaller model wandering at high creativity.',
    actions: [
      { kind: 'retry', label: 'Try again' },
      { kind: 'options', label: 'Change model', section: '/models' },
    ],
  },

  interrupted: {
    title: 'The extension stopped responding',
    detail: 'Chrome put it to sleep, or it was reloaded while the request was running.',
    actions: [{ kind: 'retry', label: 'Try again' }],
  },

  // Never rendered: cancelling is a decision, not a failure. It has an entry so
  // the map stays total and callers can filter it out by kind rather than by
  // remembering that this one case is special.
  aborted: {
    title: 'Cancelled',
    actions: [],
  },
};

/** Turn what we know about a failure into what the user reads. */
export function describeFailure(facts: FailureFacts): Failure {
  const base = COPY[facts.kind];

  if (facts.kind === 'unauthorized' && facts.hadKey === false) {
    return {
      title: 'Not connected to OpenRouter',
      detail: 'Replies are generated through your own account. Connecting takes about a minute.',
      actions: base.actions,
    };
  }

  if (facts.kind === 'rate_limited') return rateLimited(facts);

  // Half an answer is still worth something — it can be edited into a reply —
  // so the words have to account for it being on screen rather than pretend the
  // attempt produced nothing.
  if (facts.kind === 'interrupted' && facts.partial) {
    return {
      ...base,
      detail: `${base.detail} What arrived before that is below; the rest never came.`,
    };
  }

  // The provider's own words are the only clue to what it objected to, and we
  // have nothing better to say about either kind. Everywhere else our sentence
  // is the more precise one, and the raw text is noise at best — "No auth
  // credentials found" reads as a bug in our code to the person who sees it.
  const raw =
    facts.message && (facts.kind === 'upstream' || facts.kind === 'invalid_request')
      ? facts.message
      : undefined;

  return raw ? { ...base, raw } : base;
}

/**
 * Name the limit that actually refused, and offer what fixes that one.
 *
 * Three different situations arrive as the same 429, and their remedies do not
 * overlap. OpenRouter's own caps on free models are 20 requests a minute and,
 * per day, 50 below $10 of lifetime credit or 1,000 at or above it — a minute
 * is waited out, a day is not. An upstream refusal is neither: the model's
 * provider is turning requests away, the account is untouched, and another
 * model answers immediately. Which one it was comes from the response's
 * `limit_source`, so this is reading rather than guessing.
 *
 * No Pro line in any of them, deliberately. These limits belong to the user's
 * own key and Pro would not lift them — see the project decision log, kept
 * outside this repository.
 */
function rateLimited(facts: FailureFacts): Failure {
  const wait = facts.retryAfterSeconds
    ? ` Try again in ${formatDelay(facts.retryAfterSeconds)}.`
    : '';
  const change: FailureAction = { kind: 'options', label: 'Try another model', section: '/models' };
  const retry: FailureAction = { kind: 'retry', label: 'Try again' };

  switch (facts.rateLimit?.source) {
    case 'provider':
      return {
        title: 'This model is turning requests away',
        detail:
          'The provider serving it is refusing requests from the shared free pool right ' +
          `now. Your account is untouched, and another free model usually answers at once.${wait}`,
        actions: [change, retry],
      };

    case 'per-minute':
      return {
        title: 'Too many requests in a minute',
        detail: `Free models take 20 requests a minute across your whole account.${wait}`,
        actions: [retry],
      };

    case 'per-day':
      return {
        title: "Today's free requests are used up",
        detail: `${dailyCap(facts.rateLimit.hasPaid)}${wait}`,
        actions: [change, retry],
      };

    default:
      return {
        title: 'OpenRouter is rate limiting your key',
        detail:
          'Free models allow 20 requests a minute, and either 50 or 1,000 a day depending ' +
          `on whether the account has ever bought $10 of credits.${wait}`,
        actions: [retry, change],
      };
  }
}

/**
 * `is_free_tier` answers "has this account ever paid", not "has it paid $10",
 * so a paying account is told the rule rather than promised a number that a $5
 * purchase would not have earned.
 */
function dailyCap(hasPaid: boolean | null): string {
  if (hasPaid === false) {
    return (
      'Free models allow 50 a day on an account that has never bought credits — ' +
      '$10 of credit once raises that to 1,000. A paid model has no daily cap.'
    );
  }

  if (hasPaid === true) {
    return (
      'Free models allow 1,000 a day once the account has bought $10 of credits. ' +
      'A paid model has no daily cap.'
    );
  }

  return (
    'Free models allow 50 a day, or 1,000 once the account has bought $10 of ' +
    'credits. A paid model has no daily cap.'
  );
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
