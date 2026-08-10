import {
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerDownLeft,
  RefreshCw,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { detectLanguage } from '@/lib/language';
import type { GenerationContext } from '@/lib/messaging';
import { angleFor, CREATIVITY, STYLES } from '@/lib/prompt';
import { creativity as creativitySetting } from '@/lib/settings';
import { useGeneration } from '@/lib/use-generation';
import {
  type Attempt,
  moveCursor,
  pushAttempt,
  readHistory,
  readLanguageOverride,
  writeLanguageOverride,
} from './session';

/** Order shown in the picker. `auto` first because it is the default. */
const STYLE_ORDER = ['auto', 'friendly', 'humorous', 'engaging', 'brief'] as const;

/** A language name is a word or two. Anything longer is someone writing instructions. */
const MAX_LANGUAGE_LENGTH = 40;

interface ReplyPopoverProps {
  /** Keys the attempt stack. See `commentKey` in youtube-dom.ts. */
  commentId: string;
  context: GenerationContext;
  /** Start generating as soon as the popover opens. See `settings.autoGenerate`. */
  autoStart: boolean;
  /** Writes the text into YouTube's reply box. */
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function ReplyPopover({
  commentId,
  context,
  autoStart,
  onInsert,
  onClose,
}: ReplyPopoverProps) {
  const { state, generate, cancel } = useGeneration();
  const [style, setStyle] = useState<string>('auto');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  // Attempts already made for this comment, restored from the tab's memory.
  // Reopening a comment shows what it produced last time instead of spending a
  // request to say roughly the same thing again.
  const [attempts, setAttempts] = useState<Attempt[]>(() => readHistory(commentId).attempts);
  const [cursor, setCursor] = useState(() => readHistory(commentId).cursor);

  const [level, setLevel] = useState(3);
  const [detected, setDetected] = useState<string | null>(null);
  const [language, setLanguage] = useState(readLanguageOverride() ?? '');

  // What this attempt was asked for, so the finished text can be filed under it.
  const pending = useRef<{ angle: string; creativity: number } | null>(null);
  // Whether this popover has spent a request yet. Once it has, changing the
  // tone regenerates even with auto-start off — at that point the user has
  // already opted into generating and is adjusting the result.
  const started = useRef(false);
  // Reopening a comment that already has attempts must not spend another one,
  // however `autoGenerate` is set. Cleared after the first render so a later
  // tone change still regenerates.
  const reopened = useRef(readHistory(commentId).attempts.length > 0);
  // The language actually in force, as opposed to what is being typed. Requests
  // read this: it is up to date the moment it is applied, which state is not.
  const applied = useRef(readLanguageOverride() ?? '');

  useEffect(() => {
    void creativitySetting.getValue().then(setLevel);
    void detectLanguage(context.commentText).then(setDetected);
  }, [context.commentText]);

  const start = () => {
    started.current = true;

    const attempt = attempts.length + 1;
    // Each retry gets a step more room than the last. The stored level does not
    // move; the bump belongs to the attempt. The worker applies the same rule —
    // this copy exists so the attempt can be filed under what produced it.
    pending.current = {
      angle: angleFor(attempt),
      creativity: Math.min(CREATIVITY.length, level + attempt - 1),
    };

    generate(context, {
      style,
      creativity: level,
      attempt,
      previous: attempts.map((entry) => entry.text),
      ...(applied.current ? { language: applied.current } : {}),
      ...(detected ? { detectedLanguage: detected } : {}),
    });
  };

  useEffect(() => {
    if (reopened.current) {
      reopened.current = false;
      return;
    }
    if (autoStart || started.current) start();
    // Re-running on `style` is deliberate — picking a tone regenerates.
  }, [style]);

  // File a finished reply, then show it. Guarded by `pending` so a re-render
  // cannot store the same attempt twice.
  useEffect(() => {
    if (state.status !== 'done' || !pending.current) return;

    const attempt: Attempt = {
      text: state.text,
      angle: pending.current.angle,
      creativity: pending.current.creativity,
      usage: state.usage,
    };
    pending.current = null;

    const history = pushAttempt(commentId, attempt);
    setAttempts(history.attempts);
    setCursor(history.cursor);
  }, [state, commentId]);

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

  const busy = state.status === 'streaming';
  const shown = attempts[cursor];
  // While streaming, the live text wins over the stack; the new attempt joins it
  // only once it is complete.
  const text = busy ? state.text : (shown?.text ?? '');

  const show = (index: number) => {
    setCursor(index);
    moveCursor(commentId, index);
  };

  /**
   * Put a typed language into force.
   *
   * Runs on blur as well as Enter, and blur fires whenever the user clicks any
   * button in the popover — including Insert. Comparing against what is already
   * applied is what stops a click on Insert from starting a generation nobody
   * asked for.
   */
  const applyLanguage = (value: string) => {
    const next = value.trim().slice(0, MAX_LANGUAGE_LENGTH);
    setLanguage(next);
    if (next === applied.current) return;

    applied.current = next;
    writeLanguageOverride(next || null);
    if (started.current && !busy) start();
  };

  const overridden = language.trim().length > 0 && language.trim() !== detected;

  return (
    // Width in px, not rem: see the note in assets/theme.css.
    <div className="card card-sm w-[420px] max-w-[90vw] border border-base-300 bg-base-100 text-base-content shadow-xl">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2">
          <h3 className="card-title shrink-0 text-base">AI reply</h3>

          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              type="text"
              value={language}
              maxLength={MAX_LANGUAGE_LENGTH}
              placeholder={detected ?? 'Comment language'}
              aria-label="Reply language"
              title="Language to reply in. Empty follows the comment."
              className="input input-sm input-ghost min-w-0 flex-1 text-sm"
              disabled={busy}
              onChange={(event) => setLanguage(event.target.value)}
              onBlur={(event) => applyLanguage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyLanguage(event.currentTarget.value);
              }}
            />

            {overridden ? (
              <button
                type="button"
                className="btn btn-sm text-sm btn-ghost btn-square"
                aria-label="Back to the comment's language"
                title="Back to the comment's language"
                disabled={busy}
                onClick={() => applyLanguage('')}
              >
                <RotateCcw className="size-4" />
              </button>
            ) : (
              <span className="px-1 text-sm text-base-content/40" title="Detected from the comment">
                auto
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn btn-sm text-sm btn-ghost btn-square"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
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
            onRetry={() => start()}
          />
        ) : (
          <div
            ref={streamRef}
            className="max-h-56 min-h-20 overflow-y-auto whitespace-pre-wrap rounded-box border border-base-300 p-3 text-sm"
          >
            {text ||
              (state.status === 'idle' ? (
                <span className="text-base-content/50">Pick a tone, then press Generate.</span>
              ) : (
                <span className="flex items-center gap-2 text-base-content/50">
                  <span className="loading loading-dots loading-sm" />
                  Writing…
                </span>
              ))}
          </div>
        )}

        <div className="card-actions items-center justify-between">
          <div className="flex items-center gap-2">
            {attempts.length > 1 && (
              <div className="join">
                <button
                  type="button"
                  className="btn join-item btn-sm text-sm btn-ghost btn-square"
                  aria-label="Previous attempt"
                  title="Previous attempt"
                  disabled={busy || cursor === 0}
                  onClick={() => show(cursor - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="join-item flex items-center px-1 text-sm text-base-content/50">
                  {cursor + 1}/{attempts.length}
                </span>
                <button
                  type="button"
                  className="btn join-item btn-sm text-sm btn-ghost btn-square"
                  aria-label="Next attempt"
                  title="Next attempt"
                  disabled={busy || cursor === attempts.length - 1}
                  onClick={() => show(cursor + 1)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}

            <Creativity level={level} disabled={busy} onChange={setLevel} />
          </div>

          <div className="flex gap-1">
            {busy ? (
              <button
                type="button"
                className="btn btn-sm text-sm btn-ghost btn-square"
                aria-label="Stop"
                title="Stop"
                onClick={cancel}
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-sm text-sm ${
                  state.status === 'idle' && attempts.length === 0
                    ? 'btn-primary'
                    : 'btn-ghost btn-square'
                }`}
                aria-label={attempts.length === 0 ? undefined : 'Another attempt'}
                title={attempts.length === 0 ? undefined : 'Another attempt'}
                onClick={() => start()}
              >
                {attempts.length === 0 ? 'Generate' : <RefreshCw className="size-4" />}
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm text-sm btn-ghost btn-square"
              aria-label={copied ? 'Copied' : 'Copy'}
              title={copied ? 'Copied' : 'Copy'}
              disabled={!text}
              onClick={() => {
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="size-4" />
            </button>

            <button
              type="button"
              className="btn btn-sm gap-1.5 text-sm btn-primary"
              disabled={!text || busy}
              onClick={() => onInsert(text)}
            >
              <CornerDownLeft className="size-4" />
              Insert
            </button>
          </div>
        </div>

        {/* Rendered only when it has something to say: an always-present line
            would cost 18px of popover height to display a space. */}
        {state.status === 'done' && state.truncated ? (
          <span className="text-sm text-base-content/50">
            Cut short by the model — press again for another attempt
          </span>
        ) : (
          shown?.usage && (
            <span className="text-sm text-base-content/50">
              {shown.usage.totalTokens} tokens
              {shown.creativity > level && ` · creativity ${shown.creativity}`}
            </span>
          )
        )}
      </div>
    </div>
  );
}

interface CreativityProps {
  level: number;
  disabled: boolean;
  onChange: (level: number) => void;
}

/**
 * How far the model may stray, as five dots.
 *
 * A rating rather than a slider or a select: five states read at a glance, take
 * one click to change, and carry their meaning in a `title` instead of a label
 * that would need room this popover does not have. The chosen level is stored
 * globally, so this is set once and then ignored.
 */
function Creativity({ level, disabled, onChange }: CreativityProps) {
  return (
    <div
      className="rating rating-sm"
      role="radiogroup"
      aria-label="How far the model may stray"
      title="How far the model may stray"
    >
      {CREATIVITY.map((preset) => (
        <input
          key={preset.level}
          type="radio"
          name="reply-ai-creativity"
          className="mask mask-circle bg-primary"
          aria-label={`${preset.level} — ${preset.label}`}
          title={`${preset.label}. ${preset.instruction}`}
          checked={preset.level === level}
          disabled={disabled}
          onChange={() => {
            onChange(preset.level);
            void creativitySetting.setValue(preset.level);
          }}
        />
      ))}
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
