/**
 * Keep our daisyUI theme in sync with YouTube's.
 *
 * YouTube's dark mode is a site setting, not an OS setting — a user on a light
 * desktop can run YouTube dark and vice versa. So `prefers-color-scheme` is the
 * wrong signal here. YouTube marks its own state with a `dark` attribute on
 * `<html>`, which is what we follow instead.
 *
 * The attribute goes on an element *inside* the shadow root: daisyUI emits its
 * themes against `:root` and `[data-theme="…"]`, and neither can reach a shadow
 * host from a stylesheet living inside that shadow root.
 */

const LIGHT = 'replyai-light';
const DARK = 'replyai-dark';

function currentTheme(): string {
  return document.documentElement.hasAttribute('dark') ? DARK : LIGHT;
}

/**
 * Apply the current theme to an element and keep it in sync.
 *
 * Returns a cleanup function; hand it to `ctx.onInvalidated`.
 */
export function syncTheme(target: HTMLElement): () => void {
  target.setAttribute('data-theme', currentTheme());

  const observer = new MutationObserver(() => {
    target.setAttribute('data-theme', currentTheme());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['dark'],
  });

  return () => observer.disconnect();
}
