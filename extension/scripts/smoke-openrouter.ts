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
import { describeFailure, type FailureKind } from '../lib/failure';
import { fetchKeyInfo, fetchModels, isDegenerate, streamCompletion } from '../lib/openrouter/client';
import { OpenRouterError, secondsUntilRetry } from '../lib/openrouter/errors';
import { MODEL_PRESETS } from '../lib/models';
import {
  AUTO,
  BUILT_IN,
  LIMITS,
  readPresets,
  selectedPreset,
  toneFor,
  visiblePresets,
} from '../lib/presets';
import { angleFor, buildReplyPrompt } from '../lib/prompt';

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

// The picker shows this list in the order it arrives and prices our presets
// from it. Both assumptions fail silently: a renamed sort parameter is ignored
// rather than rejected, and a withdrawn preset leaves a row with no price.
check(
  'the list is not truncated by the default page size',
  models.length !== 500,
  `${models.length} back — 500 exactly would mean limit=1000 was ignored`,
);
for (const preset of Object.values(MODEL_PRESETS)) {
  check(`preset ${preset} is still offered`, models.some((m) => m.id === preset));
}

console.log('\n  Free models (first 12):');
for (const model of free.slice(0, 12)) {
  console.log(`    ${model.id}  (${model.contextLength} ctx)`);
}
console.log();

// 3. Streaming — the interesting one. Verifies that comment lines and the
// [DONE] sentinel are handled, deltas arrive incrementally, and usage lands in
// the final chunk when `usage: { include: true }` is sent.
//
// Through our own free preset rather than whatever the catalogue lists first:
// that id is what a user without credits is handed, and a free variant can be
// throttled upstream to the point of answering nothing at all. When this fails
// with `rate_limited`, the preset needs replacing.
const model = MODEL_PRESETS.free;
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

// 6. Failure mapping and copy. A 429 cannot be provoked politely — the account
// limit takes 20 requests in a minute to reach — so the two shapes below are
// bodies captured from the live API, replayed through the same parser. The
// timestamps are refreshed so the "try again in" arithmetic stays checkable.
const providerLimit = JSON.stringify({
  error: {
    message: 'Provider returned error',
    code: 429,
    metadata: {
      raw: 'google/gemma-4-31b-it:free is temporarily rate-limited upstream.',
      provider_name: 'Google AI Studio',
      is_byok: false,
      provider_error_code: '429',
      limit_source: 'upstream_provider_shared_pool',
    },
  },
});

const accountLimit = JSON.stringify({
  error: {
    message: 'Rate limit exceeded: free-models-per-min. ',
    code: 429,
    metadata: {
      headers: {
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Date.now() + 45_000),
      },
      limit_source: 'openrouter_free_tier_per_minute',
      provider_name: null,
    },
  },
});

const upstream = OpenRouterError.fromResponse(429, providerLimit);
check('an upstream 429 is recognised as the provider’s', upstream.limitSource === 'provider');

const account = OpenRouterError.fromResponse(429, accountLimit);
check('an account 429 is recognised as the per-minute cap', account.limitSource === 'per-minute');
check(
  'the reset is read from the body, where a 429 actually carries it',
  account.retryAfterSeconds !== undefined && Math.abs(account.retryAfterSeconds - 45) <= 1,
  `${account.retryAfterSeconds}s`,
);

// The padding run is what google/gemma-4-26b-a4b-it:free answered a
// three-sentence prompt with: 32,829 tokens of it, finish_reason "length".
check('a run of padding tokens is not an answer', isDegenerate('<pad>'.repeat(200)));
check(
  'a looping model is not an answer',
  isDegenerate('thank you so much '.repeat(60)),
  'one phrase, sixty times',
);
check(
  'a real reply is left alone',
  !isDegenerate(
    'Thanks for watching! The audio really was rough in that one — I recorded it on the ' +
      'road with a borrowed mic, and by the time I noticed the hum it was too late to redo ' +
      'the take. The next few are back on the usual setup, so it should sound like it used ' +
      'to. Appreciate you sticking with it through the subtitles, and let me know if the ' +
      'levels are any better in the latest one.',
  ),
);

const midStream = OpenRouterError.fromStreamError({ code: 429, message: 'Rate limit exceeded' });
check('a 429 inside the stream keeps its kind', midStream.kind === 'rate_limited', midStream.kind);

