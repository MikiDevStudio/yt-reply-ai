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
import { CoffeeGlow } from '@/components/CoffeeGlow';
import { CoffeeMark } from '@/components/CoffeeMark';
import { FailureNotice } from '@/components/FailureNotice';
import { ReviewAsk } from '@/components/ReviewAsk';
import { SupportCard } from '@/components/SupportCard';
import { FOCUS, ICON, MICRO, MICRO_TYPE, SECONDARY, SOLID } from '@/components/ui';
import { detectLanguage } from '@/lib/language';
import { licensed } from '@/lib/licence';
import type { GenerationContext } from '@/lib/messaging';
import { angleFor, CREATIVITY, STYLES } from '@/lib/prompt';
import {
  type Audience,
  autoGenerate as autoGenerateSetting,
  creativity as creativitySetting,
  replyAs as replyAsSetting,
} from '@/lib/settings';
import { SUPPORT_URL } from '@/lib/support';
import { useGeneration } from '@/lib/use-generation';
import {
  type Attempt,
  moveCursor,
  pushAttempt,
  readHistory,
  readLanguageOverride,
  readNote,
  writeLanguageOverride,
  writeNote,
} from './session';

/** Order shown in the picker. `auto` first because it is the default. */
const STYLE_ORDER = ['auto', 'friendly', 'humorous', 'engaging', 'brief'] as const;

/** A language name is a word or two. Anything longer is someone writing instructions. */
const MAX_LANGUAGE_LENGTH = 40;

interface Status {
  dot: string;
  label: string;
  /** Only where the label alone would leave the user guessing what to do. */
  hint?: string;
}

/**
 * Where the reply stands, as a 6px dot and a mono label.
 *
 * `truncated` earns a row here rather than a sentence under the popover: it is
 * a fact about this reply, it belongs where the other facts about this reply
 * are, and the button that fixes it is already on screen.
 *
 * The book also lists a `stopped` row. There is no state for it here: `cancel`
 * drops back to idle and takes the partial text with it, so a stopped run is
 * indistinguishable from one that never started.
 */
