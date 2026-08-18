/**
 * The shop's end of the licence: a Buy Me a Coffee webhook, verified here.
 *
 * Why the Worker and not the n8n instance that already handles the website's
 * forms: this hop holds two secrets — the webhook's signing key and the mail
 * provider's key — and n8n's Crypto node takes its HMAC secret as a plain node
 * parameter rather than a credential. Cloudflare secrets are the right place
 * for both, the Worker already owns the licence ledger, and putting the two
 * together removes a hop rather than adding one.
 *
 * Deliberately the *only* file that knows what shop this is. `POST
 * /licence/issue` is shop-agnostic and stays that way: if the money ever moves
 * to a merchant of record — the option #39 left open, because Buy Me a Coffee
 * explicitly does not collect or remit VAT on a creator's behalf — that is a
 * second file beside this one and nothing else changes.
 *
 * Documented at
 * https://help.buymeacoffee.com/en/articles/15743173-how-to-setup-and-use-buy-me-a-coffee-webhooks
 */

/** The envelope every event arrives in. */
interface Envelope {
  event_id?: unknown;
  type?: unknown;
  live_mode?: unknown;
  data?: Record<string, unknown>;
  /** The older payload shape, which wrapped everything in `response`. */
  response?: Record<string, unknown>;
}

/** What we managed to read out of an event, and what we could not. */
export interface Donation {
  /** BMC's own id for the event. What makes a retry idempotent. */
  eventId: string;
  /** Where the code goes, or `null` if the payload had no address in it. */
  email: string | null;
  /** For the note on the code — never a person, just a way to recognise a batch. */
  amount: string | null;
}

/**
 * Check the signature before anything else looks at the body.
 *
 * HMAC-SHA256 of the raw bytes, keyed with the webhook's signing secret, in the
 * `x-signature-sha256` header. The raw text matters: re-serialising parsed JSON
 * changes the bytes and the digest with them.
 *
 * Both hex and base64 are accepted. Their documentation shows a Node example
 * whose encoding is not stated in the article, and accepting either costs
 * nothing — an attacker still needs the secret to produce either one. Once a
 * live event has been seen, the one it actually uses is the one to keep.
 */
export async function signed(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)),
  );

  const offered = header.trim().toLowerCase();
  return equal(offered, hex(digest)) || equal(offered, base64(digest).toLowerCase());
}

/**
 * Pull what we need out of an event, or say we could not.
 *
 * The address is looked for in four places on purpose. Their published envelope
 * puts event fields under `data`, an older and still widely quoted shape wraps
 * them in `response`, and the field is `supporter_email` in both — but the
 * OpenAPI file that would settle it sits behind their developer login, so this
 * was written against documentation rather than against a live event. Missing
 * the address is handled rather than assumed away: `email: null` sends the
 * whole event to us instead, and somebody gets their code by hand within the
 * day rather than never.
 *
 * `null` for the whole thing means this is not an event we act on.
 */
export function readDonation(body: unknown): Donation | null {
  const envelope = body as Envelope;
  if (envelope?.type !== 'donation.created') return null;

  const data = envelope.data ?? envelope.response ?? {};
  const eventId = String(envelope.event_id ?? '').trim();
  if (!eventId) return null;

  const email = firstString(data, ['supporter_email', 'payer_email', 'email']) ?? nested(data);
  const amount = firstString(data, ['total_amount', 'amount', 'number_of_coffees']);

  return { eventId, email, amount };
}

function nested(data: Record<string, unknown>): string | null {
  const supporter = data.supporter;
  if (supporter && typeof supporter === 'object') {
    return firstString(supporter as Record<string, unknown>, ['email']);
  }
  return null;
}

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/** Constant time, and length-checked first — `timingSafeEqual` throws on a mismatch. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
