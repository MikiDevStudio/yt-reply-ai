/**
 * The recurring pieces of docs/brand.md, named once.
 *
 * Class strings rather than components: these are worn by buttons, labels and
 * links alike, and wrapping each in a component would mean re-exposing every
 * attribute the underlying element already has.
 *
 * daisyUI's `btn` is deliberately absent. It ties font size to a fixed control
 * height — 32px at `btn-sm` — and our surfaces run smaller than that. Once
 * height, padding and text size are all overridden, nothing of the component is
 * left but its name.
 *
 * Sizes are px, never rem: `rem` resolves against the host document's root, and
 * YouTube sets it to 62.5%. See the note in assets/theme.css.
 */

/** Focus ring, one rule for everything focusable. */
export const FOCUS =
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-bright';

/** Ghost icon button: close, reset, stop, retry, copy, the pager chevrons. */
export const ICON =
  'grid size-7 shrink-0 place-items-center text-base-content/55 transition-colors duration-150 ' +
  `hover:text-base-content disabled:pointer-events-none disabled:text-base-content/22 ${FOCUS}`;

/**
 * The one solid button on a surface. In the popover that is Generate before the
 * first attempt and Insert once a reply exists — the fill always marks the
 * single action the user came for, and there is never a second one.
 */
export const SOLID =
  'flex items-center gap-1.5 bg-neutral px-3 py-1.5 text-[13px] font-medium text-neutral-content ' +
  `transition-colors duration-150 hover:bg-solid-hi disabled:pointer-events-none disabled:opacity-40 ${FOCUS}`;

/** Outlined. Everything that is an action but not *the* action. */
export const SECONDARY =
  'flex items-center gap-1.5 border border-line-hi px-3 py-1.5 text-[13px] font-medium text-base-content/70 ' +
  'transition-colors duration-150 hover:bg-base-content/5 hover:text-base-content ' +
  `disabled:pointer-events-none disabled:opacity-40 ${FOCUS}`;

/**
 * A choice, not an action: tone, reply length, emoji, the rule for a kind of
 * comment. Selected is drawn with a line and a wash, never a filled orange
 * button — the accent is a line everywhere in this interface.
 */
export const CHIP = `border px-2.5 py-1 text-[12px] transition-colors duration-150 ${FOCUS}`;
export const CHIP_OFF =
  'border-line text-base-content/70 hover:border-line-hi hover:text-base-content';
export const CHIP_ON = 'border-accent-line bg-accent-soft text-accent';

/** Text only. An action that is neither *the* action nor an icon on its own. */
export const GHOST =
  'flex items-center gap-1.5 px-2 py-1.5 text-[13px] font-medium text-base-content/55 ' +
  `transition-colors duration-150 hover:text-base-content disabled:pointer-events-none disabled:opacity-40 ${FOCUS}`;

/**
 * Text inputs and textareas. Sharp, quiet, and lit by the border rather than a
 * fill — the accent is a line here as everywhere else.
 *
 * The focus ring rides along with the border change on purpose: a 1px border in
 * a colour is not a focus indicator anyone can find with a keyboard.
 */
export const FIELD =
  'w-full border border-line-input bg-base-100 px-3 py-2 text-[13px] text-base-content ' +
  `placeholder:text-base-content/28 transition-colors duration-150 focus:border-accent-line ${FOCUS}`;

/**
 * An inline note about the state of what is on screen — hand-written profile,
 * withdrawn model. Same frame as the failure card's warning tone, because they
 * say the same kind of thing.
 */
export const NOTE =
  'flex w-full flex-col items-start gap-2 border border-warning/25 bg-warning/10 p-3 text-[13px]';

/**
 * The type half of our signature label — mono, uppercase, wide — with no colour
 * of its own. For the handful of labels that carry a status colour instead of
 * sitting at the bottom of the ink ladder.
 */
export const MICRO_TYPE = 'font-mono text-[10px] font-medium uppercase tracking-[0.14em]';

/** The label as it usually appears: quiet, a service note beside real content. */
export const MICRO = `${MICRO_TYPE} text-base-content/40`;
