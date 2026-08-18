/**
 * Run the current prompt against real comments and measure the result.
 *
 *   npm run eval
 *
 * Everything here mirrors what `background.ts` sends on a first attempt —
 * temperature from the creativity table, `low` reasoning, the same token
 * ceiling, `angleFor(1)` — because an eval that quietly uses different
 * parameters measures a prompt nobody ships.
 *
 * Both context levels are generated for every comment. Level 0 is the default
 * a new install has, level 2 is what the popover offers, and the gap between
 * them is the argument for or against changing that default.
 *
 * The numbers at the end are compared against the 88 replies real creators
 * wrote in `research/comments/creator-replies.md`. That comparison is the whole
 * point: "does this sound human" is not a measurable question, but "is this
 * three times longer than what a person would have written" is.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamCompletion } from '../lib/openrouter/client';
import { MODEL_PRESETS } from '../lib/models';
import { angleFor, buildReplyPrompt, creativityPreset } from '../lib/prompt';
import { DEFAULT_PROFILE, renderSoul } from '../lib/soul';
import type { ContextLevel } from '../lib/settings';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(root, '.env'), 'utf8');
const apiKey = env.match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('OPENROUTER_API_KEY not found in .env');

/** The settings a fresh install runs with. See `lib/settings.ts`. */
const DEFAULTS = {
  style: 'auto',
  creativity: 3,
  audience: 'owner' as const,
  attempt: 1,
};

/** As `background.ts` sets them for a first attempt. */
const REPLY_TOKEN_CEILING = 2_500;
const REASONING = 'low' as const;

interface Pick {
  shape: string;
  videoId: string;
  kind: string;
  channel: string;
  title: string;
  description: string;
  commentAuthor: string;
  commentText: string;
  likes: number;
  creatorReply: string | null;
}

const picks: Pick[] = JSON.parse(readFileSync(join(root, 'research', 'eval-set.json'), 'utf8'));

/**
 * A profile per channel, of the length someone actually types.
 *
 * Written from what the channel's own video says it is, and no longer than the
 * box invites — a profile crafted for the eval would flatter the prompt, since
 * most of what makes a reply land would be coming from the profile rather than
 * from anything being tested.
 */
const ABOUT: Record<string, string> = {
  Mrwhosetheboss: 'I make consumer tech videos — phone comparisons, gadgets, big-budget experiments.',
  'Joe Bartolozzi': 'I make comedy videos where I talk to people live and react to their takes.',
  Markiplier: 'I play horror games and narrate them loudly. Been doing it for years.',
  Nexpo: 'I make long-form documentaries about internet mysteries and disturbing online stories.',
  theneedledrop: 'I review albums and talk about music criticism. Opinionated, and fine with argument.',
  PixelAssembly: 'I build PCs on camera with no music and no talking, just the sounds of the build.',
  Dirkey: 'I make beats and fix beats my subscribers send in.',
  'Jay Cactus TV': 'I teach music production — melodies, chords, arrangement.',
  Minosaur: 'I teach arrangement and mixing from twenty years of making records.',
  'GMB Fitness (Praxis)': 'I coach bodyweight strength and mobility. Form and progressions, not hype.',
  'Niaz Hannan Watercolors': 'I paint watercolours and teach the techniques behind them.',
  'The Next Layer': 'I test 3D printing filaments and publish what the results actually show.',
  'PRINTING PERSPECTIVE': 'I share 3D printing tips from what I use myself, no filler.',
  'OMOR CONSTRUCTION': 'I build furniture and outdoor woodworking projects, start to finish.',
};

function soulFor(channel: string): string {
  return renderSoul({ ...DEFAULT_PROFILE, about: ABOUT[channel] ?? '' });
}

async function generate(pick: Pick, level: ContextLevel): Promise<string> {
  const preset = creativityPreset(DEFAULTS.creativity + DEFAULTS.attempt - 1);

  const messages = buildReplyPrompt({
    context: {
      commentText: pick.commentText,
      commentAuthor: pick.commentAuthor,
      isReply: false,
      video: {
        videoId: pick.videoId,
        title: pick.title,
        channel: pick.channel,
        description: pick.description,
      },
    },
    soul: soulFor(pick.channel),
    style: DEFAULTS.style,
    level,
    audience: DEFAULTS.audience,
    creativity: preset.level,
    angle: angleFor(DEFAULTS.attempt),
  });

  const stream = streamCompletion({
    apiKey: apiKey!,
    model: MODEL_PRESETS.balanced,
    messages,
    maxTokens: REPLY_TOKEN_CEILING,
    temperature: preset.temperature,
    reasoningEffort: REASONING,
  });

  let next = await stream.next();
  while (!next.done) next = await stream.next();
  return next.value.text.trim();
}

