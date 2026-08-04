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

interface PopoverHost {
  container: HTMLElement;
  root: ReactDOM.Root;
}

interface OpenOptions {
  ctx: ContentScriptContext;
  anchor: HTMLElement;
  context: GenerationContext;
  onInsert: (text: string) => void;
}

export async function openPopover({ ctx, anchor, context, onInsert }: OpenOptions): Promise<void> {
  const { container, root } = await ensureHost(ctx);

  position(container, anchor);
  const reposition = () => position(container, anchor);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });

  const close = () => {
    window.removeEventListener('scroll', reposition, { capture: true });
    window.removeEventListener('resize', reposition);
    closePopover();
  };

  container.style.display = 'block';
  root.render(
    // Keying on the comment forces a fresh generation when a different comment
    // is opened while the popover is already up.
    <ReplyPopover
      key={context.commentText.slice(0, 64) + context.commentAuthor}
      context={context}
      onInsert={(text) => {
        onInsert(text);
        close();
      }}
      onClose={close}
    />,
  );
}

export function closePopover(): void {
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

/**
 * Place the popover under its trigger, kept inside the viewport.
 *
 * Flips above the button when there is no room below, which is the common case
 * for comments near the bottom of a long thread.
 */
function position(container: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = container.firstElementChild?.getBoundingClientRect().width ?? 416;
  const height = container.firstElementChild?.getBoundingClientRect().height ?? 320;
  const margin = 8;

  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow < height + margin ? rect.top - height - margin : rect.bottom + margin;

  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);

  container.style.top = `${Math.max(margin, top)}px`;
  container.style.left = `${left}px`;
}
