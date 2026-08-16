/**
 * Every assumption about the watch page's DOM lives in this file and nowhere
 * else. Studio's inbox is a different set of elements entirely; see
 * `studio-dom.ts`.
 *
 * We anchor on custom element tag names (`ytd-*`) and framework-assigned ids
 * (`#toolbar`, `#content-text`) rather than CSS classes. Classes are generated
 * and churn constantly; the tag names and ids are part of YouTube's Polymer
 * component contract and have held stable for years.
 *
 * When YouTube does eventually change something, this is the only file to fix.
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

/** Wrapper around the whole comment section. Scope of our MutationObserver. */
const COMMENTS_CONTAINER = 'ytd-comments#comments';

/** The like/dislike/reply row under a single comment. */
const ENGAGEMENT_BAR = 'ytd-comment-engagement-bar';

/** Inside the engagement bar: the flex row that holds the action buttons. */
const TOOLBAR = '#toolbar';

/** A single comment or reply. Top-level comments are wrapped in a thread renderer. */
const COMMENT_HOST = 'ytd-comment-view-model, ytd-comment-thread-renderer';

/** Wrapper around the replies of one thread. Its presence marks a reply. */
const REPLIES_RENDERER = 'ytd-comment-replies-renderer';

/** One comment plus its replies. Replies are wrapped in one of these too. */
const COMMENT_THREAD = 'ytd-comment-thread-renderer';

/** The thread's own comment, as opposed to any of its replies. */
const THREAD_COMMENT = ':scope > #comment-container > ytd-comment-view-model';

/** Selectors relative to a comment host. */
const COMMENT_TEXT = '#content-text';
const COMMENT_AUTHOR = '#author-text';
const COMMENT_TIME = '.published-time-text a';

/**
 * Find comment toolbars that do not have our button yet.
 *
 * `root` lets callers narrow the search to a subtree that just mutated instead
 * of rescanning the whole page.
 */
