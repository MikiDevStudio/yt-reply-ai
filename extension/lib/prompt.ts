import type { GenerationContext } from './messaging';
import type { ChatMessage } from './openrouter/types';
import type { ContextLevel } from './settings';

/**
 * Tone presets, layered on top of the user's soul profile rather than replacing
 * it. The profile says who they are; the preset says how loud to be right now.
 */
export const STYLES: Record<string, string> = {
  auto: 'Match the tone of the comment you are answering.',
  friendly: 'Be warm and welcoming.',
  humorous: 'Be light-hearted. Land the joke without forcing it.',
  engaging: 'Invite a reply. Ask something worth answering.',
  brief: 'Answer in one short sentence.',
};

interface BuildOptions {
  context: GenerationContext;
  soul: string;
  style: string;
  level: ContextLevel;
}

/**
 * Assemble the messages for a reply.
 *
 * Ordering is deliberate: the parts that stay constant across every comment on
 * a video — voice, style, video metadata — go first, so they form a stable
 * prefix that prompt caching can reuse (#8). The comment itself, which changes
 * every time, goes last.
 */
export function buildReplyPrompt({ context, soul, style, level }: BuildOptions): ChatMessage[] {
  const system = [
    'You write replies to YouTube comments on behalf of the channel owner.',
    'Reply in the same language as the comment.',
    'Write only the reply text. No greetings block, no signature, no quotes around it.',
    'Keep it to one to three sentences unless the comment clearly needs more.',
  ];

  if (soul.trim()) {
    system.push('', 'Voice and rules to follow:', soul.trim());
  }

  const styleHint = STYLES[style] ?? STYLES.auto;
  system.push('', `Tone for this reply: ${styleHint}`);

  // L1 and above add video context. It is constant per video, so it belongs in
  // the cacheable prefix rather than in the user turn.
  if (level >= 1 && context.video) {
    system.push(
      '',
      'The comment is on this video:',
      `Title: ${context.video.title}`,
      `Channel: ${context.video.channel}`,
    );

    // L2 adds the description. Same reasoning, one tier down in cost: it is the
    // largest constant part of the prompt and the only one big enough to bring
    // a prefix near the 1024-token minimum providers need for caching.
    if (level >= 2 && context.video.description) {
      system.push('', 'Video description:', context.video.description);
    }
  }

  const user = [
    context.isReply
      ? 'Reply to this comment in an existing thread:'
      : 'Reply to this top-level comment:',
    '',
  ];

  // The thread's opening comment, at L1 and up. It changes from thread to
  // thread, so it goes in the user turn rather than the cacheable prefix.
  if (level >= 1 && context.parent) {
    user.push(
      context.parent.author
        ? `The thread started with ${context.parent.author} writing:`
        : 'The thread started with:',
      context.parent.text,
      '',
      'Answering this reply to it:',
    );
  }

  user.push(
    context.commentAuthor ? `${context.commentAuthor} wrote:` : 'The commenter wrote:',
    context.commentText,
  );

  return [
    { role: 'system', content: system.join('\n') },
    { role: 'user', content: user.join('\n') },
  ];
}