const STATUS: Record<'empty' | 'writing' | 'done' | 'truncated' | 'failed', Status> = {
  empty: { dot: 'bg-line-hi', label: 'empty' },
  writing: { dot: 'bg-accent-bright motion-safe:animate-dot-pulse', label: 'writing' },
  done: { dot: 'bg-primary', label: 'done' },
  truncated: {
    dot: 'bg-warning',
    label: 'cut short',
    hint: 'The model stopped mid-reply. Press retry for another attempt.',
  },
  failed: { dot: 'bg-error', label: 'failed' },
};

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

  /**
   * The two asks, raised by the reply that just landed and drawn at the foot of
   * this popover rather than over it.
   *
   * Held here rather than by the surface that owns the shadow roots, which is
   * where the card used to live when it was a modal with its own root and its
   * own backdrop. Inside the popover it is simply another block, so it belongs
   * to the component the block is inside. Both are cleared when the popover is
   * keyed to a different comment, which is what the user would expect: an ask
   * attached to one reply does not follow them to the next comment.
   *
   * The worker decides when either is due and never sends both at once; see
   * `takeNudge` and `takeReview` in lib/replies.ts.
   */
  const [nudge, setNudge] = useState<number | null>(null);
  const [review, setReview] = useState(false);

  /**
   * Whether a licence has been activated, which is what turns the glowing
   * coffee button back into the quiet mark it replaced (#45).
   *
   * `null` until the answer lands, and the row draws nothing in that slot until
   * it does — a button that swaps shape a frame after the popover opens is a
   * button that moves the three beside it.
   */
  const [paid, setPaid] = useState<boolean | null>(null);

  const [note, setNote] = useState(() => readNote(commentId));
  const [audience, setAudience] = useState<Audience>('owner');
  const [autoOn, setAutoOn] = useState(autoStart);

  // Read by `start`, which can be called in the same handler that changes the
  // audience — before a re-render has made the new value visible to it.
  const audienceRef = useRef<Audience | null>(null);

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
    void replyAsSetting.getValue().then((stored) => {
      setAudience(stored);
      audienceRef.current = stored;
    });
    void licensed().then(setPaid);
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
      // Until the stored value has arrived the worker's own copy is the better
      // answer, so say nothing rather than send a default that may be wrong.
      ...(audienceRef.current ? { audience: audienceRef.current } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
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

    // Inside the same guarded block as filing the attempt, so a re-render
    // cannot raise either block twice for one reply.
    if (state.nudge !== undefined) setNudge(state.nudge);
    if (state.review) setReview(true);
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
  const failure = state.status === 'error' ? state.facts : null;
  // While streaming, the live text wins over the stack; the new attempt joins it
  // only once it is complete. A failed attempt that got partway leaves its text
  // here too — it is the most recent thing the user asked for, and it is often
  // close enough to edit into a reply.
  const text = busy ? state.text : (failure?.partial ?? shown?.text ?? '');

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

  /**
   * Switch who the reply speaks as, and regenerate if something is already on
   * screen — the same bargain the tone chips make.
   */
  const chooseAudience = (next: Audience) => {
    if (next === audience) return;

    setAudience(next);
    audienceRef.current = next;
    void replyAsSetting.setValue(next);
    if (started.current && !busy) start();
  };

  /**
   * Auto-generation, moved here from the settings page: it is decided while
   * looking at a comment, not on another tab.
   *
   * Turning it on deliberately starts nothing. It says what the next popover
   * should do; spending a request on the comment already open would be a
   * surprise, and turning it off mid-stream would not stop that stream either.
   */
  const toggleAuto = (on: boolean) => {
    setAutoOn(on);
    void autoGenerateSetting.setValue(on);
  };

  /**
   * Kept per comment for as long as its attempts are, so closing the popover by
   * accident does not lose what was typed. Nothing is sent until Generate.
   */
  const changeNote = (value: string) => {
    setNote(value);
    writeNote(commentId, value.trim());
  };

  const overridden = language.trim().length > 0 && language.trim() !== detected;

  // What the shown attempt cost. It rides in the reply block's own label row
  // rather than under the popover: a line that appears only once an answer
  // exists is a line that grows the popover the moment one arrives, which is
  // exactly when the user is reading it.
  const cost = shown?.usage
    ? `${shown.usage.totalTokens} tokens${
        shown.creativity > level ? ` · creativity ${shown.creativity}` : ''
      }`
    : null;

  const status = busy
    ? STATUS.writing
    : failure
      ? STATUS.failed
      : state.status === 'done' && state.truncated
        ? STATUS.truncated
        : text
          ? STATUS.done
          : STATUS.empty;

  return (
    // Width in px, not rem: see the note in assets/theme.css. The one shadow we
    // allow ourselves lives here — this is the only thing we draw that floats
    // over a page we do not own.
    <div className="w-[460px] max-w-[90vw] border border-line-hi bg-overlay text-base-content shadow-elevated motion-safe:animate-popover-in">
      <div className="flex flex-col gap-3 p-3 text-[14px] leading-[1.6]">
        {/* 1 · Header. Title in full ink, everything beside it ghost. The two
            halves of the name carry two weights of attention, which is how a
            heading gets its hierarchy here — not from a second colour. */}
        <div className="flex items-center gap-2">
          <h3 className="shrink-0 text-[16px] font-semibold leading-[1.2] tracking-[-0.01em]">
            AI <span className="text-base-content/55">reply</span>
          </h3>

          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              type="text"
              value={language}
              maxLength={MAX_LANGUAGE_LENGTH}
              placeholder={detected ?? 'Comment language'}
              aria-label="Reply language"
              title="Language to reply in. Empty follows the comment."
              className="min-w-0 flex-1 border-b border-line bg-transparent px-1 py-0.5 text-[13px] text-base-content/70 transition-colors duration-150 placeholder:text-base-content/28 focus:border-accent-line focus:outline-none disabled:opacity-40"
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
                className={ICON}
                aria-label="Back to the comment's language"
                title="Back to the comment's language"
                disabled={busy}
                onClick={() => applyLanguage('')}
              >
                <RotateCcw className="size-4" />
              </button>
            ) : (
              <span className={`${MICRO} shrink-0 px-1`} title="Detected from the comment">
                auto
              </span>
            )}
          </div>

          <button type="button" className={ICON} onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* 2 · The comment being answered. One of the two places in the popover
            that is allowed a radius: it is a quoted block, not a panel.

            Three lines at rest, and the rest of a long comment is a scroll
            away. It used to be clamped, which read as tidy right up to the
            comment that actually needed reading. `overscroll-contain` keeps the
            wheel inside the box — without it, reaching the end of the quote
            hands the scroll to YouTube and the page moves out from under the
            popover. */}
        <div className="max-h-[77px] overflow-y-auto overscroll-contain rounded-control bg-surface-hi px-2.5 py-2">
          <p className="text-[13px] leading-[1.55] text-base-content/55">
            {context.commentAuthor && (
              <span className="font-medium text-base-content/70">{context.commentAuthor}: </span>
            )}
            {context.commentText || 'This comment has no text.'}
          </p>
        </div>

        {/* 3 · Who is speaking, and whether the next popover starts by itself. */}
        <div className="flex items-center gap-2">
          <div className="flex border border-line" role="group" aria-label="Reply as">
            {(['owner', 'viewer'] as const).map((role, index) => (
              <button
                key={role}
                type="button"
                // The top rule is on every segment, transparent until the
                // segment is active: colouring an existing border cannot shift
                // the label by a pixel the way adding one would.
                className={`border-t px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors duration-150 ${
                  index > 0 ? 'border-l border-l-line' : ''
                } ${
                  audience === role
                    ? 'border-t-primary bg-accent-soft text-primary'
                    : 'border-t-transparent text-base-content/55 hover:text-base-content'
                } ${FOCUS}`}
                title={
                  role === 'owner'
                    ? 'Answering as the channel owner'
                    : 'Answering as a viewer, speaking only for yourself'
                }
                aria-pressed={audience === role}
                disabled={busy}
                onClick={() => chooseAudience(role)}
              >
                {role === 'owner' ? 'channel' : 'viewer'}
              </button>
            ))}
          </div>

          {/* Creativity sits with the other two rather than down in the action
              row, because it is the same kind of thing they are: a choice made
              before generating, not a control over what came back. */}
          <Creativity level={level} disabled={busy} onChange={setLevel} />

          <label
            className="ml-auto flex cursor-pointer items-center gap-2"
            title="Start writing as soon as the popover opens"
          >
            <input
              type="checkbox"
              className="toggle toggle-xs"
              checked={autoOn}
              onChange={(event) => toggleAuto(event.target.checked)}
            />
            <span className={MICRO}>auto</span>
          </label>
        </div>

        {/* 4 · Tone. Chips, never a filled orange one. */}
        <div className="flex flex-wrap gap-2">
          {STYLE_ORDER.map((name) => (
            <button
              key={name}
              type="button"
              className={`px-2.5 py-1 text-[13px] transition-colors duration-150 ${
                style === name
                  ? 'border border-accent-line bg-accent-soft text-primary'
                  : 'border border-line text-base-content/70 hover:border-line-hi hover:text-base-content'
              } disabled:pointer-events-none disabled:opacity-40 ${FOCUS}`}
              title={STYLES[name]}
              disabled={busy}
              onClick={() => setStyle(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {/*
          5 · Optional, and empty by default: the note is what the user knows and
          the page does not. It is read when Generate is pressed rather than on
          every keystroke — a field that regenerated as you typed would spend a
          request per word.

          `field-sizing-content` grows it from two rows to four and then stops,
          which is the brand's rule for this field and costs no JavaScript. The
          bounds are px because a `rem` written into an arbitrary value is the
          one thing the build's rem-to-px pass cannot reach.
        */}
        <textarea
          className="min-h-[60px] max-h-[102px] w-full resize-none border border-line-input bg-base-100 px-2.5 py-2 text-[14px] leading-[1.5] transition-colors duration-150 field-sizing-content placeholder:text-base-content/28 focus:border-accent-line focus:outline-none disabled:opacity-40"
          rows={2}
          value={note}
          disabled={busy}
          aria-label="Note for this reply"
          placeholder="Optional: what to say, or a draft to fix up"
          onChange={(event) => changeNote(event.target.value)}
        />

        {/* 6 · The reply. The box never collapses between states — an empty one,
            a streaming one and a finished one are the same rectangle, so the
            popover does not resize under the cursor while a reply arrives. */}
        {(text || !failure) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2" title={status.hint}>
              <span className={MICRO}>reply</span>
              <span aria-hidden className="h-px flex-1 bg-line" />
              {cost && <span className={MICRO}>{cost}</span>}
              <span aria-hidden className={`size-1.5 rounded-full ${status.dot}`} />
              <span className={status.hint ? `${MICRO_TYPE} text-warning` : MICRO}>
                {status.label}
              </span>
            </div>

            <div
              ref={streamRef}
              className="max-h-56 min-h-20 overflow-y-auto whitespace-pre-wrap border border-line p-2.5 text-base-content/92"
            >
              {text}
              {busy && <StreamingDots inline={text.length > 0} />}
              {!text && !busy && (
                <span className="text-base-content/45">Pick a tone, then press Generate.</span>
              )}
            </div>
          </div>
        )}

        {failure && <FailureNotice facts={failure} onRetry={() => start()} />}

        {/* 7 · Actions. Counters on the left, what to do next on the right. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {attempts.length > 1 && (
              <div className="flex items-center">
                <button
                  type="button"
                  className={ICON}
                  aria-label="Previous attempt"
                  title="Previous attempt"
                  disabled={busy || cursor === 0}
                  onClick={() => show(cursor - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                {/* Retries cost real money, so the count is stated, never hidden. */}
                <span className="font-mono text-[13px] text-base-content/55">
                  {cursor + 1}/{attempts.length}
                </span>
                <button
                  type="button"
                  className={ICON}
                  aria-label="Next attempt"
                  title="Next attempt"
                  disabled={busy || cursor === attempts.length - 1}
                  onClick={() => show(cursor + 1)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}

          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* A link, not a button, and the only thing on this row that does
                not act on the reply.

                It used to be their grey mark at icon size, beside a copy
                button, which is to say invisible. #45 made the card in this
                popover five times rarer, and a rare card is only affordable if
                something quiet is always in view — so this became the standing
                ask, lit and drifting. A licence turns it back into the mark: an
                accent is exactly what somebody who has already given something
                should stop being shown. Nothing is drawn until that answer
                arrives, so the row is never rearranged under the cursor. */}
            {paid === null ? null : paid ? (
              <a
                className={ICON}
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Buy me a coffee"
                title="Buy me a coffee"
              >
                <CoffeeMark className="h-4" />
              </a>
            ) : (
              <CoffeeGlow />
            )}

            {busy ? (
              <button
                type="button"
                className={ICON}
                aria-label="Stop"
                title="Stop"
                onClick={cancel}
              >
                <Square className="size-4" />
              </button>
            ) : (
              /*
               * One condition decides both the shape and the contents. They
               * used to be decided by two: the label appeared whenever no
               * attempt had succeeded, but the wide shape only while the state
               * was still `idle` — so after a failure the word "Generate" was
               * put inside a fixed-size square and burst out of it, over the
               * button beside it.
               */
              <button
                type="button"
                className={attempts.length === 0 ? SOLID : ICON}
                aria-label={attempts.length === 0 ? undefined : 'Another attempt'}
                title={attempts.length === 0 ? undefined : 'Another attempt'}
                onClick={() => start()}
              >
                {attempts.length === 0 ? 'Generate' : <RefreshCw className="size-4" />}
              </button>
            )}

            <button
              type="button"
              className={ICON}
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

            {/* Solid only once there is something to insert: before that the
                fill belongs to Generate, and one surface gets one fill. */}
            <button
              type="button"
              className={text && !busy ? SOLID : SECONDARY}
              disabled={!text || busy}
              onClick={() => onInsert(text)}
            >
              <CornerDownLeft className="size-4" />
              Insert
            </button>
          </div>
        </div>

        {/* 8 · What this product asks for, and the only place it asks. Under
            the action row rather than above it: the reply is finished, Insert
            has not moved, and the popover has grown downwards by a panel that
            covers nothing. Both are dismissible and neither holds anything. */}
        {review && (
          <ReviewAsk onClose={() => setReview(false)} onAnswer={() => setReview(false)} />
        )}
        {nudge !== null && <SupportCard count={nudge} onClose={() => setNudge(null)} />}
      </div>
    </div>
  );
}

/**
 * Three dots that say a reply is on its way.
 *
 * Opacity only, and staggered — nothing moves or scales, which is the rule for
 * every hover and every loop in this interface.
 */
function StreamingDots({ inline }: { inline: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center gap-1 align-middle ${inline ? 'ml-1.5' : ''}`}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-accent-bright motion-safe:animate-dot-pulse"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
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
 * A rating rather than a slider or a select: five states read at a glance and
 * take one click to change. The chosen level is stored globally, so this is set
 * once and then mostly ignored — which is exactly why it needs the label. Five
 * unexplained dots in the corner of a panel do not read as a control at all,
 * and a `title` only helps someone who already suspected there was something
 * to hover.
 *
 * Dots, not stars. A star is a rating widget from another product.
 */
function Creativity({ level, disabled, onChange }: CreativityProps) {
  return (
    <div className="flex items-center gap-2" title="How far the model may stray from the comment">
      <span className={`${MICRO} shrink-0`} aria-hidden>
        creativity
      </span>
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label="How far the model may stray"
      >
        {CREATIVITY.map((preset) => (
          <input
            key={preset.level}
            type="radio"
            name="reply-ai-creativity"
            className={`size-2.5 cursor-pointer appearance-none rounded-full transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ${
              preset.level === level ? 'bg-primary' : 'bg-line-hi hover:bg-base-content/30'
            } ${FOCUS}`}
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
    </div>
  );
}
