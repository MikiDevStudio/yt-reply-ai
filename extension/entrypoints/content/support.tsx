import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import { SupportCard } from '@/components/SupportCard';
import { takeNudge } from '@/lib/replies';
import { supportNudges } from '@/lib/settings';
import { syncTheme } from './theme';

/**
 * The support dialog, and the one moment it is allowed to appear.
 *
 * Offered after the popover has closed, never over it: the popover is open
 * while someone is reading a reply and deciding whether to use it, and a modal
 * that lands on that moment is an interruption however politely it is worded.
 * By the time this runs the reply is in the box and the work is done.
 *
 * Everything it needs to decide is on this machine — a count in
 * `storage.sync` and a preference in `storage.local`. Nothing is asked of the
 * network, here or in the card itself.
 */
let host: DialogHost | null = null;

interface DialogHost {
  container: HTMLElement;
  root: ReactDOM.Root;
}

/**
 * Show the dialog if this reply crossed a milestone and the user still wants to
 * see it. Silent otherwise, which is nearly always.
 *
 * `takeNudge` both asks and claims, so two tabs finishing at once cannot both
 * open one. It is called last, after the cheap preference read, so a user who
 * switched the dialog off never consumes their own milestones.
 */
export async function offerSupport(ctx: ContentScriptContext): Promise<void> {
  if (!(await supportNudges.getValue())) return;

  const count = await takeNudge();
  if (count === null) return;

  const { container, root } = await ensureHost(ctx);
  container.style.display = 'block';

  const close = () => closeSupport();

  root.render(
    <div
      // The backdrop. Dimmed rather than blurred, and it closes on click:
      // anywhere outside a thank-you note is a way out of it.
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
        <SupportCard
          count={count}
          onSilence={() => {
            void supportNudges.setValue(false);
            close();
          }}
          onClose={close}
        />
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

      // Above the popover's own 9000: the two are never up together, but the
      // one that opens second is the one that must be reachable.
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
