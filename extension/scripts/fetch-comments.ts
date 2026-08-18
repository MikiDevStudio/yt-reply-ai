/**
 * Real comments to write prompts against.
 *
 *   npm run comments
 *
 * The prompt in `lib/prompt.ts` was tuned against four comments written by hand
 * in `measure-reply-cost.ts`. They are useful for pricing, where all that
 * matters is token count, and useless for judging whether a reply sounds like a
 * person — invented comments are tidy, and real ones are not: they are typos,
 * inside jokes, three words, timestamps, arguments with someone else in the
 * thread. A reply that reads well against a made-up comment often has nothing
 * to answer when the comment is "0:43 💀".
 *
 * Two sets, because they answer different questions.
 *
 * `volume` is five large channels, picked for the shape of their comment
 * sections rather than their subject. They say what arrives in an inbox.
 *
 * `engaged` is mid-sized channels whose owners still answer their comments,
 * measured rather than assumed: the large ones answer almost nothing, so they
 * cannot show what a human reply looks like. These say what a creator writes
 * back — including how often that is nothing more than "Thank you so much ❤",
 * which is the bar the product has to clear rather than meet.
 *
 * Quota is not a concern: every call here costs 1 unit against a daily 10,000.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Written by real people, on a public repository. See `.gitignore`. */
const outDir = join(root, 'research', 'comments');

// Read the same way `measure-reply-cost.ts` reads its key: parsed here rather
// than exported through a shell, where a secret ends up in the history.
const env = readFileSync(join(root, '.env'), 'utf8');
const apiKey = env.match(/^GOOGLE_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('GOOGLE_API_KEY not found in .env');

interface Source {
  id: string;
  kind: string;
  /**
   * `volume` keeps the replies that ride along with each thread — five of them,
   * enough to see how a room talks. `engaged` pulls every reply on the thread,
   * because the creator's own is the point and it is not always in the first
   * five.
   */
  tier: 'volume' | 'engaged';
}

/**
 * One video per kind of comment section, not per topic.
 *
 * Each leans on a different branch of the reply prompt: the review draws
 * questions and price complaints, the gaming video draws one-liners and
 * timestamps carrying almost nothing to answer, the explainer draws long
 * corrections that tempt a model into inventing a fact to match, and the last
 * is a creator answering criticism, so its threads are full of people
 * disagreeing with him and with each other.
 */
const VOLUME: Source[] = [
  { id: 'BtmUJDueMP4', kind: 'review', tier: 'volume' },
  { id: 'F1-W1oEq1iM', kind: 'opinion', tier: 'volume' },
  { id: 'M3H8u3Y0S-s', kind: 'gaming', tier: 'volume' },
  { id: '6zLCZ_Ic1hI', kind: 'explainer', tier: 'volume' },
  { id: 'c_H6fgh_-7w', kind: 'criticism', tier: 'volume' },
];

/**
 * Channels between roughly 13k and 500k subscribers that answer at least half
 * the threads they get, found by measuring the rate rather than guessing it.
 *
 * The spread of sizes is deliberate. The smallest reply to nearly everything
 * and sound delighted about it; the largest have started to ration, and the
 * rationing is visible in the writing. Somewhere between the two is the voice
 * the product is trying to give back to people who no longer have the time.
 */
const ENGAGED: Source[] = [
  { id: 'HuFVi3q0XBA', kind: 'pc-build', tier: 'engaged' },
  { id: 'iP4kINmWVIw', kind: 'beats', tier: 'engaged' },
  { id: 'uAF-8yiQNOI', kind: 'music-production', tier: 'engaged' },
  { id: '196-smqHUnY', kind: 'arrangement', tier: 'engaged' },
  { id: '0dTv264U1n4', kind: 'fitness', tier: 'engaged' },
  { id: 'lZk4xxjqLp4', kind: 'watercolour', tier: 'engaged' },
  { id: 'bIUsKhWnSa0', kind: '3d-printing', tier: 'engaged' },
  { id: 'HYjo5yDE9no', kind: '3d-printing-small', tier: 'engaged' },
  { id: 'sEdBNNiL0lQ', kind: 'woodworking', tier: 'engaged' },
];

/**
 * Enough to see the patterns repeat, few enough to read in one sitting.
 *
 * The point is to find the handful of comment shapes that keep recurring — the
 * praise, the question, the joke, the complaint — not to measure how often each
 * occurs. Forty threads a video shows every shape several times over.
 */
const THREADS_PER_VIDEO = 40;

interface Comment {
  author: string;
  text: string;
  likes: number;
  publishedAt: string;
  /** True when the author of this comment owns the channel the video is on. */
  isCreator: boolean;
}

interface Thread extends Comment {
  totalReplyCount: number;
  replies: Comment[];
}

interface VideoSet {
  kind: string;
  tier: Source['tier'];
  videoId: string;
  /** Kept because `buildReplyPrompt` feeds all three to the model at L1 and L2. */
  title: string;
  channel: string;
  description: string;
  threads: Thread[];
}

async function api(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey!);

  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    // The message names the missing scope or the disabled API, which is the
    // whole diagnosis. Anything less and the failure looks like a network blip.
    throw new Error(`${path} ${response.status}: ${JSON.stringify(body.error ?? body)}`);
  }
  return body;
}

/**
 * Identify the creator by channel id, never by display name.
 *
 * The name shown on a comment is whatever the account is called today and need
 * not match the channel's title at all — matching on it finds some of the
 * creator's replies and quietly misses the rest, which is the one error this
 * whole set cannot afford.
 */
function toComment(snippet: any, channelId: string): Comment {
  return {
    author: snippet.authorDisplayName ?? '',
    text: snippet.textOriginal ?? snippet.textDisplay ?? '',
    likes: Number(snippet.likeCount) || 0,
    publishedAt: snippet.publishedAt ?? '',
    isCreator: snippet.authorChannelId?.value === channelId,
  };
}