const codeless = OpenRouterError.fromStreamError({ message: 'provider went away' });
check('a stream error with no code falls back to upstream', codeless.kind === 'upstream');

// The HTTP headers are the fallback path: the API sent none on a real 429, but
// the reference documents them and a gateway in front may add them back.
check('retry-after is used as given', secondsUntilRetry(new Headers({ 'retry-after': '30' })) === 30);
check(
  'a reset in plain seconds is taken as a delay',
  secondsUntilRetry(new Headers({ 'x-ratelimit-reset': '45' })) === 45,
);

const inTwoMinutes = secondsUntilRetry(
  new Headers({ 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) }),
);
check(
  'a reset as epoch seconds becomes a delay',
  inTwoMinutes !== undefined && Math.abs(inTwoMinutes - 120) <= 1,
  `${inTwoMinutes}s`,
);

check(
  'a reset already past is dropped rather than shown as a negative wait',
  secondsUntilRetry(new Headers({ 'x-ratelimit-reset': String(Date.now() - 5_000) })) === undefined,
);

// Nothing that arrives from outside — a comment, a description, a profile, the
// attempts already turned down — may decide how large the prompt gets. Fed the
// worst input in every slot at once, it still has to come out bounded.
const flood = 'x'.repeat(50_000);
const stuffed = buildReplyPrompt({
  context: {
    commentText: flood,
    commentAuthor: '@someone',
    isReply: true,
    parent: { text: flood, author: '@someone-else' },
    video: { videoId: 'abc12345678', title: flood, channel: flood, description: flood },
  },
  soul: flood,
  tone: toneFor(null, 'auto'),
  level: 2,
  audience: 'owner',
  note: flood,
  creativity: 3,
  angle: angleFor(1),
  previous: Array.from({ length: 20 }, () => flood),
});

const promptChars = stuffed.reduce((total, message) => total + message.content.length, 0);
check(
  'no input can blow the prompt up',
  promptChars < 12_000,
  `${promptChars} chars from 50k in every field`,
);

// The promise in #15 is that no failure reaches the user without a message and
// something to press. TypeScript enforces the table being total; this enforces
// the entries being useful.
const KINDS: FailureKind[] = [
  'unauthorized',
  'key_exhausted',
  'no_credits',
  'rate_limited',
  'invalid_request',
  'upstream',
  'network',
  'offline',
  'empty',
  'filtered',
  'runaway',
  'timeout',
  'interrupted',
];
for (const kind of KINDS) {
  const described = describeFailure({ kind });
  check(
    `${kind} has a message and a next step`,
    described.title.length > 0 && described.actions.length > 0,
  );
}

const dayCap = describeFailure({
  kind: 'rate_limited',
  rateLimit: { modelIsFree: true, hasPaid: false, source: 'per-day' },
  retryAfterSeconds: 90,
});
check(
  'the free daily cap is named, with when it lifts',
  Boolean(dayCap.detail?.includes('50 a day') && dayCap.detail.includes('2 min')),
  dayCap.detail,
);

// The failure that started this: a model refusing from the shared pool used to
// be reported as the account's own limit, which sent the user off to wait out a
// day that had nothing to do with it.
const throttled = describeFailure({
  kind: 'rate_limited',
  rateLimit: { modelIsFree: true, hasPaid: null, source: 'provider' },
});
check(
  'an upstream refusal is not blamed on the account',
  !throttled.detail?.includes('a day') && throttled.actions[0]?.kind === 'options',
  throttled.detail,
);

const perMinute = describeFailure({
  kind: 'rate_limited',
  rateLimit: { modelIsFree: true, hasPaid: true, source: 'per-minute' },
  retryAfterSeconds: 20,
});
check(
  'the per-minute cap says to wait, not to switch models',
  perMinute.actions.length === 1 && perMinute.actions[0]?.kind === 'retry',
  perMinute.detail,
);

