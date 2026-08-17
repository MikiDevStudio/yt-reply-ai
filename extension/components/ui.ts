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
 * The type half of our signature label — mono, uppercase, wide — with no colour
 * of its own. For the handful of labels that carry a status colour instead of
 * sitting at the bottom of the ink ladder.
 */
export const MICRO_TYPE = 'font-mono text-[10px] font-medium uppercase tracking-[0.14em]';

/** The label as it usually appears: quiet, a service note beside real content. */
export const MICRO = `${MICRO_TYPE} text-base-content/40`;
