/**
 * Exercise the OpenRouter client against the live API.
 *
 * Not a unit test — the point is to check our assumptions about a third-party
 * API against the API itself, rather than against its documentation. Run it
 * whenever the client changes:
 *
 *   npm run smoke
 *
 * Reads OPENROUTER_API_KEY from the repo-root .env. That key is for development
 * only and must never be referenced from extension source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchKeyInfo, fetchModels, streamCompletion } from '../lib/openrouter/client';
import { OpenRouterError } from '../lib/openrouter/errors';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadApiKey(): string {
  const env = readFileSync(join(root, '.env'), 'utf8');
  const match = env.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!match?.[1]) throw new Error('OPENROUTER_API_KEY not found in .env');
  return match[1].trim();
}

const apiKey = loadApiKey();
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// 1. Key info — confirms auth works and the response shape matches KeyInfo.
const info = await fetchKeyInfo(apiKey);
check('GET /key returns usage', typeof info.usage === 'number', `usage=${info.usage}`);
check(
  'GET /key reports tier and remaining',
  typeof info.isFreeTier === 'boolean',
  `freeTier=${info.isFreeTier} remaining=${info.limitRemaining}`,
);

// 2. Models — confirms the list is reachable and tells us which free models
// currently exist, so the default model is chosen from reality, not memory.
const models = await fetchModels();
const free = models.filter((m) => m.isFree);
check('GET /models returns a list', models.length > 0, `${models.length} models`);
check('free variants exist', free.length > 0, `${free.length} free`);
console.log('\n  Free models (first 12):');
for (const model of free.slice(0, 12)) {
  console.log(`    ${model.id}  (${model.contextLength} ctx)`);
}
console.log();

// 3. Streaming — the interesting one. Verifies that comment lines and the
// [DONE] sentinel are handled, deltas arrive incrementally, and usage lands in
// the final chunk when `usage: { include: true }` is sent.
const model = free[0]?.id ?? models[0]?.id;
if (!model) throw new Error('No models available to test against');
console.log(`  Streaming from ${model}...`);

const stream = streamCompletion({
  apiKey,
  model,
  messages: [
    { role: 'system', content: 'Reply in exactly five words.' },
    { role: 'user', content: 'Say hello to a YouTube commenter.' },
  ],
  maxTokens: 64,
});

let deltas = 0;
let next = await stream.next();
while (!next.done) {
  deltas++;
  next = await stream.next();
}
const result = next.value;

check('stream produced deltas', deltas > 0, `${deltas} chunks`);
check('assembled text is non-empty', result.text.trim().length > 0, JSON.stringify(result.text));
check('finish reason reported', Boolean(result.finishReason), result.finishReason);
check(
  'usage returned in final chunk',
  Boolean(result.usage),
  result.usage ? `${result.usage.totalTokens} tokens, cost=${result.usage.cost}` : 'missing',
);

// 4. Error mapping — a deliberately bad key must surface as `unauthorized`,
// not as a generic failure.
try {
  await fetchKeyInfo('sk-or-v1-definitely-not-a-real-key');
  check('bad key rejected', false, 'request unexpectedly succeeded');
} catch (error) {
  const kind = error instanceof OpenRouterError ? error.kind : 'not-an-OpenRouterError';
  check('bad key maps to unauthorized', kind === 'unauthorized', `kind=${kind}`);
}

// 5. Cancellation — aborting must surface as `aborted` rather than a network
// error, so the UI can stay silent instead of showing a failure.
const controller = new AbortController();
const cancellable = streamCompletion({
  apiKey,
  model,
  messages: [{ role: 'user', content: 'Count slowly from one to two hundred.' }],
  signal: controller.signal,
});
try {
  await cancellable.next();
  controller.abort();
  while (!(await cancellable.next()).done) {
    // Drain until the abort surfaces.
  }
  check('abort surfaces as aborted', false, 'stream finished without throwing');
} catch (error) {
  const kind = error instanceof OpenRouterError ? error.kind : 'not-an-OpenRouterError';
  check('abort surfaces as aborted', kind === 'aborted', `kind=${kind}`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
