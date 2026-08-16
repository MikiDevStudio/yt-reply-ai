import './style.css';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import type { GenerationContext } from '@/lib/messaging';
import { autoGenerate, contextLevel, enabled } from '@/lib/settings';
import { closePopover, openPopover } from './popover';
import { ReplyButton } from './ReplyButton';
import { clearHistory } from './session';
import { studioSurface } from './studio-dom';
import { type CommentData, type CommentSurface, INJECTED_ATTR } from './surface';
import { syncTheme } from './theme';
import { watchSurface } from './youtube-dom';

/**
 * Which page this is.
 *
 * One content script for both rather than one per host: everything below —
 * mounting, the popover, the generation path — is identical, and only the DOM
 * underneath differs. Two entrypoints would mean two copies of this file
 * drifting apart, and a second popover module with its own idea of what is open.
 */
const surface: CommentSurface =
  location.hostname === 'studio.youtube.com' ? studioSurface : watchSurface;

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://studio.youtube.com/*'],
  // Required for createShadowRootUi: WXT hands our CSS to the shadow root
  // instead of injecting it into the page.
  cssInjectionMode: 'ui',

  main(ctx) {
    // Starts off: injection waits for the stored value rather than assuming the
    // default, so someone who switched the extension off never sees a button
    // flash into existence and disappear again.
    void enabled.getValue().then((value) => setInjecting(ctx, value));
    ctx.onInvalidated(enabled.watch((value) => setInjecting(ctx, value)));

    watchComments(ctx);

    // YouTube is an SPA — a normal page load only happens once. Registering a
    // `wxt:locationchange` listener starts WXT's location watcher, which turns
    // history navigation into an event we can react to.
    ctx.addEventListener(window, 'wxt:locationchange', () => scan(ctx));
  },
});

/** Buttons on the page right now, so they can be pulled when switched off. */
const mounted = new Map<HTMLElement, { remove: () => void }>();

/** Whether new comments get a button. Resolved from storage on startup. */
let injecting = false;

/**
 * Turn the injected UI on or off in place.
 *
 * Switching off removes the buttons that are already there instead of leaving
 * them to fail quietly, and clears the marker attribute so switching back on
 * re-injects into the same toolbars.
 */
function setInjecting(ctx: ContentScriptContext, value: boolean) {
  injecting = value;

  if (value) {
    scan(ctx);
    return;
  }

  for (const [toolbar, ui] of mounted) {
    ui.remove();
    toolbar.removeAttribute(INJECTED_ATTR);
  }
  mounted.clear();
  closePopover();
}

/**
 * Watch the comment section for newly rendered comments.
 *
 * The observer is scoped to the comments container rather than `document.body`:
 * YouTube mutates the body constantly (player, sidebar, chips), and observing it
 * wholesale means thousands of pointless callbacks per minute.
 *
 * The container itself is lazy, so we first wait for it to appear.
 */
function watchComments(ctx: ContentScriptContext) {
  let commentsObserver: MutationObserver | undefined;
  let watched: Element | null = null;

  const attach = (container: Element) => {
    commentsObserver?.disconnect();
    watched = container;
    commentsObserver = new MutationObserver(() => scan(ctx));
    commentsObserver.observe(container, { childList: true, subtree: true });
    scan(ctx);
  };

  ctx.onInvalidated(() => commentsObserver?.disconnect());

  // Comments mount well after the rest of the page, and both surfaces replace
  // the container outright on navigation — Studio does it on every filter change
  // too. So the bootstrap observer stays on: it re-attaches whenever the element
  // we are watching is swapped for a new one, and does nothing while it is not.
  const bootstrap = new MutationObserver(() => {
    if (watched?.isConnected) return;

    const container = document.querySelector(surface.commentsContainer);
    if (container && container !== watched) attach(container);
  });

  const existing = document.querySelector(surface.commentsContainer);
  if (existing) attach(existing);

  bootstrap.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => bootstrap.disconnect());
}

/** Mount our button into every comment toolbar that does not have one yet. */
function scan(ctx: ContentScriptContext) {
  if (!injecting) return;

  for (const toolbar of surface.findUninjectedToolbars()) {
    // Mark before mounting: `createIntegratedUi` is async-friendly and a second
    // mutation could otherwise re-enter here for the same toolbar.
    toolbar.setAttribute(INJECTED_ATTR, '');
    mountButton(ctx, toolbar);
  }
}

