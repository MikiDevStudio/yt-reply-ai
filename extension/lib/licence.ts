import { storage } from '#imports';
import { type Entitlement, normaliseCode, verify } from './entitlement';

/**
 * The licence: what a code turns into, and the only thing a purchase ever puts
 * on this machine (#39).
 *
 * ## It is checked once, and then we are gone
 *
 * A code is exchanged for a signed entitlement exactly once, at our Worker.
 * After that the extension never contacts us about it again: the entitlement is
 * verified locally against a public key that ships in `entitlement.ts`, so an
 * install that has activated keeps working if the Worker is shut down, if the
 * domain lapses, or if this project stops. That is a promise printed on the pricing
 * page rather than an implementation detail — there is no periodic re-check and
 * no revocation endpoint to build later.
 *
 * ## It carries no identity
 *
 * The entitlement says what was bought and when it expires. There is no email
 * in it, no install id, nothing about the person — which is what lets it live
 * in `chrome.storage.sync` and follow the buyer to their other machines without
 * us ever seeing a Google account, and why activating adds nothing to the
 * privacy policy or the Store data disclosure.
 *
 * The accepted consequence: it is a bearer token in the user's own storage and
 * can be shared. Nothing client-side is enforceable, this was decided in #39
 * rather than discovered, and what it guards is a coffee card and — once they
 * exist — profile slots. The activation ceiling on the code is the only
 * limit, and it is set to what an honest buyer needs.
 */

export type { Entitlement };

/** Where a code is exchanged. In `host_permissions`, like the trial endpoint. */
const ENDPOINT = 'https://api.mikidev.app/licence/activate';

/**
 * The signed token, verbatim, in `sync`.
 *
 * The token rather than the decoded payload: what is stored has to be the thing
 * the signature covers, or a value edited in `chrome.storage` would be trusted.
 * It is also exactly the string the user can copy out and paste back — see
 * `redeem` — so there is one format to explain, not two.
 *
 * `sync` is the whole point. It is small, it is not a secret in the sense a key
 * is (it spends no money and reveals nobody), and Chrome carrying it between a
 * person's machines is a licence that follows them for free.
 */
export const token = storage.defineItem<string | null>('sync:licence', { fallback: null });

/** What `redeem` did, in the words the settings screen answers with. */
export type Redemption =
  | { status: 'activated'; entitlement: Entitlement }
  /** An exported entitlement, verified here without asking anyone. */
  | { status: 'restored'; entitlement: Entitlement }
  /** Not a code and not an entitlement. */
  | { status: 'malformed' }
  /** A code shaped right that we have never issued. */
  | { status: 'unknown' }
  /** Every activation on this code has been used. */
  | { status: 'spent' }
  /** A promo code past its date. */
  | { status: 'expired' }
  /** Ours is unreachable or refusing. Worth trying again later. */
  | { status: 'unavailable' };

/**
 * Take whatever the user pasted and make sense of it.
 *
 * One field, two shapes, on purpose: someone recovering a licence should not
 * have to know whether the string in their notes is a code or an export, and
 * the two are never confusable — an export begins `v1.` and a code `RA-`.
 *
 * The export path touches the network not at all. It is the recovery route for
 * a machine with sync off, and the reason a licence outlives us.
 */
export async function redeem(input: string): Promise<Redemption> {
  const pasted = input.trim();

  if (pasted.startsWith('v1.')) {
    const entitlement = await verify(pasted);
    if (!entitlement) return { status: 'malformed' };
    await token.setValue(pasted);
    return { status: 'restored', entitlement };
  }

  const code = normaliseCode(pasted);
  if (!code) return { status: 'malformed' };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 404) return { status: 'unknown' };
  if (response.status === 409) return { status: 'spent' };
  if (response.status === 410) return { status: 'expired' };
  if (!response.ok) return { status: 'unavailable' };

  const body = (await response.json().catch(() => null)) as { entitlement?: string } | null;
  if (!body?.entitlement) return { status: 'unavailable' };

  // Verified before it is stored, even though it just came from us. A token
  // that fails here is a bug on our side or something in the middle rewriting
  // responses, and storing it either way would put the failure a week later in
  // a place nobody can trace.
  const entitlement = await verify(body.entitlement);
  if (!entitlement) return { status: 'unavailable' };

  await token.setValue(body.entitlement);
  return { status: 'activated', entitlement };
}

/**
 * The entitlement on this machine, or `null`.
 *
 * Verified on every read rather than trusted once and cached in storage: the
 * stored value arrives from `sync`, which means it can arrive edited. A P-256
 * verification is a fraction of a millisecond and this is read once per reply
 * at most.
 */
export async function current(): Promise<Entitlement | null> {
  const stored = await token.getValue();
  return stored ? verify(stored) : null;
}

/** Whether anything has been paid for. The one question the rest of the code asks. */
export async function licensed(): Promise<boolean> {
  return (await current()) !== null;
}

/** Give it back. Used by the "remove this licence" control, and by nothing else. */
export async function forget(): Promise<void> {
  await token.setValue(null);
}
