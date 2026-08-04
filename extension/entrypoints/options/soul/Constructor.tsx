import { useState } from 'react';
import {
  type CommentKind,
  type EmojiUse,
  RULE_LABELS,
  RULE_OPTIONS,
  type ReplyLength,
  type SoulProfile,
  TONES,
} from '@/lib/soul';

interface ConstructorProps {
  profile: SoulProfile;
  onChange: (patch: Partial<SoulProfile>) => void;
}

const LENGTH_LABELS: Record<ReplyLength, string> = {
  short: 'One line',
  medium: 'Two or three sentences',
  long: 'A short paragraph',
};

const EMOJI_LABELS: Record<EmojiUse, string> = {
  none: 'Never',
  sparing: 'Sparingly',
  freely: 'Freely',
};

/**
 * The profile, built by clicking.
 *
 * Almost nobody writes a persona prompt from an empty box, so every answer here
 * is a choice rather than a field — except the two where only the user has the
 * information: what the channel is about, and the phrases that sound like them.
 */
export function Constructor({ profile, onChange }: ConstructorProps) {
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="What is the channel about, and who is answering?"
        hint="One or two sentences. This is the only part the model cannot guess."
      >
        <textarea
          className="textarea min-h-20 w-full text-sm"
          placeholder="I make woodworking videos. I answer as myself, not as a brand."
          value={profile.about}
          onChange={(event) => onChange({ about: event.target.value })}
        />
      </Field>

      <Field label="Tone" hint="Pick one or two. More than that averages out into nothing.">
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => {
            const active = profile.tone.includes(tone);
            return (
              <button
                key={tone}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`}
                onClick={() =>
                  onChange({
                    tone: active
                      ? profile.tone.filter((value) => value !== tone)
                      : [...profile.tone, tone],
                  })
                }
              >
                {tone}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Reply length">
        <Choice
          options={Object.entries(LENGTH_LABELS) as [ReplyLength, string][]}
          value={profile.replyLength}
          onSelect={(replyLength) => onChange({ replyLength })}
        />
      </Field>

      <Field label="Emoji">
        <Choice
          options={Object.entries(EMOJI_LABELS) as [EmojiUse, string][]}
          value={profile.emoji}
          onSelect={(emoji) => onChange({ emoji })}
        />
      </Field>

      <Field
        label="Language"
        hint="Answering in the commenter's language is the better default — a channel's audience is rarely monolingual."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="language"
              className="radio radio-sm"
              checked={profile.language === null}
              onChange={() => onChange({ language: null })}
            />
            Match the comment
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="language"
              className="radio radio-sm"
              checked={profile.language !== null}
              onChange={() => onChange({ language: 'English' })}
            />
            Always
          </label>

          <input
            type="text"
            className="input input-sm w-40 text-sm"
            placeholder="English"
            disabled={profile.language === null}
            value={profile.language ?? ''}
            onChange={(event) => onChange({ language: event.target.value })}
          />
        </div>
      </Field>

      <Field
        label="Phrases that sound like you"
        hint="Greetings, sign-offs, the joke you always make. Optional, and easy to overdo."
      >
        <PhraseInput
          phrases={profile.phrases}
          onChange={(phrases) => onChange({ phrases })}
        />
      </Field>

      <Field label="How to handle each kind of comment">
        <div className="flex flex-col gap-4">
          {(Object.keys(RULE_LABELS) as CommentKind[]).map((kind) => (
            <div key={kind} className="flex flex-col gap-2">
              <span className="text-sm font-medium">{RULE_LABELS[kind]}</span>
              <Choice
                options={RULE_OPTIONS[kind].map(
                  (option) => [option.id, option.label] as [string, string],
                )}
                value={profile.rules[kind]}
                onSelect={(id) => onChange({ rules: { ...profile.rules, [kind]: id } })}
              />
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-xs text-base-content/60">{hint}</span>}
      {children}
    </div>
  );
}

interface ChoiceProps<T extends string> {
  options: ReadonlyArray<[T, string]>;
  value: T;
  onSelect: (value: T) => void;
}

/** A row of mutually exclusive options, as buttons rather than a select. */
function Choice<T extends string>({ options, value, onSelect }: ChoiceProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`btn btn-sm ${value === id ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface PhraseInputProps {
  phrases: string[];
  onChange: (phrases: string[]) => void;
}

function PhraseInput({ phrases, onChange }: PhraseInputProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const phrase = draft.trim();
    if (!phrase || phrases.includes(phrase)) {
      setDraft('');
      return;
    }
    onChange([...phrases, phrase]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          className="input input-sm flex-1 text-sm"
          placeholder="Cheers — thanks for watching"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-sm" disabled={!draft.trim()} onClick={add}>
          Add
        </button>
      </div>

      {phrases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {phrases.map((phrase) => (
            <span key={phrase} className="badge badge-soft gap-2 py-3">
              {phrase}
              <button
                type="button"
                aria-label={`Remove ${phrase}`}
                onClick={() => onChange(phrases.filter((value) => value !== phrase))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
