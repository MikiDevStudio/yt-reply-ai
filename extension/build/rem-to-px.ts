import type { Plugin } from 'vite';

/** Root font size the design is authored against. */
const DESIGN_ROOT_PX = 16;

/**
 * Rewrite every `rem` length in the content script's CSS to `px`.
 *
 * `rem` always resolves against the *document* root — a shadow root offers no
 * protection from it. YouTube sets `html { font-size: 62.5% }`, so a page that
 * assumes the usual 16px root renders at 10px and the whole injected UI comes
 * out at 62.5% scale: 14px text becomes 8.75px.
 *
 * Overriding Tailwind's theme tokens only fixes the utilities we write. daisyUI
 * hardcodes `rem` inside its own component rules (`--btn-p: 1rem`,
 * `padding: 1rem`, `font-size: .875rem`), and nothing in the theme layer can
 * reach those. Converting the generated stylesheet at build time catches
 * everything, costs nothing at runtime, and cannot drift out of sync the way a
 * hand-maintained override list would.
 *
 * Scoped to the content script on purpose. Extension pages are our own
 * documents with a normal root, so `rem` behaves there — and keeping it means
 * they still respect a user's larger default font size.
 */
export function remToPx(): Plugin {
  return {
    name: 'reply-ai:rem-to-px',
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        if (!file.fileName.includes('content')) continue;

        const css = String(file.source);
        file.source = css.replace(
          /(-?\d*\.?\d+)rem\b/g,
          (_match, value: string) => `${Number(value) * DESIGN_ROOT_PX}px`,
        );
      }
    },
  };
}