// The preset row is the user's to edit (#6), and three of its rules are load
// bearing rather than cosmetic. TypeScript cannot express any of them.
//
// `auto` first: it is the row's off switch, and the line it used to send —
// "match the tone of the comment" — measured as dead weight, changing neither
// reply length nor how often a reply restated the comment. Nothing may give it
// text back, and nothing may hide it, because a row with no chips has no way to
// choose anything.
check('auto adds nothing to the prompt', toneFor(null, AUTO) === '');
check(
  'auto cannot be given a line back',
  toneFor({ edits: { [AUTO]: { text: 'Match the tone of the comment.' } } }, AUTO) === '',
);
check(
  'auto cannot be hidden out of the row',
  readPresets({ hidden: [AUTO] }).find((preset) => preset.id === AUTO)?.hidden === false,
);

// A selection outlives the preset it names — hidden on another machine, deleted
// here while a popover was open. Both resolve to no tone and to a row with
// exactly one chip lit, rather than to a dangling id nobody can see.
check('a hidden preset sends nothing', toneFor({ hidden: ['friendly'] }, 'friendly') === '');
check('a deleted selection falls back to auto', selectedPreset(null, 'gone') === AUTO);
check(
  'a hidden selection falls back to auto',
  selectedPreset({ hidden: ['brief'] }, 'brief') === AUTO,
);

// The overlay stores deviations, so restoring a built-in is deleting a key —
// and a preset edited back to its shipped wording stops offering a restore.
const tweaked = readPresets({ edits: { brief: { text: 'One line, no more.' } } });
check(
  'an edit applies and can be restored',
  tweaked.find((preset) => preset.id === 'brief')?.edited === true &&
    tweaked.find((preset) => preset.id === 'friendly')?.edited === false,
);

// An order written by an older build must not swallow a preset a newer one
// ships: unlisted ids follow the listed ones instead of disappearing.
const partial = readPresets({ order: ['brief', AUTO] });
check(
  'an order from an older build still shows every preset',
  partial.length === BUILT_IN.length && partial[0]?.id === 'brief',
  partial.map((preset) => preset.id).join(','),
);

// Every preset line is billed on every reply it is used for, and the whole row
// has to fit `chrome.storage.sync`'s 8 KB per item. The caps are what keep both
// true, so they are checked against the budget rather than trusted.
const maxed = {
  edits: Object.fromEntries(
    BUILT_IN.filter((preset) => preset.id !== AUTO).map((preset) => [
      preset.id,
      { name: 'n'.repeat(LIMITS.name), text: 't'.repeat(LIMITS.text) },
    ]),
  ),
  custom: Array.from({ length: LIMITS.presets - BUILT_IN.length }, (_, index) => ({
    id: `c${index}`,
    name: 'n'.repeat(LIMITS.name),
    text: 't'.repeat(LIMITS.text),
  })),
};
const rowBytes = new TextEncoder().encode(JSON.stringify(maxed)).length;
check('a row filled to every cap still fits sync', rowBytes < 8192, `${rowBytes} bytes`);
check(
  'the shipped presets stay inside the caps they set',
  BUILT_IN.every(
    (preset) => preset.text.length <= LIMITS.text && preset.name.length <= LIMITS.name,
  ),
);
check(
  'every visible preset has a label to press',
  visiblePresets(null).every((preset) => preset.name.trim().length > 0),
);

// A trial key that has spent its allowance answers 403, the same status as a
// key that was deleted. Read as the latter, the end of the trial tells people
// their key was revoked and sends them to reconnect one that is working fine.
const exhausted = OpenRouterError.fromResponse(
  403,
  JSON.stringify({ error: { message: 'Key limit exceeded (total limit)', code: 403 } }),
);
check(
  'an exhausted key is not read as a revoked one',
  exhausted.kind === 'key_exhausted',
  exhausted.kind,
);

const revoked = OpenRouterError.fromResponse(
  403,
  JSON.stringify({ error: { message: 'No auth credentials found' } }),
);
check(
  'a 403 that is not about a limit stays unauthorized',
  revoked.kind === 'unauthorized',
  revoked.kind,
);

// The third meaning of 403, and the one that used to arrive as the first: a
// comment refused by moderation was reported as a revoked key, which sent
// somebody to reconnect a key that had never stopped working.
const moderated = OpenRouterError.fromResponse(
  403,
  JSON.stringify({
    error: {
      message: 'Input was flagged by moderation',
      code: 403,
      metadata: { reasons: ['harassment'], flagged_input: 'you are...', model_slug: 'openai/gpt' },
    },
  }),
);
check(
  'a flagged comment is not read as a revoked key',
  moderated.kind === 'filtered' && moderated.filter?.side === 'comment',
  `${moderated.kind} / ${moderated.filter?.side}`,
);

