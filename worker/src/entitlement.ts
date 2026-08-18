/**
 * What an activation hands back, and the only thing about a purchase that ever
 * reaches the extension (#39).
 *
 * It carries no identity. There is no email in it, no install id, no device
 * fingerprint — it says *what was bought* and *when it stops*, and nothing
 * about who bought it. That is what lets it ride `chrome.storage.sync` to the
 * user's other machines without us ever seeing a Google account, and it is why
 * activating adds no paragraph to the privacy policy.
 *
 * The consequence, accepted in #39 rather than worked around: an entitlement is
 * a bearer token in the user's own synced storage. It can be shared. What it
 * protects is a nag card and, later, profile slots — nothing client-side is
 * enforceable anyway, and the deterrents are price and convenience.
 *
 * ## Why the signature is asymmetric
 *
 * ECDSA P-256 over SHA-256: the Worker holds the private half, the extension
 * ships the public one. An HMAC would have to ship its own secret inside the
 * extension, where anyone can read it out of the bundle and mint entitlements
 * for everyone — a strictly worse trade for the same amount of code.
 *
 * P-256 rather than Ed25519, which is otherwise the nicer curve: Ed25519 landed
 * in Chrome's Web Crypto in 137 (May 2025), and pinning `minimum_chrome_version`
 * that high to save 33 bytes in a key nobody ever types is not a trade worth
 * making. P-256 has worked in every browser that can run this extension.
 */

/** The payload, kept to four short keys because it is base64'd into a string a person pastes. */
export interface Entitlement {
  /** What was bought. A promo code is the same object with a near expiry. */
  t: 'supporter' | 'promo';
  /** The code this came from. Random, ours, and the only thing to quote in a support email. */
  id: string;
  /** Issued at, seconds. */
  iat: number;
  /** Expires at, seconds, or `null` for a purchase — which never expires. */
  exp: number | null;
}

/**
 * The format version, and the first thing the extension checks.
 *
 * A token that cannot be understood must be refused rather than guessed at, and
 * a version at the front is how an old extension says "this came from a newer
 * Worker" instead of failing at a signature check with a misleading message.
 */
const VERSION = 'v1';

/**
 * Crockford's base32 alphabet: no I, L, O or U, so nothing in a code can be
 * misread off a screen or misheard down a phone. Sixteen characters is 80 bits,
 * which is far past guessing even without the rate limit in front of it.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_GROUPS = 4;
const CODE_GROUP_SIZE = 4;

/** `RA-4KQ9-7XPM-2NRT-8WVH` — short enough to retype, long enough to be unguessable. */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_GROUPS * CODE_GROUP_SIZE));
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]);
  const groups = [];
  for (let at = 0; at < chars.length; at += CODE_GROUP_SIZE) {
    groups.push(chars.slice(at, at + CODE_GROUP_SIZE).join(''));
  }
  return `RA-${groups.join('-')}`;
}

/**
 * Accept a code however it was typed.
 *
 * People paste from an email with a trailing space, retype it in lower case, or
 * leave out the dashes. All three are the same code, and refusing any of them
 * teaches nothing — the shape is checked after normalising, not before.
 */
export function normaliseCode(input: string): string | null {
  const size = CODE_GROUPS * CODE_GROUP_SIZE;

  // Everything that is not a code character goes first — spaces, dashes, a
  // newline the email client wrapped it on. Only then is the `RA` prefix taken
  // off, and only when what is left would be a whole code without it: `R` and
  // `A` are both in the alphabet, so a body that happens to start `RA…` must
  // not be shortened by two. The length is what tells those apart.
  const bare = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = bare.length === size + 2 && bare.startsWith('RA') ? bare.slice(2) : bare;

  if (body.length !== size) return null;
  if (![...body].every((char) => ALPHABET.includes(char))) return null;

  const groups = [];
  for (let at = 0; at < body.length; at += CODE_GROUP_SIZE) {
    groups.push(body.slice(at, at + CODE_GROUP_SIZE));
  }
  return `RA-${groups.join('-')}`;
}

/**
 * Sign an entitlement into the string the extension stores.
 *
 * `v1.<payload>.<signature>`, both halves base64url — one line, no padding, and
 * safe to put in an email, a text file or a settings field. This is also the
 * export string from #39: what the user copies out to move a licence to a
 * machine where sync is off, and the only recovery path if this Worker is ever
 * shut down.
 */
export async function signEntitlement(pkcs8Base64: string, payload: Entitlement): Promise<string> {
  const key = await importSigningKey(pkcs8Base64);
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${VERSION}.${body}`),
  );
  return `${VERSION}.${body}.${base64url(new Uint8Array(signature))}`;
}

/**
 * The private half, as base64 PKCS#8 in a Worker secret.
 *
 * Generated by `scripts/generate-licence-key.mjs`, which writes this half to a
 * gitignored file and prints only the public one. It is imported per request
 * rather than cached in a global: an activation happens once in a user's life,
 * so the few milliseconds are free, and module-scope key material in a Worker
 * outlives the request that was allowed to have it.
 */
async function importSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(pkcs8Base64), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
