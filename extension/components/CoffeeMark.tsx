import darkMark from '@/assets/bmc-dark.png?inline';
import lightMark from '@/assets/bmc-light.png?inline';

interface CoffeeMarkProps {
  /** Height utility. The width follows the mark's own proportions. */
  className?: string;
}

/**
 * Buy Me a Coffee's own cup.
 *
 * Someone else's mark, and treated the way the brand book treats the button we
 * inject into YouTube's toolbar: it is their furniture, so it keeps their
 * colours rather than being pulled into our palette. That is also why the
 * yellow here is not a third accent — it is not ours to change.
 *
 * Two files rather than one because their asset outlines the cup in white,
 * which is no outline at all on the light theme. The light copy is the same
 * mark with that one flat white taken to our near-black; the yellow is
 * untouched. Swap in their official dark-outline file and this keeps working.
 *
 * `?inline` makes both data URIs. A content script cannot load a bundled file
 * by relative path — the URL would resolve against YouTube — and the
 * alternative is `web_accessible_resources` plus `runtime.getURL`, which is a
 * lot of manifest for 2KB of cup.
 */
export function CoffeeMark({ className = 'h-4' }: CoffeeMarkProps) {
  return (
    <>
      <img
        src={darkMark}
        alt=""
        aria-hidden
        className={`hidden w-auto theme-dark:block ${className}`}
      />
      <img
        src={lightMark}
        alt=""
        aria-hidden
        className={`hidden w-auto theme-light:block ${className}`}
      />
    </>
  );
}
