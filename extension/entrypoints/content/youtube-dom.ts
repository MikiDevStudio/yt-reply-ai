/**
 * Every assumption about YouTube's DOM lives in this file and nowhere else.
 *
 * We anchor on custom element tag names (`ytd-*`) and framework-assigned ids
 * (`#toolbar`, `#content-text`) rather than CSS classes. Classes are generated
 * and churn constantly; the tag names and ids are part of YouTube's Polymer
 * component contract and have held stable for years.
 *
 * When YouTube does eventually change something, this is the only file to fix.
 */

/** Wrapper around the whole comment section. Scope of our MutationObserver. */
export const COMMENTS_CONTAINER = 'ytd-comments#comments';

/** The like/dislike/reply row under a single comment. */
export const ENGAGEMENT_BAR = 'ytd-comment-engagement-bar';

/** Inside the engagement bar: the flex row that holds the action buttons. */
export const TOOLBAR = '#toolbar';

/** A single comment or reply. Top-level comments are wrapped in a thread renderer. */
export const COMMENT_HOST = 'ytd-comment-view-model, ytd-comment-thread-renderer';

/** Selectors relative to a comment host. */
const COMMENT_TEXT = '#content-text';
const COMMENT_AUTHOR = '#author-text';
const COMMENT_TIME = '.published-time-text a';

/** Marker attribute so we never inject twice into the same toolbar. */
export const INJECTED_ATTR = 'data-reply-ai-mounted';

export interface CommentData {
  /** Visible text of the comment being replied to. */
  text: string;
  /** Channel handle, e.g. `@someone`. Empty string if it could not be read. */
  author: string;
  /** True when this is a reply inside a thread rather than a top-level comment. */
  isReply: boolean;
}

/**
 * Find comment toolbars that do not have our button yet.
 *
 * `root` lets callers narrow the search to a subtree that just mutated instead
 * of rescanning the whole page.
 */
export function findUninjectedToolbars(root: ParentNode = document): HTMLElement[] {
  const bars = root.querySelectorAll<HTMLElement>(ENGAGEMENT_BAR);
  const toolbars: HTMLElement[] = [];

  for (const bar of bars) {
    const toolbar = bar.querySelector<HTMLElement>(TOOLBAR);
    if (toolbar && !toolbar.hasAttribute(INJECTED_ATTR)) {
      toolbars.push(toolbar);
    }
  }

  return toolbars;
}

/**
 * Read the comment that a given toolbar belongs to.
 *
 * Returns `null` when the surrounding comment cannot be found, which happens if
 * YouTube recycles the node between us finding the toolbar and reading it.
 */
export function readComment(toolbar: HTMLElement): CommentData | null {
  const host = toolbar.closest<HTMLElement>(COMMENT_HOST);
  if (!host) return null;

  const text = host.querySelector(COMMENT_TEXT)?.textContent?.trim() ?? '';
  const author = host.querySelector(COMMENT_AUTHOR)?.textContent?.trim() ?? '';

  // Replies live inside `ytd-comment-replies-renderer`; top-level comments do not.
  const isReply = Boolean(host.closest('ytd-comment-replies-renderer'));

  return { text, author, isReply };
}

/** YouTube's own Reply button, which opens the reply box. */
const NATIVE_REPLY_BUTTON = 'ytd-button-renderer#reply-button-end button, #reply-button-end button';

/** The contenteditable YouTube types replies into. */
const REPLY_EDITABLE = 'ytd-commentbox #contenteditable-root';

/**
 * Open the reply box under a comment and hand back its editable element.
 *
 * We click YouTube's own Reply button rather than constructing the box
 * ourselves: the box carries the parent-comment id and the posting logic, and
 * only YouTube knows how to wire that up.
 *
 * Returns `null` if the box does not appear — YouTube disables replies on some
 * comments, and the button is absent entirely when signed out.
 */
export async function openReplyBox(toolbar: HTMLElement): Promise<HTMLElement | null> {
  const engagementBar = toolbar.closest(ENGAGEMENT_BAR) ?? toolbar.parentElement;
  const existing = engagementBar?.parentElement?.querySelector<HTMLElement>(REPLY_EDITABLE);
  if (existing) return existing;

  const replyButton = toolbar.querySelector<HTMLElement>(NATIVE_REPLY_BUTTON);
  if (!replyButton) return null;

  replyButton.click();

  const host = toolbar.closest(COMMENT_HOST) ?? document;
  return waitForElement<HTMLElement>(host, REPLY_EDITABLE, 3000);
}

/**
 * Put text into YouTube's reply box.
 *
 * Assigning `textContent` is not enough. The box is a `contenteditable` driven
 * by a Polymer component that tracks its own state from input events — set the
 * text directly and YouTube still believes the box is empty, leaving the Reply
 * button disabled. `insertText` goes through the editing pipeline and produces
 * the events that component listens for.
 *
 * `execCommand` is deprecated but remains the only thing that reliably drives a
 * third-party contenteditable, so there is a manual fallback behind it.
 */
export function insertReplyText(editable: HTMLElement, text: string): void {
  editable.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editable);
  selection?.removeAllRanges();
  selection?.addRange(range);

  if (document.execCommand('insertText', false, text)) {
    collapseToEnd(editable);
    return;
  }

  editable.textContent = text;
  editable.dispatchEvent(
    new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }),
  );
  collapseToEnd(editable);
}

function collapseToEnd(editable: HTMLElement): void {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Resolve once `selector` matches inside `root`, or with `null` on timeout. */
function waitForElement<T extends Element>(
  root: ParentNode,
  selector: string,
  timeoutMs: number,
): Promise<T | null> {
  const existing = root.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const found = root.querySelector<T>(selector);
      if (found) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(root === document ? document.body : (root as Node), {
      childList: true,
      subtree: true,
    });
  });
}

/** Metadata about the video the comments belong to, scraped from the page. */
export interface VideoContext {
  videoId: string;
  title: string;
  channel: string;
}

/**
 * Read video metadata off the watch page.
 *
 * Scraping beats the YouTube Data API here: no extra key, no quota, and we are
 * already sitting on the rendered page. Returns `null` outside a watch page.
 */
export function readVideoContext(): VideoContext | null {
  const videoId = new URL(location.href).searchParams.get('v');
  if (!videoId) return null;

  const title =
    document.querySelector('#title h1 yt-formatted-string')?.textContent?.trim() ??
    document.title.replace(/ - YouTube$/, '');

  const channel =
    document.querySelector('#owner #channel-name a')?.textContent?.trim() ?? '';

  return { videoId, title, channel };
}
