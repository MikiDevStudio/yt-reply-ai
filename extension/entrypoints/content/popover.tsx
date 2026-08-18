import type { ContentScriptContext } from '#imports';
import ReactDOM from 'react-dom/client';
import type { GenerationContext } from '@/lib/messaging';
import { ReplyPopover } from './ReplyPopover';
import { syncTheme } from './theme';

/**
 * A single popover shared by every comment on the page.
 *
 * One instance rather than one per comment: a watch page can hold hundreds of
 * comments, and mounting a React root under each button would cost far more
 * than it buys. Opening simply re-anchors and re-renders the one instance.
 */
let host: PopoverHost | null = null;

/**
 * Everything the current opening attached to the window: the scroll and resize
 * listeners, and the observer watching the card's size.
 *
 * Held at module level because closing does not always go through the popover
 * itself — the master switch tears the injected UI down from elsewhere, and
 * listeners left behind would keep repositioning a card that is no longer there.
 */
let detach: (() => void) | null = null;

interface PopoverHost {
  container: HTMLElement;
  root: ReactDOM.Root;
}

interface OpenOptions {
  ctx: ContentScriptContext;
  anchor: HTMLElement;
  /** Keys the attempt stack this comment already has, if any. */
  commentId: string;
  context: GenerationContext;
  /** Start generating on open, or wait for the user to press Generate. */
  autoStart: boolean;
  onInsert: (text: string) => void;
  /**
   * Run after this opening closes, however it closed — insert, Escape, the X.
   *
   * Deliberately not fired by `closePopover` itself: that is also how the
   * master switch tears the injected UI down, and a user switching the
   * extension off is not a user finishing a reply.
   */
  onClosed?: () => void;
}

export async function openPopover({
  ctx,
  anchor,
  commentId,
  context,
  autoStart,
  onInsert,
  onClosed,
}: OpenOptions): Promise<void> {
  const { container, root } = await ensureHost(ctx);

  // A fresh opening picks its side again; while it stays open, it keeps it.
  side = null;

  // Opening one comment while another is up replaces it, listeners and all.
  detach?.();

  const reposition = () => position(container, anchor);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });

  // Placement waits on this rather than on a frame callback. React commits when
  // it is ready, which may be after the next frame — measuring on a timer we
  // picked would sometimes measure an empty box. The observer fires exactly when
  // there is something to measure, and again whenever the card changes size: it
  // grows as the reply streams in and as the note field is typed into.
  const observer = new ResizeObserver(() => {
    reposition();
    // Revealed only once it has been placed, so it is never drawn in the wrong
    // spot and then moved.
    if (container.firstElementChild) container.style.visibility = 'visible';
  });

  detach = () => {
    window.removeEventListener('scroll', reposition, { capture: true });
    window.removeEventListener('resize', reposition);
    observer.disconnect();
    detach = null;
  };

  const close = () => {
    closePopover();
    onClosed?.();
  };

  container.style.display = 'block';
  // Nothing has been rendered yet, so there is nothing to measure and nowhere
  // correct to put it. Hidden until the first frame says how big it is.
  container.style.visibility = 'hidden';
  root.render(
    // Keying on the comment remounts when a different comment is opened while
    // the popover is already up, so state never leaks between comments.
    <ReplyPopover
      key={commentId}
      commentId={commentId}
      context={context}
      autoStart={autoStart}
      onInsert={(text) => {
        onInsert(text);
        close();
      }}
      onClose={close}
    />,
  );

  // The container is `position: fixed` with no width of its own, so its box is
  // the card's box — one observer covers both the first placement and every
  // resize after it.
  observer.observe(container);
}

export function closePopover(): void {
  // Runs whoever closed it — the button, Escape, Insert, or the master switch
  // turning the whole injected UI off.
  detach?.();

  if (!host) return;
  host.root.render(null);
  host.container.style.display = 'none';
}

async function ensureHost(ctx: ContentScriptContext): Promise<PopoverHost> {
  if (host) return host;

  const ui = await createShadowRootUi(ctx, {
    name: 'reply-ai-popover',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    // YouTube binds single-key shortcuts globally — space pauses the video, `k`
    // toggles play. Without this, typing in our UI would control the player.
    isolateEvents: true,
    onMount: (container) => {
      ctx.onInvalidated(syncTheme(container));

      // Sits above YouTube's own overlays; the masthead is z-index 2200.
      container.style.position = 'fixed';
      container.style.zIndex = '9000';
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

  return host;
}

const MARGIN = 8;

/**
 * Which side of the button this opening chose.
 *
 * Decided once and then held. It used to be recomputed on every scroll event,
 * from a card whose height changes as the reply streams in — so the popover
 * flipped from under the button to over it and back while the page moved under
 * it, which reads as the thing jumping around by itself.
 */
let side: 'below' | 'above' | null = null;

/**
 * Place the popover against its trigger, kept whole and inside the viewport.
 *
 * The side is chosen on the first call after opening; every call after that
 * only slides the card to keep it on screen. Sliding rather than flipping is
 * the point: a flip moves the card past the pointer that is aiming at it.
 */
function position(container: HTMLElement, anchor: HTMLElement): void {
  const card = container.firstElementChild?.getBoundingClientRect();
  if (!card) return;

  const rect = anchor.getBoundingClientRect();

  if (side === null) {
    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;
    // Below unless it does not fit and above fits better. Ties go below, which
    // is where a menu opened by a button is expected to be.
    side = card.height <= below || below >= above ? 'below' : 'above';
  }

  const top = side === 'below' ? rect.bottom + MARGIN : rect.top - card.height - MARGIN;

  // Clamp last, so a card that would hang off either edge slides back into the
  // viewport instead of being cut off. `maxTop` is floored at the margin for the
  // card taller than the window: showing its top beats showing neither end.
  const maxTop = Math.max(MARGIN, window.innerHeight - card.height - MARGIN);
  const maxLeft = Math.max(MARGIN, window.innerWidth - card.width - MARGIN);

  container.style.top = `${Math.min(Math.max(MARGIN, top), maxTop)}px`;
  container.style.left = `${Math.min(Math.max(MARGIN, rect.left), maxLeft)}px`;
}
