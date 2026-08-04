import { useEffect, useRef, useState } from 'react';
import type { GenerationContext } from '@/lib/messaging';
import { STYLES } from '@/lib/prompt';
import { useGeneration } from '@/lib/use-generation';

/** Order shown in the picker. `auto` first because it is the default. */
const STYLE_ORDER = ['auto', 'friendly', 'humorous', 'engaging', 'brief'] as const;

interface ReplyPopoverProps {
  context: GenerationContext;
  /** Start generating as soon as the popover opens. See `settings.autoGenerate`. */
  autoStart: boolean;
  /** Writes the text into YouTube's reply box. */
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function ReplyPopover({ context, autoStart, onInsert, onClose }: ReplyPopoverProps) {
  const { state, generate, cancel } = useGeneration();
  const [style, setStyle] = useState<string>('auto');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  // Whether this popover has spent a request yet. Once it has, changing the
  // tone regenerates even with auto-start off — at that point the user has
  // already opted into generating and is adjusting the result.
  const started = useRef(false);

  const start = () => {
    started.current = true;
    generate(context, style);
  };

  useEffect(() => {
    if (autoStart || started.current) start();
    // Re-running on `style` is deliberate — picking a tone regenerates.
  }, [style]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Follow the text as it streams in.
  useEffect(() => {
    if (state.status === 'streaming' && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [state]);

  const text = state.status === 'streaming' || state.status === 'done' ? state.text : '';
  const busy = state.status === 'streaming';

  return (
    // Width in px, not rem: see the note in assets/theme.css.
    <div className="card card-sm w-[420px] max-w-[90vw] border border-base-300 bg-base-100 text-base-content shadow-xl">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="card-title text-base">AI reply</h3>
          <button
            type="button"
            className="btn btn-sm text-sm btn-ghost btn-circle"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="line-clamp-2 rounded-box bg-base-200 px-3 py-2 text-sm text-base-content/60">
          {context.commentAuthor && <span className="font-medium">{context.commentAuthor}: </span>}
          {context.commentText || 'This comment has no text.'}
        </p>

        {/*
          `text-sm` rides on top of every size class in this popover: daisyUI
          ties font size to button height, and the resulting 11–12px is smaller
          than anything YouTube puts on the page — their comment UI sits at 14px.
        */}
        <div className="flex flex-wrap gap-1">
          {STYLE_ORDER.map((name) => (
            <button
              key={name}
              type="button"
              className={`btn btn-sm text-sm ${style === name ? 'btn-primary' : 'btn-ghost'}`}
              title={STYLES[name]}
              disabled={busy}
              onClick={() => setStyle(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {state.status === 'error' ? (
          <ErrorNotice
            kind={state.kind}
            message={state.message}
            retryAfterSeconds={state.retryAfterSeconds}
            onRetry={start}
          />
        ) : (
          <div
            ref={streamRef}
            className="max-h-56 min-h-20 overflow-y-auto whitespace-pre-wrap rounded-box border border-base-300 p-3 text-sm"
          >
            {text ||
              (state.status === 'idle' ? (
                <span className="text-base-content/50">
                  Pick a tone, then press Generate.
                </span>
              ) : (
                <span className="flex items-center gap-2 text-base-content/50">
                  <span className="loading loading-dots loading-sm" />
                  Writing…
                </span>
              ))}
          </div>
        )}

        <div className="card-actions items-center justify-between">
          <span className="text-sm text-base-content/50">
            {state.status === 'done' && state.usage
              ? `${state.usage.totalTokens} tokens`
              : ' '}
          </span>

          <div className="flex gap-1">
            {busy ? (
              <button type="button" className="btn btn-sm text-sm btn-ghost" onClick={cancel}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-sm text-sm ${state.status === 'idle' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={start}
              >
                {state.status === 'idle' ? 'Generate' : 'Regenerate'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm text-sm btn-ghost"
              disabled={!text}
              onClick={() => {
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              className="btn btn-sm text-sm btn-primary"
              disabled={!text || busy}
              onClick={() => onInsert(text)}
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ErrorNoticeProps {
  kind: string;
  message: string;
  retryAfterSeconds?: number;
  onRetry: () => void;
}

/**
 * Each failure gets its own next action. A generic "try again" would be a lie
 * for most of these — retrying an unauthorised request never helps.
 */
function ErrorNotice({ kind, message, retryAfterSeconds, onRetry }: ErrorNoticeProps) {
  const openSettings = () => void browser.runtime.openOptionsPage();

  return (
    <div role="alert" className="alert alert-error alert-soft flex-col items-start gap-2 text-sm">
      <span>{message}</span>

      {kind === 'unauthorized' && (
        <button type="button" className="btn btn-sm text-sm" onClick={openSettings}>
          Connect OpenRouter
        </button>
      )}

      {kind === 'no_credits' && (
        <button type="button" className="btn btn-sm text-sm" onClick={openSettings}>
          Switch to a free model
        </button>
      )}

      {kind === 'rate_limited' && (
        <span className="text-sm opacity-70">
          {retryAfterSeconds
            ? `Try again in ${retryAfterSeconds}s.`
            : 'Free models allow 20 requests per minute and 50 per day.'}
        </span>
      )}

      {(kind === 'upstream' || kind === 'network' || kind === 'empty') && (
        <button type="button" className="btn btn-sm text-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
