import { useEffect, useState } from 'react';
import { soul, soulProfile } from '@/lib/settings';
import { DEFAULT_PROFILE, type SoulProfile, renderSoul } from '@/lib/soul';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';
import { Constructor } from '../soul/Constructor';
import { Editor } from '../soul/Editor';
import { Import } from '../soul/Import';
import { Preview } from '../soul/Preview';

/**
 * The soul profile: built by clicking, stored as markdown, editable either way.
 *
 * The two representations can diverge — the constructor renders the answers,
 * and the editor lets the user write over the result. Neither side is allowed
 * to discard the other silently: a change that would overwrite hand-written
 * text asks first, every time, until the divergence is gone.
 */
export function Soul() {
  const [stored, setStored, profileLoaded] = useSetting(soulProfile);
  const [markdown, setMarkdown, markdownLoaded] = useSetting(soul);
  const [draft, setDraft] = useState<string | null>(null);

  /** A change to the answers, held back until the user says it may land. */
  const [pending, setPending] = useState<Partial<SoulProfile> | null>(null);

  // Adopt the stored markdown once it arrives, but never overwrite what the
  // user is in the middle of typing.
  useEffect(() => {
    setDraft((current) => (current === null ? markdown : current));
  }, [markdown]);

  if (!profileLoaded || !markdownLoaded) {
    return (
      <Section title="Soul profile">
        <span className="loading loading-dots loading-sm" />
      </Section>
    );
  }

  const text = markdown ?? '';
  const profile = stored ?? DEFAULT_PROFILE;

  /** Written by hand, with no answers behind it to rebuild from. */
  const handWritten = stored === null && text.trim().length > 0;

  /** Answers exist, but the markdown no longer matches what they render to. */
  const detached = stored !== null && text !== renderSoul(profile);

  const apply = (patch: Partial<SoulProfile>) => {
    const next = { ...profile, ...patch };
    const rendered = renderSoul(next);
    setStored(next);
    setMarkdown(rendered);
    setDraft(rendered);
  };

  const update = (patch: Partial<SoulProfile>) => {
    // The guard clears itself: once the answers have been applied the markdown
    // matches them again, so the next change goes straight through.
    if (handWritten || detached) {
      setPending(patch);
      return;
    }
    apply(patch);
  };

  const replaceWith = (value: string) => {
    // Text that did not come from the answers, so the answers stop describing
    // it. Dropping them is what makes the warning above honest rather than a
    // second, silently stale copy of the profile.
    setStored(null);
    setMarkdown(value);
    setDraft(value);
  };

  return (
    <>
      <Section
        title="Soul profile"
        description="Who you are and how you answer. This goes into every prompt, ahead of the comment itself."
      >
        {(handWritten || detached) && (
          <div role="alert" className="alert alert-warning alert-soft text-sm">
            {handWritten
              ? 'This profile was written by hand. Answering below builds a new one and replaces it.'
              : 'The markdown below was edited by hand, so it no longer matches the answers.'}
          </div>
        )}

        {pending && (
          <div role="alert" className="alert alert-warning flex-col items-start gap-2 text-sm">
            <span>Applying that answer rewrites the profile and loses your edits.</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  apply(pending);
                  setPending(null);
                }}
              >
                Rewrite it
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPending(null)}
              >
                Keep my text
              </button>
            </div>
          </div>
        )}

        <Constructor profile={profile} onChange={update} />
      </Section>

      <Section
        title="Try it"
        description="Generate a reply to a sample comment with the profile as it stands."
      >
        <Preview />
      </Section>

      <Section
        title="What actually gets sent"
        description="The markdown the constructor produces. Edit it directly if you would rather write your own."
      >
        <Editor
          markdown={text}
          draft={draft ?? ''}
          onDraftChange={setDraft}
          onSave={() => draft !== null && draft !== text && setMarkdown(draft)}
        />
      </Section>

      <Section
        title="Import a profile"
        description="Already have a persona written elsewhere? Bring it in instead of rebuilding it here."
      >
        <Import onApply={replaceWith} />
      </Section>
    </>
  );
}
