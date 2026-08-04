import './style.css';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import { openPopover } from './popover';
import { ReplyButton } from './ReplyButton';
import { syncTheme } from './theme';
import {
  COMMENTS_CONTAINER,
  INJECTED_ATTR,
  findUninjectedToolbars,
  insertReplyText,
  openReplyBox,
  readComment,
  readVideoContext,
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
      root.render(<ReplyButton onOpen={(button) => handleOpen(ctx, toolbar, button)} />);
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });

  ui.mount();
}

function handleOpen(ctx: ContentScriptContext, toolbar: HTMLElement, anchor: HTMLElement) {
  const comment = readComment(toolbar);
  if (!comment) return;

  const video = readVideoContext();

  void openPopover({
    ctx,
    anchor,
    context: {
      commentText: comment.text,
      commentAuthor: comment.author,
      isReply: comment.isReply,
      ...(video ? { video } : {}),
    },
    onInsert: (text) => void insertGeneratedReply(toolbar, text),
  });
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
