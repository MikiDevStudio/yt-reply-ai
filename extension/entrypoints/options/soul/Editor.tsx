import { useState } from 'react';
import { FailureNotice } from '@/components/FailureNotice';
import { FIELD, GHOST, SECONDARY, SOLID } from '@/components/ui';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, sendRequest } from '@/lib/messaging';
import { SOUL_LIMIT } from '@/lib/prompt';

interface EditorProps {
  /** The saved markdown. */
  markdown: string;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
}

/**
 * The markdown that actually goes into the prompt, editable by hand.
 *
 * The constructor is the default road in, but a profile is prose in the end,
 * and someone who wants to write it themselves should not have to fight a form
 * to do it.
 */
export function Editor({ markdown, draft, onDraftChange, onSave }: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailureFacts | null>(null);
  const [before, setBefore] = useState<string | null>(null);

  const dirty = draft !== markdown;

  async function improve() {
    setBusy(true);
    setFailure(null);

    const result = await sendRequest<string>({
      type: 'soul:improve',
      markdown: draft,
      mode: 'tighten',
    });

    setBusy(false);
    if (!result.ok) {
      setFailure(failureOf(result));
      return;
    }

    // Kept unsaved and reversible: a rewrite the user did not ask to keep is
    // exactly the kind of thing that should not silently replace their words.
    setBefore(draft);
    onDraftChange(result.data);
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className={`${FIELD} min-h-64 font-mono`}
        placeholder="Answer a few questions above, or write your profile here."
        value={draft}
        disabled={busy}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={() => dirty && onSave()}
      />

      {failure && <FailureNotice facts={failure} onRetry={() => void improve()} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The cap is stated rather than enforced quietly: a profile trimmed
            behind the user's back would change how every reply sounds with
            nothing on screen to explain it. */}
        <span
          className={`font-mono text-[11px] ${
            markdown.length > SOUL_LIMIT ? 'text-warning' : 'text-base-content/50'
          }`}
        >
          {dirty
            ? 'Unsaved changes'
            : markdown.length > SOUL_LIMIT
              ? `${markdown.length} characters — only the first ${SOUL_LIMIT.toLocaleString('en-US')} are sent with a reply`
              : `${markdown.length} characters — roughly ${Math.ceil(markdown.length / 4)} tokens on every reply`}
        </span>

        <div className="flex gap-2">
          {before !== null && (
            <button
              type="button"
              className={GHOST}
              onClick={() => {
                onDraftChange(before);
                setBefore(null);
              }}
            >
              Undo rewrite
            </button>
          )}

          <button
            type="button"
            className={SECONDARY}
            disabled={busy || draft.trim().length === 0}
            onClick={() => void improve()}
          >
            {busy ? (
              <>
                <span className="loading loading-dots loading-xs" />
                Rewriting
              </>
            ) : (
              'Tighten with AI'
            )}
          </button>

          {/* The card's one solid button: saving is what the user came here to
              do, and the rewrite beside it is an offer, not the errand. */}
          <button type="button" className={SOLID} disabled={!dirty} onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
