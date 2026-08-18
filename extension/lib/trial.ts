import { storage } from '#imports';
import { connectionFailure } from './openrouter/client';
import { OpenRouterError } from './openrouter/errors';

/**
 * The free trial: a real OpenRouter key of this install's own, capped at a few
 * cents, issued by our Worker so that a first run does not end at "go and
 * create an account somewhere else" (#38).
 *
 * What leaves the machine is one random identifier and nothing else. No comment
 * text ever comes here — generation goes straight to openrouter.ai with the key
 * this returns, exactly as it does for a key the user brought themselves. The
 * Worker is touched once per install, so it being down cannot break an install
 * that already has its key.
 */

/**
 * Where the Worker lives. In `host_permissions` as well, so changing it means
 * changing the manifest — and, once the extension is in the Store, a review.
 */
const ENDPOINT = 'https://api.mikidev.app/trial';

/**
 * This install's identifier: a random UUID, made here, meaning nothing anywhere
 * else.
 *
 * `local`, never `sync`. A trial belongs to an install rather than to a person,
 * and a profile syncing the same id to four machines would ask for the same two
 * cents four times — or, worse, be refused three times.
 */
export const installId = storage.defineItem<string | null>('local:trial.installId', {
  fallback: null,
});

/** Whether this install has already asked. Saves a pointless round trip. */
export const claimed = storage.defineItem<boolean>('local:trial.claimed', {
  fallback: false,
});

/**
 * Whether the stored key is the trial one we issued.
 *
 * Written together with the key itself and cleared the moment the user connects
 * an account or pastes a key of their own — see `storeKey` in the background
 * worker, which is the only writer of either.
 *
 * It exists for one sentence. An exhausted key answers 403 whoever owns it, and
 * "the trial is over, here is what comes next" and "your own key hit the cap
 * you set on it" send people to different screens.
 *
 * `local`, like the rest of this file: it describes a key that is local too.
 */
export const keyIsOurs = storage.defineItem<boolean>('local:trial.keyIsOurs', {
  fallback: false,
});

/**
 * Whether the trial key has already been refused for spending its allowance.
 *
 * Recorded when OpenRouter says so, rather than worked out from what is left on
 * the key, because the number cannot be trusted at the one moment it matters:
 * `GET /key` answers 200 on a key that is already over its cap and keeps
 * reporting the old figures. Measured on a live key whose limit was dropped
 * below its spend — `/key` still read "0.01 limit, 0.01 remaining, 0 used"
 * while completions through the same key were already coming back 403.
 *
 * Cleared with every key that is stored, so it always describes the key in hand.
 */
export const spent = storage.defineItem<boolean>('local:trial.spent', {
  fallback: false,
});

export type TrialOutcome =
  /** A key was issued. It is already stored; the number is what it can spend. */
  | { status: 'issued'; limit: number }
  /**
   * Nobody is getting one this minute — the daily ceiling, or too many requests
   * from this address. Worth repeating later; not worth repeating twice.
   */
  | { status: 'unavailable' }
  /** This install has had its trial. The way on from here is your own key. */
  | { status: 'used' }
  /** A key is already stored, so there was nothing to do. */
  | { status: 'connected' };

/**
 * Ask for a trial key.
 *
 * Returns the key rather than storing it: the caller is the background worker,
 * which is the only place allowed to hold one.
 */
export async function claimTrial(): Promise<{ outcome: TrialOutcome; key?: string }> {
  const id = await currentInstallId();

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId: id }),
    });
  } catch {
    throw connectionFailure('Could not reach the trial service');
  }

  // Both mean "not now": 429 is this address asking too often, 503 is the day's
  // ceiling. Neither is the user's mistake and neither is permanent, so they
  // read as one state rather than two.
  if (response.status === 429 || response.status === 503) return { outcome: { status: 'unavailable' } };
  if (response.status === 409) return { outcome: { status: 'used' } };

  if (!response.ok) {
    // 400 would mean we sent a malformed id, which is our bug; anything else is
    // the Worker or OpenRouter behind it. Neither is worth a special sentence.
    throw new OpenRouterError(
      response.status === 400 ? 'invalid_request' : 'upstream',
      `The trial service answered ${response.status}`,
    );
  }

  const body = (await response.json()) as { key?: string; limit?: number };
  if (!body.key) throw new OpenRouterError('upstream', 'The trial service returned no key');

  return { outcome: { status: 'issued', limit: body.limit ?? 0 }, key: body.key };
}

/** The id for this install, made on first use and never changed. */
async function currentInstallId(): Promise<string> {
  const existing = await installId.getValue();
  if (existing) return existing;

  const fresh = crypto.randomUUID();
  await installId.setValue(fresh);
  return fresh;
}
