import type { GenerationContext } from './messaging';
import type { ChatMessage } from './openrouter/types';
import type { Audience, ContextLevel } from './settings';

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

/**
 * How far the model may stray, as five presets of our own.
 *
 * Each level carries both an instruction and the temperature that goes with it,
 * because neither works alone. Telling a model to be bolder does not change its
 * sampling distribution — it still reaches for the most probable opening words —
 * and raising the temperature without saying what to do with the room produces
 * noise rather than wit. The pairing is what the earlier prototype got right:
 * every template there had its own prompt *and* its own temperature.
 *
 * The table is ours rather than a raw parameter exposed to the user, so a level
 * can be retuned without anyone relearning what "0.9" meant.
 */
export const CREATIVITY = [
  {
    level: 1,
    label: 'Plain',
    instruction: 'Answer plainly. The obvious, expected reply is the right one.',
    temperature: 0.4,
  },
  {
    level: 2,
    label: 'Grounded',
    instruction: 'Stay close to the point. A small personal detail is welcome.',
    temperature: 0.7,
  },
  {
    level: 3,
    label: 'Natural',
    instruction: 'Say it in your own words, not the expected phrasing.',
    temperature: 0.9,
  },
  {
    level: 4,
    label: 'Inventive',
    instruction: 'Find an angle the commenter did not expect. Avoid the obvious opener.',
    temperature: 1.1,
  },
  {
    level: 5,
    label: 'Bold',
    instruction: 'Be bold: a joke, a sharp turn, an unexpected detail. Never generic.',
    temperature: 1.3,
  },
] as const;

export type CreativityLevel = (typeof CREATIVITY)[number];

/** Clamp to the table, since the level is raised per attempt and can run off the end. */
export function creativityPreset(level: number): CreativityLevel {
  const index = Math.min(Math.max(Math.round(level), 1), CREATIVITY.length) - 1;
  // The clamp makes the lookup safe; the fallback is what convinces the compiler,
  // which cannot see that, and lands on the middle of the table if it is ever wrong.
  return CREATIVITY[index] ?? CREATIVITY[2];
}

/**
 * A different route through the same comment, one per attempt.
 *
 * Temperature widens the spread around one answer; it does not make the model
 * take a different approach. Handing each attempt an explicit move is what makes
 * the second try a genuine alternative rather than the first one reworded.
 *
 * `direct` is first because for most comments the straight answer really is the
 * best one — the deck exists for when it is not.
 */
export const ANGLES = [
  'Answer straight. No detour.',
  'Bring in a detail from behind the scenes — how it was made, what it cost, what nearly went wrong.',
  'Turn it around: answer, then ask them something specific that is worth answering.',
  'Find the humour in it. A joke that lands, not a joke that tries.',
  'Take the less obvious side of it, politely. Say the thing the commenter did not expect to hear.',
] as const;

/** Cycle the deck, so a fourth press does not repeat the third. */
export function angleFor(attempt: number): string {
  return ANGLES[(Math.max(1, attempt) - 1) % ANGLES.length] ?? ANGLES[0];
}

/**
 * Rewrite a soul profile, or turn a persona written elsewhere into one.
 *
 * The model is told to keep facts and voice and to cut everything else: the
 * profile is prepended to every single reply, so a paragraph of flourish is a
 * paragraph billed hundreds of times. `import` additionally reshapes free-form
 * text — what people get out of ChatGPT when they ask it to describe their
 * channel — into the same headings the constructor produces.
 */
export function buildSoulPrompt(markdown: string, mode: 'tighten' | 'import'): ChatMessage[] {
  const system = [
    'You edit voice profiles for an assistant that writes YouTube comment replies.',
    'A profile describes who the channel owner is, how they sound, and how they handle different kinds of comments.',
    '',
    'Rules:',
    '- Keep every fact and preference the text states. Invent nothing.',
    '- Cut filler, repetition and anything that does not change how a reply reads.',
    '- Write instructions the way one would brief a person, in plain sentences.',
    '- Use markdown headings and bullet lists. No preamble, no commentary, no code fences.',
    '- Answer with the profile itself and nothing else.',
  ];

  if (mode === 'import') {
    system.push(
      '',
      'The input was written for another tool and may be a persona description, a style guide, or notes.',
      'Reshape it under these headings, dropping any that the input says nothing about:',
      '## Who I am, ## How I sound, ## Phrases that sound like me, ## How I handle different comments.',
    );
  }

  return [
    { role: 'system', content: system.join('\n') },
    {
      role: 'user',
      content:
        mode === 'import'
          ? `Turn this into a profile:\n\n${markdown}`
          : `Tighten this profile:\n\n${markdown}`,
    },
  ];
}

