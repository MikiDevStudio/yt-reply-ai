import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { soul, soulProfile } from '@/lib/settings';
import { DEFAULT_PROFILE, type SoulProfile, type SoulType, matchType, renderSoul } from '@/lib/soul';
import { useSetting } from '@/lib/use-setting';
import { Fold } from '../Fold';
import { Section } from '../Section';
import { Constructor } from '../soul/Constructor';
import { Editor } from '../soul/Editor';
import { Import } from '../soul/Import';
import { Types } from '../soul/Types';

/**
 * The soul profile: built by clicking, stored as markdown, editable either way.
 *
 * The two representations can diverge — the constructor renders the answers,
 * and the editor lets the user write over the result. Neither side is allowed
 * to discard the other silently: a change that would overwrite hand-written
 * text asks first, every time, until the divergence is gone.
 *
 * Three levels of disclosure, not three screens. A type and one sentence about
 * the channel are enough to leave with; the constructor and the markdown are a
 * click away for anyone who wants them. Not a wizard — a wizard is better the
 * first time and worse every time after, and someone who came back to flip one
 * switch should not be walked through steps.
 */
export function Soul() {
  const [stored, setStored, profileLoaded] = useSetting(soulProfile);
  const [markdown, setMarkdown, markdownLoaded] = useSetting(soul);
  const [draft, setDraft] = useState<string | null>(null);

  /** A change to the answers, held back until the user says it may land. */
  const [pending, setPending] = useState<Partial<SoulProfile> | null>(null);

  /**
   * The profile as it stood before the last type pick.
   *
   * In page memory, never storage: an undo that survives a tab reload is not an
   * undo anyone reaches for.
   */
  const [previous, setPrevious] = useState<SoulProfile | null>(null);

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

  const type = matchType(profile);

  /** Nothing set up yet — matching no type here means untouched, not custom. */
  const fresh = stored === null && text.trim().length === 0;

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
    // Any other edit closes the undo window. What it would restore stopped
    // being the profile the user had before the pick.
    setPrevious(null);
    apply(patch);
  };

  /**
   * Picking a type overwrites eight values at once, seven of them inside a
   * fold. The existing guard does not cover that — a profile built with the
   * constructor is neither hand-written nor detached, so it falls straight
   * through — and the fix on a flow designed to be one click is undo, not a
   * second confirmation.
   */
  const pick = (picked: SoulType) => {
    if (handWritten || detached) {
      setPending(picked.preset);
      return;
    }
    // Nothing to undo on a profile nobody has touched: restoring the defaults
    // would leave a profile matching no type, labelled Custom, that the user
    // never built.
    setPrevious(fresh ? null : profile);
    apply(picked.preset);
  };

  const replaceWith = (value: string) => {
    // Text that did not come from the answers, so the answers stop describing
    // it. Dropping them is what makes the warning above honest rather than a
    // second, silently stale copy of the profile.
    setStored(null);
    setMarkdown(value);
    setDraft(value);
    setPrevious(null);
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-base-content/60">
              {fresh
                ? 'Start from a type. Everything it sets stays yours to change.'
                : type === null && 'Custom — these answers match no type.'}
            </span>

            {previous && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  apply(previous);
                  setPrevious(null);
                }}
              >
                <Undo2 aria-hidden className="size-3.5" />
                Undo
              </button>
            )}
          </div>

          <Types selected={type} onPick={pick} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-medium">What is the channel about, and who is answering?</span>
          <span className="text-xs text-base-content/60">
            One or two sentences. This is the only part the model cannot guess.
          </span>
          <textarea
            className="textarea min-h-20 w-full text-sm"
            placeholder="I make woodworking videos. I answer as myself, not as a brand."
            value={profile.about}
            onChange={(event) => update({ about: event.target.value })}
          />
        </div>
      </Section>

      <Fold
        title="Configure in detail"
        description="Tone, length, language, and how each kind of comment gets handled."
        // A custom profile opens: folding away settings that matched no type
        // hides the user's own work and makes "folded, not hidden" a lie.
        defaultOpen={stored !== null && type === null}
      >
        <Constructor profile={profile} onChange={update} />
      </Fold>

      <Fold
        title="What actually gets sent"
        description="The markdown the constructor produces. Edit it directly if you would rather write your own."
        // A hand-written profile opens here instead: that text is the profile,
        // and an open constructor above it is an invitation to overwrite it.
        defaultOpen={handWritten}
      >
        <Editor
          markdown={text}
          draft={draft ?? ''}
          onDraftChange={setDraft}
          onSave={() => draft !== null && draft !== text && setMarkdown(draft)}
        />

        <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
          <span className="font-medium">Import a profile</span>
          <span className="text-sm text-base-content/70">
            Already have a persona written elsewhere? Bring it in instead of rebuilding it here.
          </span>
          <Import onApply={replaceWith} />
        </div>
      </Fold>
    </>
  );
}
