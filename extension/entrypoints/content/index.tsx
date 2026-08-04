import './style.css';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import type { GenerationContext } from '@/lib/messaging';
import { autoGenerate, contextLevel } from '@/lib/settings';
import { openPopover } from './popover';
import { ReplyButton } from './ReplyButton';
import { syncTheme } from './theme';
import {
  COMMENTS_CONTAINER,
  type CommentData,
  INJECTED_ATTR,
  findUninjectedToolbars,
  insertReplyText,
  openReplyBox,
  readComment,
  readVideoContext,
  readVideoDescription,
} from './youtube-dom';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  // Required for createShadowRootUi: WXT hands our CSS to the shadow root
  // instead of injecting it into the page.
  cssInjectionMode: 'ui',

  main(ctx) {
    scan(ctx);
    watchComments(ctx);

    // YouTube is an SPA — a normal page load only happens once. Registering a
    // `wxt:locationchange` listener starts WXT's location watcher, which turns
    // history navigation into an event we can react to.
    ctx.addEventListener(window, 'wxt:locationchange', () => scan(ctx));
  },
});

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

  const attach = (container: Element) => {
    commentsObserver?.disconnect();
    commentsObserver = new MutationObserver(() => scan(ctx));
    commentsObserver.observe(container, { childList: true, subtree: true });
    ctx.onInvalidated(() => commentsObserver?.disconnect());
    scan(ctx);
  };

  const existing = document.querySelector(COMMENTS_CONTAINER);
  if (existing) {
    attach(existing);
    return;
  }

  // Comments mount well after the rest of the watch page. Watch for the
  // container once, then hand off to the scoped observer above.
  const bootstrap = new MutationObserver(() => {
    const container = document.querySelector(COMMENTS_CONTAINER);
    if (container) {
      bootstrap.disconnect();
      attach(container);
    }
  });
  bootstrap.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => bootstrap.disconnect());
}

/** Mount our button into every comment toolbar that does not have one yet. */
function scan(ctx: ContentScriptContext) {
  for (const toolbar of findUninjectedToolbars()) {
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

  ui.mount();
}

async function handleOpen(ctx: ContentScriptContext, toolbar: HTMLElement, anchor: HTMLElement) {
  const comment = readComment(toolbar);
  if (!comment) return;

  const [context, autoStart] = await Promise.all([
    buildContext(comment),
    autoGenerate.getValue(),
  ]);

  void openPopover({
    ctx,
    anchor,
    context,
    autoStart,
    onInsert: (text) => void insertGeneratedReply(toolbar, text),
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
async function buildContext(comment: CommentData): Promise<GenerationContext> {
  const level = await contextLevel.getValue();
  const video = level >= 1 ? readVideoContext() : null;

  if (video && level >= 2 && !scrapedDescriptions.has(video.videoId)) {
    const description = readVideoDescription(video.videoId);
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
  const editable = await openReplyBox(toolbar);
  if (!editable) {
    // Replies can be disabled on a comment, and the button is absent entirely
    // when signed out. Falling back to the clipboard beats losing the text.
    await navigator.clipboard.writeText(text);
    return;
  }
  insertReplyText(editable, text);
}
