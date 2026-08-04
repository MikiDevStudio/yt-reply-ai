/**
 * The soul profile: what the user answers by clicking, and the markdown it
 * turns into.
 *
 * Two representations on purpose. The structured answers are what the
 * constructor edits and re-opens; the markdown is what goes into the prompt.
 * Keeping the answers means the constructor is not a one-way door — a user can
 * come back a month later and flip one switch instead of rewriting prose.
 */

export type ReplyLength = 'short' | 'medium' | 'long';
export type EmojiUse = 'none' | 'sparing' | 'freely';
export type CommentKind = 'praise' | 'question' | 'criticism' | 'hate' | 'spam';

export interface SoulProfile {
  /** Who the user is and what the channel is about, in their own words. */
  about: string;
  /** Tone chips, from `TONES`. */
  tone: string[];
  replyLength: ReplyLength;
  emoji: EmojiUse;
  /**
   * `null` means answer in whatever language the comment used — the default,
   * because a channel's audience is rarely monolingual.
   */
  language: string | null;
  /** Words and phrases that sound like this person. */
  phrases: string[];
  /** Chosen handling per comment type, keyed by option id. */
  rules: Record<CommentKind, string>;
}

export const TONES = [
  'warm',
  'funny',
  'concise',
  'enthusiastic',
  'expert',
  'dry',
  'encouraging',
  'blunt',
] as const;

const LENGTHS: Record<ReplyLength, string> = {
  short: 'One sentence. Two at the most.',
  medium: 'Two or three sentences.',
  long: 'A short paragraph when the comment deserves it.',
};

const EMOJI: Record<EmojiUse, string> = {
  none: 'Never use emoji.',
  sparing: 'At most one emoji, and only when it adds something.',
  freely: 'Emoji are welcome where they fit.',
};

/**
 * How to answer each kind of comment, as pickable options.
 *
 * Each option carries the sentence that ends up in the prompt, so the user
 * picks behaviour rather than writing instructions — the whole point of the
 * constructor. The first option of each group is the default.
 */
export const RULE_OPTIONS: Record<
  CommentKind,
  ReadonlyArray<{ id: string; label: string; instruction: string }>
> = {
  praise: [
    { id: 'thank', label: 'Thank them, briefly', instruction: 'Thank them in one line. Do not gush.' },
    {
      id: 'thank-invite',
      label: 'Thank them and keep the conversation going',
      instruction: 'Thank them and add a question or a detail that invites another reply.',
    },
    {
      id: 'thank-specific',
      label: 'Thank them for the specific thing they mentioned',
      instruction: 'Thank them by naming the specific thing they praised, so it does not read as a template.',
    },
  ],
  question: [
    {
      id: 'answer',
      label: 'Answer directly',
      instruction: 'Answer the question directly and concretely. If the answer is not known, say so plainly.',
    },
    {
      id: 'answer-point',
      label: 'Answer and point at the video',
      instruction:
        'Answer the question and point to where in the video or channel it is covered, if it is covered.',
    },
    {
      id: 'answer-ask',
      label: 'Answer, and ask back when the question is vague',
      instruction:
        'Answer what can be answered. When the question is too vague to answer, ask for the one detail needed.',
    },
  ],
  criticism: [
    {
      id: 'acknowledge',
      label: 'Acknowledge it, no defensiveness',
      instruction:
        'Take criticism seriously. Acknowledge the point without arguing or justifying at length.',
    },
    {
      id: 'acknowledge-explain',
      label: 'Acknowledge, then explain the reasoning',
      instruction:
        'Acknowledge the point, then explain the reasoning behind the choice in one or two sentences. Never argue.',
    },
    {
      id: 'ask-specifics',
      label: 'Ask what exactly went wrong',
      instruction: 'Thank them for the feedback and ask for the specifics that would make it actionable.',
    },
  ],
  hate: [
    {
      id: 'ignore',
      label: 'Do not engage',
      instruction:
        'When a comment is hostile rather than critical, do not engage with the hostility. Answer with one short, neutral line, or nothing worth saying at all.',
    },
    {
      id: 'defuse',
      label: 'Defuse with humour',
      instruction:
        'Meet hostility with light humour, never with anger. Never insult back, never explain yourself at length.',
    },
    {
      id: 'firm',
      label: 'Be firm and short',
      instruction:
        'Answer hostility with one firm, polite line that closes the conversation. No apology, no escalation.',
    },
  ],
  spam: [
    {
      id: 'skip',
      label: 'Never reply',
      instruction: 'Do not reply to spam, self-promotion or bot comments. There is nothing to gain.',
    },
    {
      id: 'short',
      label: 'One neutral line',
      instruction: 'Answer spam and self-promotion with one neutral line at most.',
    },
  ],
};

export const RULE_LABELS: Record<CommentKind, string> = {
  praise: 'Praise',
  question: 'Questions',
  criticism: 'Criticism',
  hate: 'Hostility',
  spam: 'Spam and self-promotion',
};

export const DEFAULT_PROFILE: SoulProfile = {
  about: '',
  tone: ['warm'],
  replyLength: 'short',
  emoji: 'sparing',
  language: null,
  phrases: [],
  rules: {
    praise: 'thank',
    question: 'answer',
    criticism: 'acknowledge',
    hate: 'ignore',
    spam: 'skip',
  },
};

/**
 * Render the answers as the markdown that goes into the prompt.
 *
 * Plain prose rather than a JSON dump: this text is read by a language model,
 * and instructions written as sentences are followed more reliably than
 * key-value pairs. Empty answers produce no heading at all — an empty section
 * would just be noise in the prefix.
 */
export function renderSoul(profile: SoulProfile): string {
  const blocks: string[] = [];

  if (profile.about.trim()) {
    blocks.push(`## Who I am\n${profile.about.trim()}`);
  }

  const voice: string[] = [];
  if (profile.tone.length > 0) {
    voice.push(`- Tone: ${profile.tone.join(', ')}.`);
  }
  voice.push(`- Length: ${LENGTHS[profile.replyLength]}`);
  voice.push(`- ${EMOJI[profile.emoji]}`);
  voice.push(
    profile.language
      ? `- Always reply in ${profile.language}, whatever language the comment used.`
      : "- Reply in the language of the comment being answered.",
  );
  blocks.push(`## How I sound\n${voice.join('\n')}`);

  if (profile.phrases.length > 0) {
    blocks.push(
      `## Phrases that sound like me\n${profile.phrases.map((phrase) => `- ${phrase}`).join('\n')}\n` +
        'Use them when they fit naturally. Never force one in.',
    );
  }

  const rules = (Object.keys(RULE_LABELS) as CommentKind[])
    .map((kind) => {
      const chosen = RULE_OPTIONS[kind].find((option) => option.id === profile.rules[kind]);
      return chosen ? `- ${RULE_LABELS[kind]}: ${chosen.instruction}` : null;
    })
    .filter((line): line is string => line !== null);

  if (rules.length > 0) {
    blocks.push(`## How I handle different comments\n${rules.join('\n')}`);
  }

  return blocks.join('\n\n');
}