/**
 * What the 88 creator replies measured at, for the same statistics.
 *
 * Hard-coded rather than recomputed so a run is comparable to the ones before
 * it even after the comment set grows. Re-measure and update deliberately.
 */
const HUMAN = {
  medianLength: 54,
  shorterThanComment: 55,
  askedQuestion: 17,
  openedWithThanks: 19,
  usedEmoji: 52,
};

interface Row {
  pick: Pick;
  byLevel: Record<number, string>;
}

const rows: Row[] = [];
let done = 0;

for (const pick of picks) {
  const byLevel: Record<number, string> = {};
  for (const level of [0, 2] as ContextLevel[]) {
    byLevel[level] = await generate(pick, level);
  }
  rows.push({ pick, byLevel });
  done++;
  process.stdout.write(`\r${done}/${picks.length} comments`);
}
process.stdout.write('\n\n');

function stats(replies: { reply: string; comment: string }[]) {
  const lengths = replies.map((r) => r.reply.length).sort((a, b) => a - b);
  const share = (n: number) => Math.round((n / replies.length) * 100);
  return {
    medianLength: lengths[Math.floor(lengths.length / 2)] ?? 0,
    shorterThanComment: share(replies.filter((r) => r.reply.length < r.comment.length).length),
    askedQuestion: share(replies.filter((r) => r.reply.includes('?')).length),
    openedWithThanks: share(replies.filter((r) => /^[\s\W]*(thank|thanks)/i.test(r.reply)).length),
    usedEmoji: share(
      replies.filter((r) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2764}]/u.test(r.reply)).length,
    ),
  };
}

const table: string[] = [];
for (const level of [0, 2]) {
  const s = stats(rows.map((r) => ({ reply: r.byLevel[level]!, comment: r.pick.commentText })));
  console.log(`level ${level}:`, s);
  table.push(
    `| L${level} | ${s.medianLength} | ${s.shorterThanComment}% | ${s.askedQuestion}% | ${s.openedWithThanks}% | ${s.usedEmoji}% |`,
  );
}
console.log('humans: ', HUMAN);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(root, 'research', 'eval-runs');
mkdirSync(outDir, { recursive: true });

const md = [
  `# Prompt run — ${stamp}`,
  '',
  `Model \`${MODEL_PRESETS.balanced}\`, creativity ${DEFAULTS.creativity}, style \`${DEFAULTS.style}\`, ` +
    `audience \`${DEFAULTS.audience}\`, attempt ${DEFAULTS.attempt}, reasoning \`${REASONING}\`.`,
  '',
  '| | median chars | shorter than comment | asked a question | opened with thanks | emoji |',
  '|---|---|---|---|---|---|',
  ...table,
  `| **humans** | **${HUMAN.medianLength}** | **${HUMAN.shorterThanComment}%** | **${HUMAN.askedQuestion}%** | ` +
    `**${HUMAN.openedWithThanks}%** | **${HUMAN.usedEmoji}%** |`,
  '',
  ...rows.flatMap(({ pick, byLevel }) => [
    `## ${pick.shape} — ${pick.channel}`,
    '',
    `**${pick.commentAuthor}** (${pick.likes} likes): ${pick.commentText.replace(/\n+/g, ' ')}`,
    '',
    pick.creatorReply
      ? `**The creator actually wrote:** ${pick.creatorReply.replace(/\n+/g, ' ')}`
      : '_The creator did not answer this one._',
    '',
    `- **L0:** ${byLevel[0]!.replace(/\n+/g, ' ')}`,
    `- **L2:** ${byLevel[2]!.replace(/\n+/g, ' ')}`,
    '',
  ]),
].join('\n');

writeFileSync(join(outDir, `${stamp}.md`), md);
console.log(`\nresearch/eval-runs/${stamp}.md`);