interface BuildOptions {
  context: GenerationContext;
  soul: string;
  style: string;
  level: ContextLevel;
  /** Whether the reply speaks for the channel or for one viewer. */
  audience: Audience;
  /**
   * What the user typed in the popover for this reply: an instruction, or a
   * draft of the reply itself. Empty when they typed nothing.
   */
  note?: string;
  /** 1–5, already raised for this attempt. */
  creativity: number;
  /** The move this attempt was handed. See `angleFor`. */
  angle?: string;
  /** Replies already offered for this comment, oldest first. */
  previous?: string[];
  /** The language to write in, named outright. Empty means follow the comment. */
  language?: string;
  /**
   * True when `language` was detected rather than chosen, and the profile was
   * written by hand so we cannot tell whether it pins one. The instruction is
   * then qualified instead of absolute — a profile saying "always answer in
   * English" must still win over what the commenter happened to type.
   */
  languageIsGuess?: boolean;
}

/**
 * Assemble the messages for a reply.
 *
 * Ordering is deliberate: the parts that stay constant across every comment on
 * a video — voice, style, video metadata — go first, so they form a stable
 * prefix that prompt caching can reuse (#8). The comment itself, which changes
 * every time, goes last.
 */
export function buildReplyPrompt({
  context,
  soul,
  style,
  level,
  audience,
  note,
  creativity,
  angle,
  previous,
  language,
  languageIsGuess,
}: BuildOptions): ChatMessage[] {
  const system =
    audience === 'viewer'
      ? [
          'You write replies to YouTube comments as an ordinary viewer of the video.',
          // Spelled out because everything else in the prompt — the profile, the
          // video metadata — reads like the channel's own material, and the model
          // will happily assume the reply is the creator's if nobody says otherwise.
          'You do not run this channel. Never speak for it, never thank anyone for watching, and never promise anything the channel would have to deliver.',
          'Write only the reply text. No greetings block, no signature, no quotes around it.',
        ]
      : [
          'You write replies to YouTube comments on behalf of the channel owner.',
          'Write only the reply text. No greetings block, no signature, no quotes around it.',
        ];

  if (soul.trim()) {
    system.push('', 'Voice and rules to follow:', soul.trim());
  }

  const styleHint = STYLES[style] ?? STYLES.auto;
  system.push('', `Tone for this reply: ${styleHint}`);
  system.push(`How far to stray: ${creativityPreset(creativity).instruction}`);

  // L1 and above add video context. It is constant per video, so it belongs in
  // the cacheable prefix rather than in the user turn.
  if (level >= 1 && context.video) {
    system.push('', 'The comment is on this video:');
    // Studio's inbox names neither next to a comment on every route. An empty
    // `Title:` line teaches the model that the field means nothing.
    if (context.video.title) system.push(`Title: ${context.video.title}`);
    if (context.video.channel) system.push(`Channel: ${context.video.channel}`);

    // L2 adds the description. Same reasoning, one tier down in cost: it is the
    // largest constant part of the prompt and the only one big enough to bring
    // a prefix near the 1024-token minimum providers need for caching.
    if (level >= 2 && context.video.description) {
      system.push('', 'Video description:', context.video.description);
    }
  }

  // Language goes last, on purpose.
  //
  // It used to be the first line of the system prompt, with an English video
  // title and description sitting between it and the comment — and the model
  // followed whatever was nearest, answering a Russian comment in English. The
  // rule now sits closer to the comment than the metadata does, and names the
  // language outright rather than leaving it to be inferred.
  system.push(
    '',
    language
      ? languageIsGuess
        ? `Write the reply in ${language}, unless the rules above pin a different language.`
        : `Write the reply in ${language}.`
      : 'Write the reply in the same language the comment was written in.',
  );

  if (level >= 1 && context.video) {
    system.push(
      'The video title and description may be in another language. That must not change the language of the reply.',
    );
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

  // The angle and the rejected attempts live in the user turn rather than the
  // system prompt: both change on every press, and the system prompt is the part
  // prompt caching reuses. Putting them here also makes them the last thing the
  // model reads before answering, which is where an instruction carries most.
  if (angle) {
    user.push('', `Approach for this reply: ${angle}`);
  }

  if (previous && previous.length > 0) {
    user.push(
      '',
      'Already offered and turned down. Do not repeat the move or the opening words:',
      ...previous.map((text, index) => `${index + 1}. ${text}`),
    );
  }

  // The note goes last of all: it is the one part the user wrote for this exact
  // reply, and it has to win over the angle and over anything the comment
  // suggests. Two shapes, one instruction — an order to follow, or a draft to
  // rewrite — because asking the user which one they meant would be a dropdown
  // over a difference the model can see for itself.
  if (note?.trim()) {
    user.push(
      '',
      'The author wrote this for this reply. It is either an instruction to follow or a rough draft of the reply itself.',
      'If it is an instruction, do what it says. If it is a draft, keep everything it means and rewrite it in the voice above — never paste it back as it stands, and never answer it as though it were a comment.',
      note.trim(),
    );
  }

  return [
    { role: 'system', content: system.join('\n') },
    { role: 'user', content: user.join('\n') },
  ];
}