// The two sides of a filter share a kind and nothing else. One is answered by
// changing model; the other is answered by changing model and nothing at all
// is answered by pressing retry, because the same comment is refused every
// time it is sent.
const inbound = describeFailure({
  kind: 'filtered',
  filtered: { side: 'comment', reasons: ['harassment'] },
});
const outbound = describeFailure({ kind: 'filtered', filtered: { side: 'reply' } });
check(
  'a comment stopped on the way in offers no retry',
  !inbound.actions.some((action) => action.kind === 'retry'),
  inbound.actions.map((a) => a.label).join(', '),
);
check(
  'the category is named when moderation named one',
  Boolean(inbound.detail?.includes('harassment')),
  inbound.detail,
);
check(
  'the two sides of a filter are not told as the same failure',
  inbound.title !== outbound.title && outbound.actions.some((a) => a.kind === 'retry'),
  outbound.title,
);
// The screen this replaced. `empty` is a model that produced nothing and had no
// reason to; saying that about a filter blames the wrong thing and sends people
// to retry a comment that will be refused again.
const silent = describeFailure({ kind: 'empty' });
check(
  'a filter is not described as a model that went quiet',
  silent.title !== outbound.title && !silent.detail?.includes('filter'),
  silent.title,
);

// Whose key ran out decides the whole message: ours is the trial ending exactly
// as designed, theirs is a cap they set themselves on openrouter.ai.
const trialOver = describeFailure({ kind: 'key_exhausted', keyIsOurs: true });
const theirsOver = describeFailure({ kind: 'key_exhausted', keyIsOurs: false });
check(
  'the trial ending is told as the trial ending',
  trialOver.title !== theirsOver.title && trialOver.actions[0]?.kind === 'options',
  trialOver.title,
);
// Every card that ends in "you need a key" leads with our own authorise flow.
// A link to openrouter.ai's key list is the wrong first step for the majority
// case — someone who has never opened that page and has nothing listed on it.
check(
  'a key that is not ours leads with authorising, not with a page of keys',
  theirsOver.actions[0]?.kind === 'options' && theirsOver.actions[1]?.kind === 'link',
  theirsOver.actions.map((a) => a.label).join(', '),
);

const neverConnected = describeFailure({ kind: 'unauthorized', hadKey: false });
check(
  'nobody is asked to re-do something they have never done',
  neverConnected.actions[0]?.label === 'Connect OpenRouter',
  neverConnected.actions[0]?.label,
);

// The first run (#35). A card that ends in "go and make an account" while a
// free trial sits unclaimed is the form the trial was built to replace, and
// the offer has to lead — a second button is not an offer.
const firstRun = describeFailure({ kind: 'unauthorized', hadKey: false, trialAvailable: true });
check(
  'a first run is offered the trial, and offered it first',
  firstRun.actions[0]?.kind === 'trial' && firstRun.actions[1]?.kind === 'options',
  firstRun.title,
);

// The other direction matters as much: a trial nobody can claim, named in the
// one message they cannot get past, is worse than never mentioning it.
const noTrialLeft = describeFailure({ kind: 'unauthorized', hadKey: false, trialAvailable: false });
check(
  'a trial that cannot be claimed is never mentioned',
  !noTrialLeft.actions.some((action) => action.kind === 'trial') &&
    !/free|trial/i.test(`${noTrialLeft.title} ${noTrialLeft.detail ?? ''}`),
  noTrialLeft.title,
);

// Neither of the two trial cards is a fault, and the frame has to agree with
// the words in it: an offer drawn in the error box says "broken" before anyone
// has read a line of it, and it is the first thing a new install shows.
check(
  'the trial offer and the trial ending are not drawn as faults',
  firstRun.tone === 'notice' && trialOver.tone === 'notice',
  `${firstRun.tone} / ${trialOver.tone}`,
);
check(
  'an actual fault keeps the error frame',
  noTrialLeft.tone === undefined && theirsOver.tone === undefined,
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
