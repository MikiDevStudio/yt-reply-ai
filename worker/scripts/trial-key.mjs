/**
 * Push a live trial key over its limit, and put it back.
 *
 * The point is to see what a person sees when the trial runs out, without
 * spending thirty replies to get there:
 *
 *   node scripts/trial-key.mjs list
 *   node scripts/trial-key.mjs exhaust     # next reply fails, as it would at the end
 *   node scripts/trial-key.mjs restore     # limit back to 0.04, usage kept
 *
 * `exhaust` lowers the key's spend limit below what it has already spent, which
 * is the same state as a trial that ran out — OpenRouter then answers 403 with
 * "Key limit exceeded". `PATCH /keys/{hash}` takes a `limit`, which their docs
 * do not mention for that method; checked against the live API.
 *
 * Requires OPENROUTER_MANAGEMENT_API_KEY in the repo-root .env. Touches only
 * keys named `trial-*`, never the account's own.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const provisioningKey = readFileSync(join(root, '.env'), 'utf8')
  .match(/^OPENROUTER_MANAGEMENT_API_KEY=(.+)$/m)?.[1]
  .trim();
if (!provisioningKey) throw new Error('OPENROUTER_MANAGEMENT_API_KEY not found in .env');

const BASE = 'https://openrouter.ai/api/v1/keys';
const headers = { Authorization: `Bearer ${provisioningKey}`, 'Content-Type': 'application/json' };
/** What `wrangler.jsonc` mints them with. */
const TRIAL_LIMIT = 0.04;

const command = process.argv[2] ?? 'list';

const all = (await (await fetch(BASE, { headers })).json()).data ?? [];
const trials = all
  .filter((key) => key.name.startsWith('trial-'))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

if (trials.length === 0) {
  console.log('No trial keys in this account. Press "Try it free" in the extension first.');
  process.exit(0);
}

if (command === 'list') {
  for (const key of trials) {
    console.log(
      `${key.name}\n  spent $${key.usage}  limit $${key.limit}  remaining $${key.limit_remaining}  created ${key.created_at}`,
    );
  }
  process.exit(0);
}

// Newest first: the one the extension is holding, unless several were issued.
const [key] = trials;
if (trials.length > 1) {
  console.log(`${trials.length} trial keys exist; acting on the newest, ${key.name}.\n`);
}

if (command === 'exhaust') {
  if (!(key.usage > 0)) {
    console.log(
      `${key.name} has spent nothing yet, so there is no limit to drop below.\n` +
        'Generate one reply in the extension, wait about fifteen seconds for OpenRouter to\n' +
        'account for it, and run this again.',
    );
    process.exit(1);
  }

  const limit = Number((key.usage / 2).toFixed(8));
  const response = await fetch(`${BASE}/${key.hash}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) throw new Error(`PATCH failed: ${response.status} ${await response.text()}`);

  console.log(
    `${key.name} is now over its limit (limit $${limit}, spent $${key.usage}).\n` +
      'Generate a reply in the extension — that is the end-of-trial state.\n' +
      'Put it back with: node scripts/trial-key.mjs restore',
  );
  process.exit(0);
}

if (command === 'restore') {
  const response = await fetch(`${BASE}/${key.hash}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ limit: TRIAL_LIMIT }),
  });
  if (!response.ok) throw new Error(`PATCH failed: ${response.status} ${await response.text()}`);

  const restored = (await (await fetch(`${BASE}/${key.hash}`, { headers })).json()).data;
  console.log(
    `${key.name} restored: limit $${restored.limit}, spent $${restored.usage}, ` +
      `$${restored.limit_remaining} left.`,
  );
  process.exit(0);
}

console.log('Commands: list | exhaust | restore');
process.exit(1);
