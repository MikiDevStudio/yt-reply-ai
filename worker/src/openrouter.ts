/**
 * The provisioning half of OpenRouter's API — the one that mints keys rather
 * than spending them.
 *
 * Authorised by a provisioning key, which is a different kind of credential
 * from the one the extension uses: an ordinary key cannot create keys. It lives
 * in a Worker secret and appears nowhere else.
 *
 * Documented at https://openrouter.ai/docs/features/provisioning-api-keys.
 * Their first stated use case is "SaaS Applications: Automatically create
 * unique API keys for each customer instance", which is exactly this.
 */

const BASE = 'https://openrouter.ai/api/v1/keys';

/** What `POST /keys` returns. The plaintext key comes back once and never again. */
export interface MintedKey {
  key: string;
  hash: string;
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/**
 * Mint a key that can spend `limitUsd` and then stops.
 *
 * No `limit_reset`, so the allowance never refills — a trial that quietly came
 * back every month would be a free tier we did not decide to offer. The
 * exhausted key is what turns into the "connect your own key" moment (#15,
 * #35), so it is left in place rather than deleted.
 */
export async function mintKey(
  provisioningKey: string,
  name: string,
  limitUsd: number,
): Promise<MintedKey> {
  const response = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provisioningKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, limit: limitUsd }),
  });

  const body = await response.text();
  if (!response.ok) throw new OpenRouterError(response.status, clip(body));

  const parsed = JSON.parse(body) as { key?: string; data?: { hash?: string } };
  if (!parsed.key || !parsed.data?.hash) {
    throw new OpenRouterError(response.status, `unexpected shape: ${clip(body)}`);
  }

  return { key: parsed.key, hash: parsed.data.hash };
}

/**
 * What a key has spent so far, or `null` if it is gone.
 *
 * Read for one purpose: deciding whether a key we handed out was ever received.
 * See `reissue` in index.ts.
 */
export async function keyUsage(provisioningKey: string, hash: string): Promise<number | null> {
  const response = await fetch(`${BASE}/${hash}`, {
    headers: { Authorization: `Bearer ${provisioningKey}` },
  });

  if (response.status === 404) return null;
  const body = await response.text();
  if (!response.ok) throw new OpenRouterError(response.status, clip(body));

  const parsed = JSON.parse(body) as { data?: { usage?: number } };
  return parsed.data?.usage ?? 0;
}

/** Revoke a key. Used only on a key that was minted and never reached anyone. */
export async function deleteKey(provisioningKey: string, hash: string): Promise<void> {
  const response = await fetch(`${BASE}/${hash}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${provisioningKey}` },
  });

  // A key that is already gone is the state we wanted.
  if (!response.ok && response.status !== 404) {
    throw new OpenRouterError(response.status, clip(await response.text()));
  }
}

/** Error bodies end up in logs, and a whole HTML error page is no use there. */
function clip(body: string): string {
  return body.length > 300 ? `${body.slice(0, 300)}…` : body;
}
