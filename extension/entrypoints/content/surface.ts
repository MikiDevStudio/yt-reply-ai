/**
 * What a page has to provide before we can put a button on its comments.
 *
 * Two pages qualify and they share almost nothing: the watch page is built from
 * `ytd-*` elements, YouTube Studio's comment inbox from `ytcp-*` ones, with
 * different ids, a different reply box and different metadata within reach. The
 * mounting, the popover and the generation path are the same for both, so the
 * differences are collected here and everything else is written once.
 *
 * Neither page uses shadow DOM for the parts we read — checked against the live
 * pages, not assumed — so plain `querySelector` reaches everything.
 */

/** Marker attribute so we never inject twice into the same toolbar. */
export const INJECTED_ATTR = 'data-reply-ai-mounted';

export interface CommentData {
  /** Stable per comment. See `commentKey` in `lib/comment-key.ts`. */
  id: string;
  /** Visible text of the comment being replied to. */
  text: string;
  /** Channel handle, e.g. `@someone`. Empty string if it could not be read. */
  author: string;
  /** True when this is a reply inside a thread rather than a top-level comment. */
  isReply: boolean;
  /** The comment that started the thread. Only present when `isReply`. */
  parent?: { text: string; author: string };
}

/** Metadata about the video the comments belong to, scraped from the page. */
export interface VideoContext {
  videoId: string;
  title: string;
  /** Empty where the page does not name it — Studio's inbox does not. */
  channel: string;
}

export interface CommentSurface {
  /** Human name for this page, used in log lines. */
  readonly name: string;

  /** Wrapper around the comments. The MutationObserver is scoped to it. */
  readonly commentsContainer: string;

  /** Toolbars that do not carry our button yet. */
  findUninjectedToolbars(root?: ParentNode): HTMLElement[];

  /** Read the comment a toolbar belongs to, or null if the node was recycled. */
  readComment(toolbar: HTMLElement): CommentData | null;

  /**
   * The video this comment is on, for context level 1.
   *
   * Takes the toolbar rather than reading the page: Studio's channel-wide inbox
   * mixes comments from every video the channel has.
   */
  readVideoContext(toolbar: HTMLElement): VideoContext | null;

  /**
   * The video description, for context level 2.
   *
   * Absent on pages that do not carry one — Studio shows a video title and
   * nothing more, and fetching the watch page to fill the gap would cost a
   * request per video to save a few hundred tokens.
   */
  readVideoDescription?(videoId: string): string | null;

  /** Open the page's own reply box and hand back the element text goes into. */
  openReplyBox(toolbar: HTMLElement): Promise<HTMLElement | null>;

  /** Put text into that element the way the page's own editor would. */
  insertReplyText(target: HTMLElement, text: string): void;
}

/** Resolve once `selector` matches inside `root`, or with `null` on timeout. */
export function waitForElement<T extends Element>(
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

/**
 * Type text into a `contenteditable` the way a person would.
 *
 * Assigning `textContent` is not enough. These boxes are driven by components
 * that track their own state from input events — set the text directly and the
 * page still believes the box is empty, leaving its send button disabled.
 * `insertText` goes through the editing pipeline and produces the events those
 * components listen for.
 *
 * `execCommand` is deprecated but remains the only thing that reliably drives a
 * third-party contenteditable, so there is a manual fallback behind it.
 */
export function typeIntoEditable(editable: HTMLElement, text: string): void {
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