async function mountButton(ctx: ContentScriptContext, toolbar: HTMLElement) {
  const ui = await createShadowRootUi(ctx, {
    name: 'reply-ai-button',
    position: 'inline',
    anchor: toolbar,
    append: 'last',
    // Keystrokes inside our UI must not reach YouTube, which binds single-key
    // shortcuts globally (space pauses, `k` toggles play, ...).
    isolateEvents: true,
    onMount: (container) => {
      // daisyUI reads the theme off this element; it must sit inside the shadow
      // root, not on the host. See theme.ts.
      ctx.onInvalidated(syncTheme(container));

      const root = ReactDOM.createRoot(container);
      root.render(<ReplyButton onOpen={(button) => void handleOpen(ctx, toolbar, button)} />);
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });

  // Mounting is async, and the user may have switched us off while it ran.
  if (!injecting) {
    toolbar.removeAttribute(INJECTED_ATTR);
    return;
  }

  ui.mount();
  mounted.set(toolbar, ui);
}

async function handleOpen(ctx: ContentScriptContext, toolbar: HTMLElement, anchor: HTMLElement) {
  const comment = surface.readComment(toolbar);
  if (!comment) return;

  const [context, autoStart] = await Promise.all([
    buildContext(comment, toolbar),
    autoGenerate.getValue(),
  ]);

  void openPopover({
    ctx,
    anchor,
    commentId: comment.id,
    context,
    autoStart,
    onInsert: (text) => {
      // The choice is made, so the attempts that lost are no longer interesting.
      // Reopening this comment later is a new question.
      clearHistory(comment.id);
      void insertGeneratedReply(toolbar, text);
    },
  });
}

/**
 * Descriptions already scraped in this tab, keyed by video id.
 *
 * The background holds the authoritative cache; this one only avoids walking
 * the DOM again for every comment on the same video. It is deliberately not
 * cleared on navigation — the key is the video id, so a stale entry is
 * impossible and coming back to a video reuses what we already read.
 */
const scrapedDescriptions = new Map<string, string>();

/**
 * Gather exactly as much context as the chosen level pays for.
 *
 * The level is read here rather than in the background because it decides what
 * to *scrape*, and only the content script can scrape. The background reads it
 * too, and its copy wins when building the prompt — this is about not gathering
 * a description nobody asked for.
 */
async function buildContext(
  comment: CommentData,
  toolbar: HTMLElement,
): Promise<GenerationContext> {
  const level = await contextLevel.getValue();
  const video = level >= 1 ? surface.readVideoContext(toolbar) : null;

  if (video && level >= 2 && !scrapedDescriptions.has(video.videoId)) {
    // Studio has no description to read, so L2 there is L1 and the user is not
    // billed for a tier the page cannot fill.
    const description = surface.readVideoDescription?.(video.videoId);
    if (description) scrapedDescriptions.set(video.videoId, description);
  }

  return {
    commentText: comment.text,
    commentAuthor: comment.author,
    isReply: comment.isReply,
    ...(level >= 1 && comment.parent ? { parent: comment.parent } : {}),
    ...(video
      ? {
          video: {
            ...video,
            // Sent every time; the background keeps the first copy it saw and
            // prefers that, so the prefix stays identical between comments even
            // if a later scrape falls back to the truncated snippet.
            ...(level >= 2 && scrapedDescriptions.has(video.videoId)
              ? { description: scrapedDescriptions.get(video.videoId) }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * Put the generated text in front of the user — and stop there.
 *
 * We never post. The reply box is opened and filled; sending is the user's
 * click on YouTube's own button. That keeps a human in the loop and keeps us
 * clear of Chrome Web Store policy on automated engagement.
 */
async function insertGeneratedReply(toolbar: HTMLElement, text: string) {
  const target = await surface.openReplyBox(toolbar);
  if (!target) {
    // Replies can be disabled on a comment, and the button is absent entirely
    // when signed out. Falling back to the clipboard beats losing the text.
    await navigator.clipboard.writeText(text);
    return;
  }
  surface.insertReplyText(target, text);
}
