/**
 * The entitlement format, and the half of it that is only arithmetic.
 *
 * Kept apart from `licence.ts` for the reason `models.ts` is kept apart from
 * `settings.ts`: that file imports WXT's `#imports`, which resolves only inside
 * a build, so nothing importing it can be run by a script under plain tsx. This
 * file imports nothing at all, so the signature check can be exercised on its
 * own — see `scripts/` — which matters more here than almost anywhere: a
 * verification bug is invisible until it refuses somebody who paid.
 *
 * It is the mirror of `worker/src/entitlement.ts`. The two files describe one
 * format from opposite sides and have to be edited together.
 */

/**
 * The public half of the licence signing pair, SPKI, base64 — ECDSA P-256.
 *
 * Published on purpose: it can only verify, never sign. Its private half is a
 * Cloudflare secret and exists in one place. Regenerating the pair would
 * invalidate every licence ever sold, which is why the script that makes it
 * refuses to run twice.
 */
const PUBLIC_KEY =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmY42K91kuuzKfpxYzIairg54q4HMzGhpVfqBU1vJ8xsmo604B1WISNb7/g7w3jImwROdjuYvvAcO029pC0NNcA==';

/** Mirrors the payload the Worker signs. Four short keys, because it is pasted by hand. */
export interface Entitlement {
  /** What was bought. A promo code is the same object with a near expiry. */
  t: 'supporter' | 'promo';
  /** The code it came from — the thing to quote when writing in about it. */
  id: string;
  /** Issued at, seconds. */
  iat: number;
  /** Expires at, seconds, or `null` for a purchase, which does not. */
  exp: number | null;
}

/**
 * Check a token against the public key, and against the clock.
 *
 * `null` for anything wrong — wrong version, bad base64, bad signature, past
 * its expiry. The caller has no use for the distinction: all of them mean this
 * install is not licensed, and a screen that explains *why* a forged token was
 * refused is a screen that teaches someone how to forge a better one.
 */
export async function verify(candidate: string): Promise<Entitlement | null> {
  const [version, body, signature] = candidate.split('.');
  if (version !== 'v1' || !body || !signature) return null;

  try {
    const key = await crypto.subtle.importKey(
      'spki',
      bytes(PUBLIC_KEY),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const signed = new TextEncoder().encode(`${version}.${body}`);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      urlBytes(signature),
      signed,
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(urlBytes(body))) as Entitlement;
    if (payload.t !== 'supporter' && payload.t !== 'promo') return null;
    if (payload.exp !== null && payload.exp * 1000 <= Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Accept a code however it was typed — lower case, no dashes, a space on the
 * end from the email it was copied out of. All the same code, and the Worker
 * normalises identically before it looks anything up.
 */
export function normaliseCode(input: string): string | null {
  // Strip everything that is not a code character first, then the `RA` prefix —
  // and only when the length says it is a prefix rather than the first two
  // characters of the code itself, both of which are in the alphabet. The
  // Worker normalises identically; see `worker/src/entitlement.ts`.
  const bare = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = bare.length === 18 && bare.startsWith('RA') ? bare.slice(2) : bare;

  if (!/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/.test(body)) return null;
  return `RA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12)}`;
}

/**
 * The buffer parameter is spelled out because `Uint8Array` alone widens to
 * `ArrayBufferLike`, which includes `SharedArrayBuffer` — and Web Crypto will
 * not take one of those.
 */
function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** base64url, as the Worker writes it: no padding, `-` and `_` for `+` and `/`. */
function urlBytes(value: string): Uint8Array<ArrayBuffer> {
  return bytes(value.replace(/-/g, '+').replace(/_/g, '/'));
}
