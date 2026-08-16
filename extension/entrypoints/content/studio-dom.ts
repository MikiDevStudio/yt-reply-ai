/**
 * Every assumption about YouTube Studio's comment inbox lives here.
 *
 * Studio is a different application from the watch page: `ytcp-*` elements from
 * a different Polymer build, its own ids, its own reply box. What the two share
 * is the shape of the problem, which is why both are written against
 * `CommentSurface` and nothing above them knows which page it is on.
 *
 * Checked against the live inbox rather than remembered: the parts we read are
 * in the light DOM, so `querySelector` reaches them without walking shadow
 * roots — unlike most of Studio's chrome.
 *
 * Two routes carry this inbox:
 *
 *   /video/<videoId>/comments/inbox     one video
 *   /channel/<channelId>/comments/inbox every video at once
 *
 * The channel-wide one is why `readVideoContext` takes a toolbar: consecutive
 * comments there belong to different videos, and reading the page for a single
 * "current video" would attach the wrong title to most of them.
 */
import {
  type CommentData,
  type CommentSurface,
  commentKey,
  INJECTED_ATTR,
  typeIntoEditable,
  type VideoContext,
  waitForElement,
} from './surface';

/** Wrapper around the inbox. Scope of our MutationObserver. */
const COMMENTS_CONTAINER = 'ytcp-comments-section';

/** One comment or reply. The thread's own comment carries `id="comment"`. */
const COMMENT_HOST = 'ytcp-comment';

/** A top-level comment together with its replies. */
const COMMENT_THREAD = 'ytcp-comment-thread';

/** Wrapper around the replies of one thread. Its presence marks a reply. */
const REPLIES = 'ytcp-comment-replies';

/** The thread's own comment, as opposed to any of its replies. */
const THREAD_COMMENT = ':scope > ytcp-comment#comment';

/** The row of actions under a comment: reply, likes, heart. */
const ACTION_BUTTONS = 'ytcp-comment-action-buttons';

/** Inside it: the flex row the buttons actually sit in. */
const TOOLBAR = '#toolbar';

/** Selectors relative to a comment host. */
const COMMENT_TEXT = '#content-text';
const COMMENT_AUTHOR = '#metadata a#name';

/** Studio's own Reply button, which opens the reply box. */
const NATIVE_REPLY_BUTTON = 'ytcp-comment-button#reply-button';

/**
 * Where the reply box appears, and what to type into once it does.
 *
 * `ytcp-commentbox#reply-dialog-id` mounts into the dialog container and puts a
 * real `<textarea>` inside a `tp-yt-iron-autogrow-textarea`. The field is
 * matched by what it is rather than by that chain of ids: the wrapper is a
 * Polymer implementation detail, while "the editable thing inside the reply
 * dialog" is the contract, and it survives the wrapper being swapped.
 */
const REPLY_DIALOG = '#reply-dialog-container';
const REPLY_FIELD = '[contenteditable="true"], textarea';

/**
 * The per-comment video card.
 *
 * Filled in on the channel-wide inbox, where every row can be a different video.
 * Rendered empty on the single-video route — no title, no href — which is why
 * the id also gets read out of the path.
 */
const VIDEO_TITLE = '#video-thumbnail #video-title';
const VIDEO_LINK = '#video-thumbnail a#body';

/** A YouTube video id: eleven characters of base64url. */
const VIDEO_ID = /[\w-]{11}/;

function findUninjectedToolbars(root: ParentNode = document): HTMLElement[] {
  const rows = root.querySelectorAll<HTMLElement>(ACTION_BUTTONS);
  const toolbars: HTMLElement[] = [];

  for (const row of rows) {
    const toolbar = row.querySelector<HTMLElement>(TOOLBAR);
    if (toolbar && !toolbar.hasAttribute(INJECTED_ATTR)) {
      toolbars.push(toolbar);
    }
  }

  return toolbars;
}

