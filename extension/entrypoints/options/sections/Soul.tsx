import { useEffect, useState } from 'react';
import { soul } from '@/lib/settings';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';

const PLACEHOLDER = `I run a channel about woodworking.

- Warm, never formal. I use first names.
- I answer questions with a concrete number when I have one.
- I never promise a video I have not filmed.
- If someone is rude, I stay short and polite and move on.`;

/**
 * The voice the model writes in, as free-form markdown.
 *
 * A plain editor on purpose: it is the whole feature at this stage, and the
 * guided constructor that turns a few answers into this text builds on top of
 * the same stored value rather than replacing it.
 *
 * Saved on blur and on the button rather than on every keystroke — a soul
 * profile is written in paragraphs, and a storage write per character buys
 * nothing.
 */
export function Soul() {
  const [stored, setStored] = useSetting(soul);
  const [draft, setDraft] = useState<string | null>(null);

  // Adopt the stored text once it arrives, but never overwrite what the user is
  // in the middle of typing.
  useEffect(() => {
    setDraft((current) => (current === null ? stored : current));
  }, [stored]);

  const dirty = draft !== null && stored !== null && draft !== stored;

  return (
    <Section
      title="Soul profile"
      description="Who you are and how you answer. This goes into every prompt, ahead of the comment itself."
    >
      <textarea
        className="textarea min-h-64 w-full text-sm"
        placeholder={PLACEHOLDER}
        value={draft ?? ''}
        disabled={draft === null}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => dirty && draft !== null && setStored(draft)}
      />

      <div className="card-actions items-center justify-between">
        <span className="text-xs text-base-content/50">
          {dirty ? 'Unsaved changes' : (draft?.length ?? 0) > 0 ? 'Saved' : 'Empty — replies will be generic'}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!dirty}
          onClick={() => draft !== null && setStored(draft)}
        >
          Save
        </button>
      </div>
    </Section>
  );
}
