/**
 * Two things a first run and a purchase need, and nothing else.
 *
 * `POST /trial` hands a new install its own OpenRouter key, capped at a couple
 * of cents, so the first run does not end at "go and create an account
 * somewhere else" (#38). `POST /licence/activate` turns a code into a signed
 * entitlement, once, and then never hears from that install again (#39).
 *
 * What this Worker is not: a proxy. Every generation goes from the extension
 * straight to openrouter.ai with the key issued here, so no comment text ever
 * passes through us, and an outage here cannot break an install that already
 * has its key. We are touched once per install, and once more if they buy.
 *
 * What it receives is a random UUID the extension generated for itself, or a
 * code we issued. No account, no email, no IP address kept — the rate limiter's
 * counter expires on its own and nothing writes an address down.
 */
import { readDonation, signed } from './bmc';
import { type Entitlement, newCode, normaliseCode, signEntitlement } from './entitlement';
import { TrialLedger } from './ledger';
import { type Kind, LicenceLedger } from './licences';
import { deleteKey, keyUsage, mintKey, OpenRouterError } from './openrouter';
import { send } from './resend';

export { LicenceLedger, TrialLedger };

interface Env {
  /** Set with `npx wrangler secret put OPENROUTER_MANAGEMENT_API_KEY`. */
  OPENROUTER_MANAGEMENT_API_KEY: string;
  /** Base64 PKCS#8, the private half of the licence signing pair. */
  LICENCE_SIGNING_KEY: string;
  /** The bearer token for issuing a code by hand — promos, and anything gone wrong. */
  LICENCE_ISSUE_TOKEN: string;
  /** Buy Me a Coffee's webhook signing secret, from their Integrations screen. */
  BMC_WEBHOOK_SECRET: string;
  /** Resend, which the rest of this stack already sends through. */
  RESEND_API_KEY: string;
  TRIAL_LIMIT_USD: string;
  TRIAL_DAILY_CEILING: string;
  TRIAL_MAX_ATTEMPTS: string;
  SUPPORTER_ACTIVATIONS: string;
  PROMO_ACTIVATIONS: string;
  PROMO_DAYS: string;
  /** Who a licence email comes from, and who a reply to one reaches. */
  LICENCE_FROM: string;
  SUPPORT_EMAIL: string;
  LEDGER: DurableObjectNamespace<TrialLedger>;
  LICENCES: DurableObjectNamespace<LicenceLedger>;
  MINT_LIMITER: RateLimit;
  ACTIVATE_LIMITER: RateLimit;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight();
    if (pathname === '/trial' && request.method === 'POST') return trial(request, env);
    if (pathname === '/licence/issue' && request.method === 'POST') return issue(request, env);
    if (pathname === '/licence/bmc' && request.method === 'POST') return bmc(request, env);
    if (pathname === '/licence/activate' && request.method === 'POST') return activate(request, env);
    if (pathname === '/health' && request.method === 'GET') return health(env);

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;

async function trial(request: Request, env: Env): Promise<Response> {
  // Before anything is read or parsed. The edge limit is deliberately crude: it
  // counts requests per address for a minute and forgets them. Anything
  // cleverer would mean keeping a record of addresses, which was rejected on
  // data-protection grounds and stays rejected. The real defences are the daily
  // ceiling and the cap on every key that does get issued.
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.MINT_LIMITER.limit({ key: address });
  if (!success) return json({ error: 'rate_limited' }, 429);

  const installId = await readInstallId(request);
  if (!installId) return json({ error: 'bad_request' }, 400);

  const day = utcDay();
  const ledger = env.LEDGER.getByName('trial');
  const claim = await ledger.claim(
    installId,
    day,
    Number(env.TRIAL_DAILY_CEILING),
    Number(env.TRIAL_MAX_ATTEMPTS),
  );

  if (claim.status === 'ceiling') {
    // A clean refusal, not a 500: the extension says "try tomorrow, or connect
    // your own key", which is a sentence a person can act on.
    log({ installId, status: 'ceiling', day });
    return json({ error: 'ceiling' }, 503);
  }

  if (claim.status === 'exhausted') {
    log({ installId, status: 'exhausted' });
    return json({ error: 'already_issued' }, 409);
  }

  if (claim.status === 'reissue') {
    // A key was minted for this install before. Either the response never
    // arrived — in which case the key is untouched and worthless to anyone —
    // or the install is asking for a second trial. What it spent tells them
    // apart, and only the first case is served.
    try {
      const spent = claim.hash === null ? null : await keyUsage(env.OPENROUTER_MANAGEMENT_API_KEY, claim.hash);
      if (spent !== null && spent > 0) {
        log({ installId, status: 'already_issued', spent });
        return json({ error: 'already_issued' }, 409);
      }
      if (claim.hash !== null && spent !== null) {
        await deleteKey(env.OPENROUTER_MANAGEMENT_API_KEY, claim.hash);
      }
    } catch (error) {
      return upstreamFailure(installId, error);
    }
    await ledger.reclaim(installId, day);
  }

  try {
    const minted = await mintKey(
      env.OPENROUTER_MANAGEMENT_API_KEY,
      `trial-${installId}`,
      Number(env.TRIAL_LIMIT_USD),
    );
    await ledger.record(installId, minted.hash);
    log({ installId, status: 'issued', hash: minted.hash });
    return json({ key: minted.key, limit: Number(env.TRIAL_LIMIT_USD) }, 200);
  } catch (error) {
    // Nothing was spent, so the install keeps its right to try again and the
    // day gets its slot back. Only on the first issue: a reissue already has
    // its slot and giving it back would let one install spend the ceiling.
    if (claim.status === 'mint') await ledger.release(installId, day);
    return upstreamFailure(installId, error);
  }
}

/**
 * `POST /licence/issue` — mint a code for someone who has just paid.
 *
 * Called by the shop's webhook handler, never by the extension, and authorised
 * by a bearer token that lives in a Worker secret. The caller decides nothing
 * about what the code is worth: the activation ceiling and the promo expiry are
 * `vars` here, so a compromised webhook cannot mint a licence with a thousand
 * activations on it.
 *
 * Deliberately payment-agnostic. It is told `kind` and a free-text `note`, and
 * nothing about who paid, how much, or through whom — which is what lets the
 * shop change (#39 chose Buy Me a Coffee first, with a merchant of record as
 * the later option) without this endpoint, the entitlement format, or a single
 * line of the extension changing with it.
 */
async function issue(request: Request, env: Env): Promise<Response> {
  if (!authorised(request, env.LICENCE_ISSUE_TOKEN)) {
    log({ event: 'licence', status: 'unauthorised' });
    return json({ error: 'unauthorised' }, 401);
  }

  let body: { kind?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const kind: Kind = body.kind === 'promo' ? 'promo' : 'supporter';
  const note = typeof body.note === 'string' ? body.note.slice(0, 120) : null;
  const activations = Number(
    kind === 'promo' ? env.PROMO_ACTIVATIONS : env.SUPPORTER_ACTIVATIONS,
  );
  // A purchase never expires — that promise is on the pricing page and it is
  // the whole reason to buy once rather than subscribe. Only a promo does.
  const expiresAt =
    kind === 'promo' ? Date.now() + Number(env.PROMO_DAYS) * 24 * 60 * 60 * 1000 : null;

  const code = newCode();
  await env.LICENCES.getByName('licences').mint(code, kind, activations, expiresAt, note);

  log({ event: 'licence', status: 'issued', kind, code: stub(code), activations });
  return json({ code, kind, activations, expiresAt }, 200);
}

/**
 * `POST /licence/bmc` — a coffee has been bought, so send back a code.
 *
 * This is the whole of the shop integration, and it is the only place that
 * knows which shop it is. Everything downstream — the ledger, the activation
 * endpoint, the entitlement, the extension — was written without a payment
 * provider in it, which is what keeps the option open to move the money to a
 * merchant of record later without touching any of them.
 *
 * Retried by them up to five times if we do not answer 2xx, which is why the
 * event id is written down: a retry re-sends the same code rather than minting
 * a second one for the same purchase.
 */
async function bmc(request: Request, env: Env): Promise<Response> {
  // The raw text, not the parsed object: the signature covers the bytes they
  // sent, and re-serialising JSON changes them.
  const raw = await request.text();
  if (!(await signed(raw, request.headers.get('x-signature-sha256'), env.BMC_WEBHOOK_SECRET))) {
    log({ event: 'licence', status: 'bad_signature' });
    return json({ error: 'bad_signature' }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const donation = readDonation(parsed);
  // Every other event type they send — a refund, a membership, a shop order —
  // is acknowledged and dropped. Answering anything but 2xx would put us in
  // their retry queue for events we have no opinion about, and ten consecutive
  // failures disables the webhook outright.
  if (!donation) return json({ ok: true, ignored: true }, 200);

  const licences = env.LICENCES.getByName('licences');
  const seen = await licences.codeForEvent(donation.eventId);
  let code = seen;

  if (!code) {
    code = newCode();
    await licences.mint(
      code,
      'supporter',
      Number(env.SUPPORTER_ACTIVATIONS),
      null,
      donation.amount ? `bmc ${donation.amount}` : 'bmc',
    );
    await licences.rememberEvent(donation.eventId, code);
  }

  try {
    if (donation.email) {
      await send(env.RESEND_API_KEY, {
        from: env.LICENCE_FROM,
        to: donation.email,
        replyTo: env.SUPPORT_EMAIL,
        subject: 'Your Reply AI supporter licence',
        text: letter(code),
      });
    } else {
      // The payload had no address in it. Rather than drop somebody who paid,
      // the code and the whole event come to us and go out by hand — see the
      // note in bmc.ts about what is known and what is not about their shape.
      await send(env.RESEND_API_KEY, {
        from: env.LICENCE_FROM,
        to: env.SUPPORT_EMAIL,
        subject: 'A coffee arrived with no address on it',
        text: `A donation produced code ${code}, and the event carried no email to send it to.\n\nSend it by hand, then look at what arrived:\n\n${raw.slice(0, 4000)}`,
      });
    }
  } catch (error) {
    // Never swallowed: the code is already minted, so a silent failure here is
    // somebody who paid and got nothing, with nothing in the log to find them
    // by. A non-2xx also puts us back in their retry queue, and the retry finds
    // the same code rather than making another.
    log({ event: 'licence', status: 'mail_failed', code: stub(code), message: String(error) });
    return json({ error: 'mail_failed' }, 500);
  }

  log({
    event: 'licence',
    status: seen ? 'bmc_retry' : 'bmc_issued',
    code: stub(code),
    addressed: donation.email !== null,
  });
  return json({ ok: true }, 200);
}

/** What lands in the inbox of somebody who has just bought a coffee. */
function letter(code: string): string {
  return [
    'Thank you — that is the whole of what the free version ever asks for.',
    '',
    'Your licence code:',
    '',
    `    ${code}`,
    '',
    'Open the extension’s settings, go to Supporter, and paste it in. The card',
    'that appears every twenty replies never appears again, on this machine and',
    'on every other one your Chrome profile syncs to.',
    '',
    'Activation happens once. After it the extension never contacts us about the',
    'licence again — there is nothing to renew and nothing that can be switched',
    'off from our end, so what you bought keeps working whatever happens here.',
    '',
    'Replies stay free, unlimited and on your own OpenRouter key. This bought',
    'quiet, not capacity.',
    '',
    'Reply to this email if anything is wrong and a person will answer.',
  ].join('\n');
}

/**
 * `POST /licence/activate` — spend one activation and hand back a signed
 * entitlement.
 *
 * The last time this install ever contacts us. What it gets back is verified
 * against a public key that ships inside the extension, stored in
 * `chrome.storage.sync`, and never checked again — so this Worker going away
 * cannot take a licence with it.
 */
async function activate(request: Request, env: Env): Promise<Response> {
  // A code is 80 bits, so guessing is not the attack. This is here so that
  // someone trying anyway costs us a rate limiter rather than a Durable Object
  // read per attempt.
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.ACTIVATE_LIMITER.limit({ key: address });
  if (!success) return json({ error: 'rate_limited' }, 429);

  let raw: string;
  try {
    const body = (await request.json()) as { code?: unknown };
    raw = typeof body.code === 'string' ? body.code : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const code = normaliseCode(raw);
  if (!code) return json({ error: 'bad_request' }, 400);

  const spend = await env.LICENCES.getByName('licences').spend(code);
  if (spend.status === 'unknown') {
    log({ event: 'licence', status: 'unknown_code', code: stub(code) });
    return json({ error: 'unknown_code' }, 404);
  }
  if (spend.status === 'spent') {
    log({ event: 'licence', status: 'code_spent', code: stub(code) });
    return json({ error: 'code_spent' }, 409);
  }
  if (spend.status === 'expired') {
    log({ event: 'licence', status: 'code_expired', code: stub(code) });
    return json({ error: 'code_expired' }, 410);
  }

  const payload: Entitlement = {
    t: spend.kind,
    id: code,
    iat: Math.floor(Date.now() / 1000),
    exp: spend.expiresAt === null ? null : Math.floor(spend.expiresAt / 1000),
  };

  try {
    const entitlement = await signEntitlement(env.LICENCE_SIGNING_KEY, payload);
    log({ event: 'licence', status: 'activated', kind: spend.kind, code: stub(code) });
    return json({ entitlement }, 200);
  } catch (error) {
    // The activation is already spent at this point and there is no way to put
    // it back that is not a second race. Say so plainly rather than pretend:
    // the person writes in with the code and gets another by hand, which is a
    // far better failure than a silent 500 on something they paid for.
    log({ event: 'licence', status: 'sign_failed', code: stub(code), message: String(error) });
    return json({ error: 'sign_failed' }, 500);
  }
}

/**
 * Constant-time, and length-checked first because `timingSafeEqual` throws on
 * a length mismatch rather than returning false.
 */
function authorised(request: Request, expected: string): boolean {
  const offered = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || offered.length !== expected.length) return false;
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(encoder.encode(offered), encoder.encode(expected));
}

/**
 * A code is a bearer secret, so the whole of one never goes into a log line.
 * The first group is 20 bits — worthless to guess with, enough to match a log
 * against the code somebody quotes in an email.
 */
function stub(code: string): string {
  return `${code.slice(0, 7)}…`;
}

/** Enough to see the trial is alive and how much of today's ceiling is gone. */
async function health(env: Env): Promise<Response> {
  const day = utcDay();
  const issued = await env.LEDGER.getByName('trial').issuedOn(day);
  const licences = await env.LICENCES.getByName('licences').counts();
  return json(
    { ok: true, day, issued, ceiling: Number(env.TRIAL_DAILY_CEILING), licences },
    200,
  );
}

async function readInstallId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { installId?: unknown };
    const id = typeof body.installId === 'string' ? body.installId : '';
    return UUID.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

function upstreamFailure(installId: string, error: unknown): Response {
  const status = error instanceof OpenRouterError ? error.status : 0;
  log({ installId, status: 'upstream_failed', upstream: status, message: String(error) });
  return json({ error: 'upstream' }, 502);
}

/** UTC, so the ceiling resets at one moment for everyone. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One line per request, and never a request body — there is no request body
 * worth keeping and that has to stay true. `installId` is in it so a person
 * writing in about a trial that failed can be answered.
 */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: 'trial', ...fields }));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: cors() });
}

/**
 * Open to any origin on purpose.
 *
 * The caller is an extension service worker, whose origin is
 * `chrome-extension://<id>` — and that id changes when the Web Store signs the
 * package, so pinning it here would break the first published build. CORS was
 * never the defence anyway: it stops a page in a browser, not a script with
 * curl. The rate limit, the daily ceiling and the cap on each key are.
 */
function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
