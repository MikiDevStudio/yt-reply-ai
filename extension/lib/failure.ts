import type { FilterFacts, OpenRouterErrorKind, RateLimitSource } from './openrouter/errors';

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
  /**
   * Whether the key that ran out was the trial one we issued. Present on
   * `key_exhausted`, where it decides between two unrelated messages.
   *
   * Absent or false means "not ours as far as we know", which is the reading
   * that fails safely: calling someone's own key a trial sends them looking for
   * a trial they never had.
   */
  keyIsOurs?: boolean;
  /**
   * Whether this install can still take the free trial. Present wherever the
   * answer is "you need a key", which is the only place it changes anything.
   *
   * It is the difference between a first run that ends in a reply and one that
   * ends in a form. Absent means no: a card that offers a trial nobody can
   * claim is worse than one that never mentioned it.
   */
  trialAvailable?: boolean;
  /**
   * Which side a safety filter refused, on `filtered`.
   *
   * The two sides do not share a remedy. A comment stopped on the way in is
   * stopped every time it is sent, so the card that describes it offers no
   * retry; a reply the model abandoned halfway is worth one more attempt.
   */
  filtered?: FilterFacts;
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
  | { kind: 'free-model'; label: string }
  /**
   * Claim the free trial here, without going anywhere.
   *
   * The point of the whole action: pressed under a YouTube comment, it fetches
   * a key and runs the generation the person actually asked for. Sending them
   * to a settings tab to press a second button is the form this replaces.
   */
  | { kind: 'trial'; label: string };

export interface Failure {
  /**
   * How the card is drawn. Absent means a fault, in the error frame.
   *
   * `notice` is for the two cards on this path that are not faults at all: the
   * trial being offered, and the trial finishing exactly as designed. Both used
   * to arrive in a red box, which contradicted every word inside it — and the
   * offer is the first thing a new install ever shows.
   */
  tone?: 'notice';
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
const KEYS_URL = 'https://openrouter.ai/settings/keys';

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

  // The entry for a key that is not ours. The trial's own ending is written in
  // `describeFailure`, because only the background can tell the two apart and
  // this is the half that is safe to say when it cannot.
  key_exhausted: {
    title: 'This key has spent its limit',
    detail:
      'The cap is on the key itself rather than on the account behind it, so adding ' +
      'credits will not lift it. Authorising again issues a fresh key; raising the ' +
      'limit on OpenRouter keeps this one.',
    // Authorising first, and the key page second, because our own flow is the
    // one that ends in a working key without the user having to find anything.
    // The page behind the link is a list — useful to someone who set the cap
    // that just bit, useless to someone who has never opened it.
    actions: [
      { kind: 'options', label: 'Connect OpenRouter', section: '/account' },
      { kind: 'link', label: 'Raise the limit', url: KEYS_URL },
    ],
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

  // The reply side of a filter. The comment side is written in `describeFailure`,
  // because it is the half that must not offer a retry — see `filtered` there.
  // This is also the safe half to say when the side is unknown: naming the model
  // as the one that refused is true of every filter that got as far as a model.
  filtered: {
    title: 'The model refused to answer this comment',
    detail:
      'A safety filter stopped the reply — the model read the comment and would not ' +
      'answer it. Where that line falls belongs to the provider rather than to any ' +
      'setting here, so another model often answers the same comment without complaint.',
    actions: [
      { kind: 'options', label: 'Try another model', section: '/models' },
      { kind: 'retry', label: 'Try again' },
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

  const connect: FailureAction = {
    kind: 'options',
    label: 'Connect OpenRouter',
    section: '/account',
  };

  if (facts.kind === 'unauthorized' && facts.hadKey === false) {
    // The first run, and the whole of #35: someone who has just installed this
    // is one press from a reply, not one account away from one. The offer is
    // made where the failure is — under the comment they were answering — and
    // pressing it generates that reply, rather than opening a tab about it.
    if (facts.trialAvailable) {
      return {
        tone: 'notice',
        title: 'Start with about twenty replies, free',
        detail:
          "On a key of this install's own — no account, no card, nothing to cancel. " +
          'When it runs out, connect your own OpenRouter account and carry on; ' +
          'replies cost about $0.002 each.',
        actions: [{ kind: 'trial', label: 'Try it free' }, connect],
      };
    }

    // No trial to offer, so this is the plain truth and the base entry's
    // "Reconnect" is the wrong word for it: nobody re-does what they have
    // never done.
    return {
      title: 'Not connected to OpenRouter',
      detail: 'Replies are generated through your own account. Connecting takes about a minute.',
      actions: [connect],
    };
  }

  // The trial running out is the one failure here that is not a fault: it is
  // the thing working as designed, arriving at the end. Said in the base entry's
  // words it would read as a key that broke, which is both wrong and the last
  // impression the trial gets to leave.
  if (facts.kind === 'key_exhausted' && facts.keyIsOurs) {
    return {
      tone: 'notice',
      title: 'The free trial is used up',
      detail:
        'That was the trial in full — about twenty replies, on us. Your own OpenRouter ' +
        'account carries on from here, and nothing else changes: replies cost about ' +
        '$0.002 each, billed by OpenRouter rather than by us.',
      actions: [{ kind: 'options', label: 'Connect OpenRouter', section: '/account' }],
    };
  }

  if (facts.kind === 'rate_limited') return rateLimited(facts);

  // A comment screened on the way in never reached a model, so the base entry —
  // which blames the model — is the wrong story, and the retry it offers is a
  // button that cannot work: the same comment is refused every time it is sent.
  if (facts.kind === 'filtered' && facts.filtered?.side === 'comment') {
    return {
      title: 'The comment was blocked before it reached the model',
      detail:
        'OpenRouter screens what goes into some models, and this comment did not pass' +
        `${flaggedAs(facts.filtered.reasons)}. The screening comes with the model rather ` +
        'than with your account, and most models carry none — one of those will take the ' +
        'comment as it stands.',
      actions: [{ kind: 'options', label: 'Try another model', section: '/models' }],
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

/**
 * The categories the moderation named, as a clause that can be left out.
 *
 * They are the only part of the refusal that explains it, and they are also the
 * part that may not arrive — so they are written as an aside rather than as the
 * sentence, which keeps the copy whole when there is nothing to name.
 */
function flaggedAs(reasons?: string[]): string {
  if (!reasons || reasons.length === 0) return '';

  const named =
    reasons.length === 1
      ? reasons[0]
      : `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;

  return `, flagged for ${named}`;
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
