/**
 * `POST /trial` — hand a new install its own OpenRouter key, capped at a couple
 * of cents, so the first run does not end at "go and create an account
 * somewhere else" (#38).
 *
 * What this Worker is not: a proxy. Every generation goes from the extension
 * straight to openrouter.ai with the key issued here, so no comment text ever
 * passes through us, and an outage here cannot break an install that already
 * has its key. We are touched once per install.
 *
 * What it receives is a random UUID the extension generated for itself. No
 * account, no email, no IP address kept — the rate limiter's counter expires on
 * its own and nothing writes an address down.
 */
import { TrialLedger } from './ledger';
import { deleteKey, keyUsage, mintKey, OpenRouterError } from './openrouter';

export { TrialLedger };

interface Env {
  /** Set with `npx wrangler secret put OPENROUTER_MANAGEMENT_API_KEY`. */
  OPENROUTER_MANAGEMENT_API_KEY: string;
  TRIAL_LIMIT_USD: string;
  TRIAL_DAILY_CEILING: string;
  TRIAL_MAX_ATTEMPTS: string;
  LEDGER: DurableObjectNamespace<TrialLedger>;
  MINT_LIMITER: RateLimit;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight();
    if (pathname === '/trial' && request.method === 'POST') return trial(request, env);
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

/** Enough to see the trial is alive and how much of today's ceiling is gone. */
async function health(env: Env): Promise<Response> {
  const day = utcDay();
  const issued = await env.LEDGER.getByName('trial').issuedOn(day);
  return json({ ok: true, day, issued, ceiling: Number(env.TRIAL_DAILY_CEILING) }, 200);
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
