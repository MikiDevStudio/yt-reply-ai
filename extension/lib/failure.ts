import type { OpenRouterErrorKind } from './openrouter/errors';

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
 */
export type FailureKind = OpenRouterErrorKind | 'interrupted';

/** Which OpenRouter limit is in play, when one is. See `rateLimitDetail`. */
export interface RateLimitFacts {
  /** The model in use is a free variant, so OpenRouter's free caps apply to it. */
  modelIsFree: boolean;
  /**
   * `is_free_tier` from `GET /key`, inverted: whether the account has ever
   * bought credits. `null` when the key could not be read — the copy then names
   * both daily caps rather than guessing which one bit.
   */
  hasPaid: boolean | null;
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
    title: 'The model returned nothing',
    detail:
      'Some models answer an empty message rather than say no. Another attempt often ' +
      'works; a different model almost always does.',
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

  if (facts.kind === 'rate_limited') {
    return {
      ...base,
      detail: rateLimitDetail(facts),
      actions: rateLimitActions(facts),
    };
  }

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
 * Name the limit that was actually hit.
 *
 * The free-model caps are OpenRouter's and are documented as 20 requests per
 * minute always, plus a daily cap that depends on lifetime spend: 50 below $10
 * of credits ever bought, 1000 at or above it. A 429 on a paid model is a
 * different animal — it comes from the provider's own throttling, and quoting
 * the free-tier numbers there would be a lie.
 *
 * No Pro line here, deliberately. This limit belongs to the user's own key, and
 * Pro would not lift it — see `docs/plans/2026-08-16-pro-offer-decisions.md`.
 */
function rateLimitDetail(facts: FailureFacts): string {
  const limit = facts.rateLimit;
  const wait = facts.retryAfterSeconds
    ? ` Try again in ${formatDelay(facts.retryAfterSeconds)}.`
    : '';

  if (!limit?.modelIsFree) {
    return (
      'The provider behind this model is throttling requests. ' +
      `It is not a limit on your credit.${wait}`
    );
  }

  // `is_free_tier` answers "has this account ever paid", not "has it paid $10",
  // so a paying account is told the rule rather than promised a number that a
  // $5 purchase would not have earned.
  if (limit.hasPaid === true) {
    return (
      'Free models allow 20 requests a minute, and 1,000 a day once the account ' +
      `has bought $10 of credits.${wait}`
    );
  }

  if (limit.hasPaid === false) {
    return (
      'Free models allow 20 requests a minute and 50 a day on an account that has ' +
      `never bought credits — $10 of credit once raises the daily cap to 1,000.${wait}`
    );
  }

  return (
    'Free models allow 20 requests a minute, and either 50 or 1,000 a day depending ' +
    `on whether the account has ever bought $10 of credits.${wait}`
  );
}

/**
 * A daily cap is not waited out, so retrying is only the honest first action
 * when the limit is the per-minute one. On a free model the way past the day
 * cap is a different model, which is why that route is offered alongside.
 */
function rateLimitActions(facts: FailureFacts): FailureAction[] {
  if (!facts.rateLimit?.modelIsFree) return [{ kind: 'retry', label: 'Try again' }];

  return [
    { kind: 'retry', label: 'Try again' },
    { kind: 'options', label: 'Use a paid model', section: '/models' },
  ];
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
