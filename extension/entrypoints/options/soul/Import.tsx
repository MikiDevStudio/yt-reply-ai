import { useState } from 'react';
import { sendRequest } from '@/lib/messaging';

interface ImportProps {
  /** Replaces the whole profile with this text. */
  onApply: (markdown: string) => void;
}

/**
 * Bring in a persona written somewhere else.
 *
 * People who care about this arrive with something already: a description they
 * had ChatGPT write from their transcripts, a style guide, a page of notes.
 * Retyping it into the constructor would be busywork, so it can come in whole —
 * either verbatim, or reshaped by the model into the same headings the
 * constructor produces.
 */
export function Import({ onApply }: ImportProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    setBusy(true);
    setError(null);

    const result = await sendRequest<string>({
      type: 'soul:improve',
      markdown: text,
      mode: 'import',
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onApply(result.data);
    setText('');
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="textarea min-h-32 w-full text-sm"
        placeholder="Paste a persona description, a style guide, or your notes."
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
      />

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {error}
        </div>
      )}

      <div className="card-actions items-center justify-between">
        <span className="text-xs text-base-content/50">
          Replaces the current profile. The markdown above stays editable afterwards.
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || text.trim().length === 0}
            onClick={() => {
              onApply(text.trim());
              setText('');
            }}
          >
            Use as is
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || text.trim().length === 0}
            onClick={() => void convert()}
          >
            {busy ? (
              <>
                <span className="loading loading-dots loading-xs" />
                Converting
              </>
            ) : (
              'Convert with AI'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