async function fetchVideo({ id, kind, tier }: Source): Promise<VideoSet> {
  const meta = await api('videos', { part: 'snippet', id });
  const snippet = meta.items?.[0]?.snippet;
  if (!snippet) throw new Error(`video ${id} not found or not public`);
  const channelId: string = snippet.channelId;

  const threadsResponse = await api('commentThreads', {
    part: 'snippet,replies',
    videoId: id,
    // YouTube's own default ordering, so these are the threads a user of the
    // extension sees first and is most likely to answer.
    order: 'relevance',
    maxResults: String(THREADS_PER_VIDEO),
    // Otherwise every link and line break arrives as HTML, and the model would
    // be reading markup the extension never sends it.
    textFormat: 'plainText',
  });

  const threads: Thread[] = [];
  for (const item of threadsResponse.items ?? []) {
    const totalReplyCount = Number(item.snippet.totalReplyCount) || 0;
    let replies: Comment[] = (item.replies?.comments ?? []).map((reply: any) =>
      toComment(reply.snippet, channelId),
    );

    // Only where the creator's reply is the thing being collected: `replies` on
    // a thread caps at five, and on a busy thread the owner's answer sits below
    // them.
    if (tier === 'engaged' && totalReplyCount > replies.length) {
      const full = await api('comments', {
        part: 'snippet',
        parentId: item.id,
        maxResults: '100',
        textFormat: 'plainText',
      });
      replies = (full.items ?? []).map((reply: any) => toComment(reply.snippet, channelId));
    }

    threads.push({
      ...toComment(item.snippet.topLevelComment.snippet, channelId),
      totalReplyCount,
      replies,
    });
  }

  return {
    kind,
    tier,
    videoId: id,
    title: snippet.title ?? '',
    channel: snippet.channelTitle ?? '',
    description: snippet.description ?? '',
    threads,
  };
}

/**
 * A readable companion to the JSON.
 *
 * The JSON is what a prompt experiment loads; this is what a person reads to
 * decide which comments are worth experimenting on at all, which is the actual
 * bottleneck. Like counts sit next to each comment because they are the one
 * signal of what a comment section rewards.
 */
function toMarkdown(sets: VideoSet[]): string {
  const lines: string[] = ['# Reference comments', ''];

  for (const set of sets) {
    lines.push(
      `## ${set.kind} — ${set.title}`,
      `${set.channel} · https://youtu.be/${set.videoId} · ${set.threads.length} threads`,
      '',
    );

    for (const thread of set.threads) {
      lines.push(`### ${thread.author} · ${thread.likes} likes · ${thread.totalReplyCount} replies`);
      lines.push('', thread.text.trim(), '');
      for (const reply of thread.replies) {
        const who = reply.isCreator ? `**${reply.author} (creator)**` : `**${reply.author}**`;
        lines.push(`> ${who} (${reply.likes}): ${reply.text.trim().replace(/\n+/g, ' ')}`);
      }
      if (thread.replies.length > 0) lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * The pairs the whole second tier exists for: a comment, and what the person
 * who made the video wrote back.
 *
 * Nothing is filtered out, including the one-word thank-yous. What share of a
 * creator's replies are boilerplate is exactly the question the file is meant
 * to settle, and dropping them would answer it by hand.
 */
function toCreatorMarkdown(sets: VideoSet[]): string {
  const lines: string[] = [
    '# What creators actually write back',
    '',
    'Comment, then the reply from the channel that made the video.',
    '',
  ];

  for (const set of sets) {
    const pairs = set.threads.flatMap((thread) =>
      thread.replies.filter((reply) => reply.isCreator).map((reply) => ({ thread, reply })),
    );
    if (pairs.length === 0) continue;

    lines.push(
      `## ${set.channel} — ${set.title}`,
      `https://youtu.be/${set.videoId} · ${pairs.length} of ${set.threads.length} threads answered`,
      '',
    );

    for (const { thread, reply } of pairs) {
      lines.push(
        `- **${thread.author}** (${thread.likes} likes): ${thread.text.trim().replace(/\n+/g, ' ')}`,
        `  - **creator:** ${reply.text.trim().replace(/\n+/g, ' ')}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

const sets: VideoSet[] = [];
for (const source of [...VOLUME, ...ENGAGED]) {
  const set = await fetchVideo(source);
  const replies = set.threads.reduce((sum, thread) => sum + thread.replies.length, 0);
  const own = set.threads.reduce(
    (sum, thread) => sum + thread.replies.filter((reply) => reply.isCreator).length,
    0,
  );
  console.log(
    `${source.tier.padEnd(8)} ${source.kind.padEnd(18)} ${set.threads.length} threads, ` +
      `${String(replies).padStart(4)} replies, ${String(own).padStart(3)} by the creator — ${set.channel}`,
  );
  sets.push(set);
}

mkdirSync(outDir, { recursive: true });
for (const set of sets) {
  writeFileSync(join(outDir, `${set.kind}.json`), `${JSON.stringify(set, null, 2)}\n`);
}
writeFileSync(join(outDir, 'all.md'), toMarkdown(sets));
writeFileSync(join(outDir, 'creator-replies.md'), toCreatorMarkdown(sets));

const threads = sets.reduce((sum, set) => sum + set.threads.length, 0);
const creatorReplies = sets.reduce(
  (sum, set) =>
    sum +
    set.threads.reduce((n, thread) => n + thread.replies.filter((r) => r.isCreator).length, 0),
  0,
);
console.log(`\n${threads} threads, ${creatorReplies} creator replies — research/comments/`);
