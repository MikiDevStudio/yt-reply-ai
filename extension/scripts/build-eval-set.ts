/**
 * Pick the comments the prompt gets judged on.
 *
 *   npm run eval:set
 *
 * Chosen by shape rather than at random, because the shapes are not evenly
 * distributed and the rare ones are where the prompt fails: a random twenty
 * would be sixteen one-line jokes and would say nothing about what happens when
 * someone writes a paragraph of correction.
 *
 * The result is written once and then left alone — a moving eval set cannot
 * show whether a prompt change helped. Re-run it only to add a shape that is
 * missing, and keep the runs from before and after separate when you do.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'research', 'comments');
const outFile = join(root, 'research', 'eval-set.json');

interface Comment {
  author: string;
  text: string;
  likes: number;
  isCreator: boolean;
}
interface Thread extends Comment {
  totalReplyCount: number;
  replies: Comment[];
}
interface VideoSet {
  kind: string;
  tier: string;
  videoId: string;
  title: string;
  channel: string;
  description: string;
  threads: Thread[];
}

const sets: VideoSet[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

/**
 * The shapes a reply has to handle, and how to recognise one.
 *
 * `wanted` is how many of each to take. Questions are over-sampled against
 * their real 5% share on purpose: they are the case where a wrong answer is
 * worst, so they need more than one example to judge.
 */
const SHAPES: { name: string; wanted: number; match: (t: Thread) => boolean }[] = [
  {
    name: 'question',
    wanted: 4,
    match: (t) => t.text.includes('?') && t.text.length > 25,
  },
  {
    name: 'timestamp',
    wanted: 3,
    match: (t) => /\b\d{1,2}:\d{2}\b/.test(t.text),
  },
  {
    name: 'joke-to-the-room',
    wanted: 4,
    match: (t) =>
      t.likes > 1_000 &&
      !t.text.includes('?') &&
      t.text.length < 90 &&
      /lol|lmao|😂|💀|haha|😭/i.test(t.text),
  },
  {
    name: 'short-praise',
    wanted: 3,
    match: (t) => t.text.length < 55 && /great|love|amazing|thank|best|awesome|perfect/i.test(t.text),
  },
  {
    name: 'correction-or-addition',
    wanted: 3,
    match: (t) =>
      t.text.length > 180 && /actually|should|but |however|wrong|instead|remember/i.test(t.text),
  },
  {
    name: 'disagreement',
    wanted: 3,
    match: (t) =>
      t.text.length > 60 &&
      /disagree|not true|nope|terrible|worst|hate|stop |bad take|ignorant/i.test(t.text),
  },
];

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
  /** What the creator wrote back, where they did. The human answer to beat. */
  creatorReply: string | null;
}

const picks: Pick[] = [];
const used = new Set<string>();

for (const shape of SHAPES) {
  // Spread across videos rather than taking the first four from one comment
  // section, which would test one subject rather than one shape.
  const pool = sets
    .flatMap((set) => set.threads.map((thread) => ({ set, thread })))
    .filter(({ thread }) => !thread.isCreator && !used.has(thread.text) && shape.match(thread))
    .sort((a, b) => b.thread.likes - a.thread.likes);

  const perVideo = new Map<string, number>();
  for (const { set, thread } of pool) {
    if (picks.filter((p) => p.shape === shape.name).length >= shape.wanted) break;
    const seen = perVideo.get(set.videoId) ?? 0;
    if (seen >= 1) continue;
    perVideo.set(set.videoId, seen + 1);
    used.add(thread.text);

    picks.push({
      shape: shape.name,
      videoId: set.videoId,
      kind: set.kind,
      channel: set.channel,
      title: set.title,
      description: set.description,
      commentAuthor: thread.author,
      commentText: thread.text,
      likes: thread.likes,
      creatorReply: thread.replies.find((r) => r.isCreator)?.text ?? null,
    });
  }
}

mkdirSync(dirname(outFile), { recursive: true });
if (existsSync(outFile)) {
  console.log(`${outFile} exists — delete it first if the set is meant to change.`);
} else {
  writeFileSync(outFile, `${JSON.stringify(picks, null, 2)}\n`);
}

for (const shape of SHAPES) {
  const got = picks.filter((p) => p.shape === shape.name);
  const withHuman = got.filter((p) => p.creatorReply).length;
  console.log(`${shape.name.padEnd(24)} ${got.length}/${shape.wanted}  (${withHuman} with a creator reply)`);
}
console.log(`\n${picks.length} comments → research/eval-set.json`);
