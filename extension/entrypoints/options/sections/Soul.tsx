import { useEffect, useState } from 'react';
import { soul, soulProfile } from '@/lib/settings';
import { DEFAULT_PROFILE, type SoulProfile, renderSoul } from '@/lib/soul';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';
import { Constructor } from '../soul/Constructor';
import { Preview } from '../soul/Preview';

/**
 * The soul profile: built by clicking, stored as markdown.
 *
 * The constructor owns the answers; the markdown below is what actually goes
 * into the prompt and stays editable, because someone who wants to write it
 * themselves should not be stopped by a form. When the two diverge the page
 * says so rather than silently discarding one of them.
 */
export function Soul() {
  const [stored, setStored, profileLoaded] = useSetting(soulProfile);
  const [markdown, setMarkdown, markdownLoaded] = useSetting(soul);
  const [draft, setDraft] = useState<string | null>(null);

  // Adopt the stored markdown once it arrives, but never overwrite what the
  // user is in the middle of typing.
  useEffect(() => {
    setDraft((current) => (current === null ? markdown : current));
  }, [markdown]);

  const loading = !profileLoaded || !markdownLoaded;
  const profile = stored ?? DEFAULT_PROFILE;

  /** A hand-written profile with no answers behind it. */
  const handWritten = stored === null && (markdown ?? '').trim().length > 0;

  /** Manual edits that the constructor would overwrite. */
  const edited = !handWritten && markdown !== null && markdown !== renderSoul(profile);

  const update = (patch: Partial<SoulProfile>) => {
    const next = { ...profile, ...patch };
    const text = renderSoul(next);
    setStored(next);
    setMarkdown(text);
    setDraft(text);
  };

  const saveDraft = () => {
    if (draft !== null && draft !== markdown) setMarkdown(draft);
  };

  if (loading) {
    return (
      <Section title="Soul profile">
        <span className="loading loading-dots loading-sm" />
      </Section>
    );
  }

  return (
    <>
      <Section
        title="Soul profile"
        description="Who you are and how you answer. This goes into every prompt, ahead of the comment itself."
      >
        {(handWritten || edited) && (
          <div role="alert" className="alert alert-warning alert-soft text-sm">
            {handWritten
              ? 'This profile was written by hand. Answering below replaces it.'
              : 'The markdown below was edited by hand. Changing an answer above rewrites it.'}
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
        <textarea
          className="textarea min-h-64 w-full font-mono text-sm"
          placeholder="Answer a few questions above, or write your profile here."
          value={draft ?? ''}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveDraft}
        />

        <div className="card-actions items-center justify-between">
          <span className="text-xs text-base-content/50">
            {draft !== markdown
              ? 'Unsaved changes'
              : `${(markdown ?? '').length} characters — roughly ${Math.ceil((markdown ?? '').length / 4)} tokens per reply`}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={draft === markdown}
            onClick={saveDraft}
          >
            Save
          </button>
        </div>
      </Section>
    </>
  );
}
