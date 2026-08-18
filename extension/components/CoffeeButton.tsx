import cupOnYellow from '@/assets/bmc-on-yellow.png?inline';
import { SUPPORT_URL } from '@/lib/support';

interface CoffeeButtonProps {
  /** Layout only — margins and width. Never colour. */
  className?: string;
}

/**
 * Buy Me a Coffee's own button, rebuilt locally.
 *
 * Their published embed is a `<script>` from `cdnjs.buymeacoffee.com` that
 * writes the button into the page. It cannot ship here for two independent
 * reasons: MV3's CSP forbids remote code in an extension outright, and the
 * script also loads their display face from a font host — a request our privacy
 * policy promises no surface of ours makes. So the button is drawn from their
 * own parameters instead: `#FFDD00`, a black outline, black label, the cup in
 * white, and the words they configured.
 *
 * The one thing not reproduced is Cookie, the script's display face. A webfont
 * for four words costs a network request on our pages and cannot reach a
 * content script at all (see the font note in docs/brand.md), and a button that
 * renders in a different face on each of three surfaces is worse than one that
 * renders in ours on all three.
 *
 * Their colours, not ours — the rule in brand.md §1 for a third party's mark.
 * It is the one filled, rounded, yellow thing in this interface, and that is
 * precisely why it is recognisable: people know what this button is before they
 * read it.
 *
 * `?inline` makes the cup a data URI. A content script cannot load a bundled
 * file by relative path — the URL would resolve against YouTube — and the
 * alternative is `web_accessible_resources` plus `runtime.getURL`, which is a
 * lot of manifest for 2 KB of cup.
 */
export function CoffeeButton({ className = '' }: CoffeeButtonProps) {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noreferrer"
      // Their yellow is a literal on purpose: it is not a token of ours, it is
      // not themed, and it must not follow our palette when the page flips to
      // dark. See "Someone else's furniture" in docs/brand.md.
      className={
        'inline-flex items-center justify-center gap-2 rounded-control border border-black ' +
        'bg-[#FFDD00] px-4 py-2 text-[15px] font-medium leading-none text-black ' +
        'transition-opacity duration-150 hover:opacity-90 ' +
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 ' +
        `focus-visible:outline-accent-bright ${className}`
      }
    >
      <img src={cupOnYellow} alt="" aria-hidden className="h-[18px] w-auto" />
      Buy me a tea
    </a>
  );
}
