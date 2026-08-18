import { FOCUS } from '@/components/ui';
import { SUPPORT_URL } from '@/lib/support';

/**
 * Drawn back to front, the way the prototype stacked them: the highest-numbered
 * circle is furthest back, so the first one in the list ends up underneath.
 */
const CIRCLES = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

/**
 * The coffee ask as it appears in the reply popover: a small glowing panel with
 * a gradient cup and one word.
 *
 * It replaces the flat grey cup that used to sit in this row. That mark was
 * honest and completely invisible — an icon the size of the copy button,
 * beside a copy button, is not an ask anybody ever notices. This is the
 * standing half of #45: the card only appears once in fifty replies now, and
 * that is affordable only because something quiet is always in view. This row
 * is the place for it, because the popover is opened a hundred times for every
 * time the toolbar popup is.
 *
 * ## Why it is not their yellow
 *
 * `components/CoffeeButton.tsx` is Buy Me a Coffee's own button, in their
 * colours, and it is still what the popup and the settings page show — the mark
 * has to appear somewhere undisguised. This is not that button and does not
 * pretend to be: it carries our accents, our own drawing of a cup and the word
 * *Coffee*, and it is an ordinary outbound link to their site. Borrowing their
 * yellow for a control this size, in a row of our own buttons, would read as
 * their furniture bolted to our panel; keeping it ours is the more honest of
 * the two, and it is the one that draws the eye.
 *
 * ## It does not follow the theme
 *
 * The ground stays dark and the circles keep their hues on light YouTube as on
 * dark, exactly as the yellow button does. It is one object in both themes
 * rather than two, which is what makes it recognisable at this size.
 *
 * The markup is deliberately dumb: an anchor, a masked wrapper, a field of
 * circles and a label. Everything that makes it move lives in
 * `entrypoints/content/style.css`, beside the note on what
 * `prefers-reduced-motion` does to it.
 */
export function CoffeeGlow() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Buy me a coffee"
      title="Buy me a coffee"
      className={`coffee-glow ${FOCUS}`}
    >
      <span className="wrapper">
        <span className="field" aria-hidden>
          {CIRCLES.map((n) => (
            <span key={n} className={`circle circle-${n}`} />
          ))}
        </span>
        <span className="label">
          <Cup />
          Coffee
        </span>
      </span>
    </a>
  );
}

/**
 * A paper cup with two wisps of steam, stroked with a gradient that runs from
 * the accent orange into the violet.
 *
 * Drawn here rather than taken from lucide because lucide's `Coffee` is a mug
 * with a handle, and the thing being pointed at is a takeaway cup. Drawn as SVG
 * rather than reusing the bundled PNG for the same reason the whole button is
 * ours: a raster mark cannot carry a gradient, and their cup belongs on their
 * button.
 *
 * The gradient id is scoped by the shadow root the popover lives in, and only
 * one of these is ever mounted, so a bare id is safe here.
 */
function Cup() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="url(#coffee-glow-cup)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <defs>
        <linearGradient id="coffee-glow-cup" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC58F" />
          <stop offset="0.5" stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#B79BFF" />
        </linearGradient>
      </defs>
      {/* Lid, cup, and the steam that says it is hot. */}
      <rect x="3.6" y="5.6" width="16.8" height="3" rx="1.2" />
      <path d="M5.2 8.6h13.6l-1.5 11.1a2 2 0 0 1-2 1.7H8.7a2 2 0 0 1-2-1.7L5.2 8.6Z" />
      <path d="M9.6 1.8c0 1.1-1 1.3-1 2.4M14.4 1.8c0 1.1-1 1.3-1 2.4" />
    </svg>
  );
}
