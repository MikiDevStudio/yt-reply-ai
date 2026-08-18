import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import { SupportCard } from '@/components/SupportCard';
import { syncTheme } from './theme';

/**
 * The support card, and the one moment it appears.
 *
 * It is raised over the popover the instant a milestone reply arrives —
 * deliberately between the answer being written and the answer being used,
 * with the page dimmed behind it. That placement is the whole design: the
 * extension is free and has no cap, so the only thing it ever asks for is one
 * interrupted moment every twentieth reply, and an interruption that waits
 * politely until the work is finished is one nobody reads.
 *
 * It is dismissible in three ways — the close button, Escape, a click on the
 * backdrop — and it never blocks the reply itself: the text is in the popover
 * behind it and Insert is one dismissal away. Friction, not a hostage.
 *
 * Whether it is due at all is decided in the background worker, which is the
 * only single writer for the counter (see `takeNudge`). By the time this runs
 * the milestone has already been claimed, so nothing here can double-show it.
 */
let host: DialogHost | null = null;

interface DialogHost {
  container: HTMLElement;
  root: ReactDOM.Root;
}

/**
 * Show the card for a milestone the counter has already crossed.
 *
 * Its own shadow root rather than a corner of the popover's: the popover is
 * anchored to a comment and positioned by script, and a modal that inherits
 * that container inherits its offsets and its z-index. This one sits above it
 * at 9100 and covers the viewport.
 */
export async function showSupport(ctx: ContentScriptContext, count: number): Promise<void> {
  const { container, root } = await ensureHost(ctx);
  container.style.display = 'block';

  const close = () => closeSupport();

  root.render(
    <div
      // The backdrop. Dimmed rather than blurred — a blur over a comment
      // section reads as a modal from another product — and it closes on
      // click: anywhere outside a thank-you note is a way out of it.
      className="fixed inset-0 grid place-items-center bg-black/55 p-4 motion-safe:animate-backdrop-in"
      role="presentation"
      onClick={close}
    >
      {/* The card is the dialog; the backdrop is only the way out of it, so a
          click inside must not travel up to the handler above. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Support Reply AI"
        className="motion-safe:animate-dialog-in"
        onClick={(event) => event.stopPropagation()}
      >
        <SupportCard count={count} onClose={close} />
      </div>
    </div>,
  );
}

export function closeSupport(): void {
  if (!host) return;
  host.root.render(null);
  host.container.style.display = 'none';
}

async function ensureHost(ctx: ContentScriptContext): Promise<DialogHost> {
  if (host) return host;

  const ui = await createShadowRootUi(ctx, {
    name: 'reply-ai-support',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    // YouTube binds single-key shortcuts globally — space pauses the video.
    // Without this, dismissing the dialog with the keyboard would drive the
    // player as well.
    isolateEvents: true,
    onMount: (container) => {
      ctx.onInvalidated(syncTheme(container));

      // Above the popover's own 9000: the two are up together by design, and
      // the one that opened second is the one that has to be reachable.
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.zIndex = '9100';
      container.style.display = 'none';

      return ReactDOM.createRoot(container);
    },
    onRemove: (root) => root?.unmount(),
  });

  ui.mount();

  host = { container: ui.uiContainer, root: ui.mounted! };
  ctx.onInvalidated(() => {
    host = null;
  });

  // Escape closes, like every other overlay we draw. Registered once with the
  // host rather than per opening — the listener costs nothing while nothing is
  // shown, and an opening cannot then leave one behind.
  ctx.addEventListener(document, 'keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeSupport();
  });

  return host;
}