function readComment(toolbar: HTMLElement): CommentData | null {
  const host = toolbar.closest<HTMLElement>(COMMENT_HOST);
  if (!host) return null;

  const text = host.querySelector(COMMENT_TEXT)?.textContent?.trim() ?? '';
  const author = host.querySelector(COMMENT_AUTHOR)?.textContent?.trim() ?? '';

  // Replies live inside `ytcp-comment-replies`; the thread's own comment does not.
  const isReply = Boolean(host.closest(REPLIES));
  const parent = isReply ? readThreadComment(host) : null;

  return { id: commentKey(author, text), text, author, isReply, ...(parent ? { parent } : {}) };
}

function readThreadComment(host: HTMLElement): { text: string; author: string } | null {
  const comment = host.closest(COMMENT_THREAD)?.querySelector(THREAD_COMMENT);
  if (!comment || comment === host) return null;

  const text = comment.querySelector(COMMENT_TEXT)?.textContent?.trim() ?? '';
  if (!text) return null;

  return { text, author: comment.querySelector(COMMENT_AUTHOR)?.textContent?.trim() ?? '' };
}

/**
 * Which video this comment is on.
 *
 * The comment's own video card is the first source, because it is the only one
 * that stays right in the channel-wide inbox. The path is the fallback, and on
 * the single-video route it is the only source there is.
 *
 * Studio never names the channel next to a comment, so `channel` is empty here.
 * The prompt leaves the line out rather than sending an empty field.
 */
function readVideoContext(toolbar: HTMLElement): VideoContext | null {
  const host = toolbar.closest<HTMLElement>(COMMENT_HOST);

  const href = host?.querySelector<HTMLAnchorElement>(VIDEO_LINK)?.getAttribute('href') ?? '';
  const title = host?.querySelector(VIDEO_TITLE)?.textContent?.trim() ?? '';

  const videoId =
    href.match(VIDEO_ID)?.[0] ?? location.pathname.match(/\/video\/([\w-]{11})/)?.[1] ?? '';

  // Each route withholds what the other supplies: the single-video inbox has the
  // id in its path and renders the card empty, the channel-wide one shows the
  // title and may name no id at all. Either half is worth sending; neither means
  // there is nothing to say about the video, and the prompt then omits the
  // section rather than announcing a video it cannot describe.
  if (!videoId && !title) return null;

  // Studio never names the channel next to a comment.
  return { videoId, title, channel: '' };
}

/**
 * Open the reply box under a comment and hand back the field to type into.
 *
 * We click Studio's own Reply button for the same reason we click YouTube's:
 * the box it opens knows which comment it answers and how to post, and we know
 * neither.
 */
async function openReplyBox(toolbar: HTMLElement): Promise<HTMLElement | null> {
  const host = toolbar.closest<HTMLElement>(COMMENT_HOST);
  if (!host) return null;

  const dialog = host.querySelector<HTMLElement>(REPLY_DIALOG);
  const existing = dialog?.querySelector<HTMLElement>(REPLY_FIELD);
  if (existing) return existing;

  const replyButton = toolbar.querySelector<HTMLElement>(NATIVE_REPLY_BUTTON);
  if (!replyButton) return null;

  replyButton.click();

  return waitForElement<HTMLElement>(host, `${REPLY_DIALOG} ${REPLY_FIELD}`, 3000);
}

/**
 * Put text into whichever kind of field Studio opened.
 *
 * A `textarea` does not take `execCommand('insertText')` the way a
 * `contenteditable` does, and assigning `.value` on its own leaves Polymer
 * believing the box is empty — so the value goes in through the property
 * descriptor and the `input` event is fired by hand, which is what its two-way
 * binding listens for.
 */
function insertReplyText(target: HTMLElement, text: string): void {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const prototype = Object.getPrototypeOf(target);
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    target.focus();
    setter ? setter.call(target, text) : (target.value = text);
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return;
  }

  typeIntoEditable(target, text);
}

/** Studio's comment inbox, as one object. */
export const studioSurface: CommentSurface = {
  name: 'studio',
  commentsContainer: COMMENTS_CONTAINER,
  findUninjectedToolbars,
  readComment,
  readVideoContext,
  // No `readVideoDescription`: Studio shows a title and a thumbnail, and
  // fetching the watch page to fill the gap would cost a request per video.
  openReplyBox,
  insertReplyText,
};
