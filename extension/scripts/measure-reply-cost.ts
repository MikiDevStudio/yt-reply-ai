/**
 * What one reply actually costs, at the reasoning effort the product sends.
 *
 *   npm run measure
 *
 * It exists because the figure in `lib/models.ts` was measured at `minimal`
 * reasoning, and `reasoningFor` in background.ts sends `low` — four times the
 * price, which mattered the moment we started paying for replies ourselves in
 * the trial (#38). Anything that quotes a price per reply — the trial's spend
 * limit, the landing page, the onboarding copy — should quote this, and should
 * be re-run when the model or the prompt changes.
 *
 * Four comments, chosen to span what the prompt does: praise takes the short
 * branch, a question makes the model think, and a Russian one pays for a
 * different tokeniser.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamCompletion } from '../lib/openrouter/client';
import { MODEL_PRESETS } from '../lib/models';
import { angleFor, buildReplyPrompt } from '../lib/prompt';
import { DEFAULT_PROFILE, renderSoul } from '../lib/soul';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(root, '.env'), 'utf8');
const apiKey = env.match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('OPENROUTER_API_KEY not found in .env');

const soul = renderSoul({
  ...DEFAULT_PROFILE,
  about: 'I make videos about home espresso — gear reviews, dialling in, and the occasional rant about overpriced grinders.',
});

const comments = [
  { commentText: 'Great video, learned a lot!', commentAuthor: '@marta' },
  {
    commentText:
      'The audio was rough in this one, hard to hear you over the grinder. Otherwise good stuff.',
    commentAuthor: '@dan_k',
  },
  {
    commentText: 'What grind size do you use for the 9 bar shots? Mine keeps choking the machine.',
    commentAuthor: '@espressonoob',
  },
  { commentText: 'первый! спасибо за видео, очень полезно', commentAuthor: '@nikita' },
];

const video = {
  videoId: 'abc123',
  title: 'The $200 grinder that beats the $900 one',
  channel: 'Pressure Profile',
  description:
    'A side by side of two grinders across twelve shots, same beans, same dose. Timestamps in the pinned comment.',
};

let total = 0;
let runs = 0;

for (const comment of comments) {
  const messages = buildReplyPrompt({
    context: { ...comment, isReply: false, video },
    soul,
    style: 'auto',
    level: 2,
    audience: 'owner',
    creativity: 3,
    angle: angleFor(1),
  });

  const stream = streamCompletion({
    apiKey,
    model: MODEL_PRESETS.balanced,
    messages,
    maxTokens: 2_500,
    temperature: 0.8,
    reasoningEffort: 'low',
  });

  let next = await stream.next();
  while (!next.done) next = await stream.next();
  const { text, usage } = next.value;

  const cost = usage?.cost ?? 0;
  total += cost;
  runs++;
  console.log(
    `$${cost.toFixed(6)}  in=${usage?.promptTokens} out=${usage?.completionTokens}  ${JSON.stringify(text.slice(0, 70))}`,
  );
}

const mean = total / runs;
console.log(`\nmean $${mean.toFixed(6)} per reply over ${runs} runs`);
for (const limit of [0.01, 0.02, 0.03, 0.05]) {
  console.log(`  limit ${limit.toFixed(2)} → ${Math.floor(limit / mean)} replies`);
}