function findUninjectedToolbars(root: ParentNode = document): HTMLElement[] {
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
function readComment(toolbar: HTMLElement): CommentData | null {
  const host = toolbar.closest<HTMLElement>(COMMENT_HOST);
  if (!host) return null;

  const text = host.querySelector(COMMENT_TEXT)?.textContent?.trim() ?? '';
  const author = host.querySelector(COMMENT_AUTHOR)?.textContent?.trim() ?? '';

  // Replies live inside `ytd-comment-replies-renderer`; top-level comments do not.
  const isReply = Boolean(host.closest(REPLIES_RENDERER));
  const parent = isReply ? readThreadComment(host) : null;

  return { id: commentKey(author, text), text, author, isReply, ...(parent ? { parent } : {}) };
}

/**
 * Read the comment that started the thread `host` sits in.
 *
 * Walking up with `closest(COMMENT_THREAD)` is not enough: YouTube wraps each
 * reply in a thread renderer of its own, nested inside the outer thread's
 * replies renderer. Going out through the replies renderer first skips past
 * that inner wrapper and lands on the real thread.
 */
function readThreadComment(host: HTMLElement): { text: string; author: string } | null {
  const thread = host.closest(REPLIES_RENDERER)?.closest(COMMENT_THREAD);
  const comment = thread?.querySelector(THREAD_COMMENT);
  if (!comment || comment === host) return null;

  const text = comment.querySelector(COMMENT_TEXT)?.textContent?.trim() ?? '';
  if (!text) return null;

  return { text, author: comment.querySelector(COMMENT_AUTHOR)?.textContent?.trim() ?? '' };
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
async function openReplyBox(toolbar: HTMLElement): Promise<HTMLElement | null> {
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
 * Read video metadata off the watch page.
 *
 * Scraping beats the YouTube Data API here: no extra key, no quota, and we are
 * already sitting on the rendered page. Returns `null` outside a watch page.
 */
function readVideoContext(): VideoContext | null {
  const videoId = new URL(location.href).searchParams.get('v');
  if (!videoId) return null;

  const title =
    document.querySelector('#title h1 yt-formatted-string')?.textContent?.trim() ??
    document.title.replace(/ - YouTube$/, '');

  const channel =
    document.querySelector('#owner #channel-name a')?.textContent?.trim() ?? '';

  return { videoId, title, channel };
}

/**
 * How much description we are willing to send. Roughly 300 tokens — enough for
 * what the video is about, far short of a full sponsor-link dump.
 */
const MAX_DESCRIPTION_CHARS = 1200;

/**
 * Read the video description, the L2 half of the context tiers.
 *
 * Two sources, because neither covers every case:
 *
 * - `ytInitialPlayerResponse`, the JSON YouTube inlines in the served HTML,
 *   holds the full description. It is only correct on a real page load: after
 *   an in-page navigation the script still describes the *first* video the tab
 *   opened, hence the `videoId` check.
 * - The rendered description, which is always current but is the collapsed
 *   snippet — a few hundred characters, cut mid-sentence. We do not click
 *   "more" to get the rest: that is the user's page, not ours.
 *
 * Returns `null` on a page where neither is readable.
 */
function readVideoDescription(videoId: string): string | null {
  const description = readDescriptionFromInitialData(videoId) ?? readRenderedDescription();
  if (!description) return null;

  const useful = withoutBoilerplate(description);
  if (!useful) return null;

  return useful.length > MAX_DESCRIPTION_CHARS
    ? `${useful.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}…`
    : useful;
}

/**
 * Drop the lines of a description that say nothing about the video.
 *
 * Cutting at a character count assumes the substance comes first, and on
 * YouTube it often does not: a description can open with affiliate links, run a
 * chapter list down the middle and end in a wall of hashtags. Sent as it is,
 * the model is handed a page of URLs and told it is context.
 *
 * Removing those lines is worth more than raising the limit, and it is done
 * here — with a filter, deterministically — rather than by asking a model to
 * summarise: a summary costs a request per video, and a summariser that invents
 * a detail poisons every reply written for that video.
 */
function withoutBoilerplate(description: string): string {
  const lines = description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) return false;
      // Timestamps: "00:00 Intro", the chapter list.
      if (/^\d{1,2}:\d{2}(:\d{2})?\b/.test(line)) return false;
      // Social and affiliate lines: a URL with barely any prose around it.
      if (/https?:\/\//.test(line) && line.replace(/https?:\/\/\S+/g, '').trim().length < 40) {
        return false;
      }
      // Hashtag walls and bare "#tag" rows.
      if (/^#\w/.test(line) && !/\s\w{4,}/.test(line.replace(/#\w+/g, ''))) return false;
      return true;
    });

  return lines.join('\n').trim();
}

function readDescriptionFromInitialData(videoId: string): string | null {
  for (const script of document.querySelectorAll('script')) {
    const source = script.textContent ?? '';
    const start = source.indexOf('"videoDetails"');
    if (start === -1) continue;

    // Scoped to videoDetails: `videoId` appears all over the response, and
    // matching the wrong one would defeat the staleness check entirely.
    const details = source.slice(start, start + 8000);
    if (details.match(/"videoId":"([\w-]{11})"/)?.[1] !== videoId) continue;

    const raw = details.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!raw) continue;

    try {
      // The value is a JSON string literal: `\n` and `é` are still escaped.
      return (JSON.parse(`"${raw}"`) as string).trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}

function readRenderedDescription(): string | null {
  const expander = document.querySelector('#description-inline-expander');
  // `#expanded` is filled in only once the user opens the description; before
  // that the snippet is all there is.
  const text =
    expander?.querySelector('#expanded')?.textContent?.trim() ||
    expander?.querySelector('#snippet-text')?.textContent?.trim();

  return text || null;
}

/**
 * The watch page, as one object.
 *
 * `readVideoContext` ignores the toolbar it is handed: every comment on a watch
 * page belongs to the same video, which is exactly what Studio's inbox cannot
 * assume.
 */
export const watchSurface: CommentSurface = {
  name: 'watch',
  commentsContainer: COMMENTS_CONTAINER,
  findUninjectedToolbars,
  readComment,
  readVideoContext: () => readVideoContext(),
  readVideoDescription,
  openReplyBox,
  insertReplyText: typeIntoEditable,
};
