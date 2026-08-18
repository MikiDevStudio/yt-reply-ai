import type { FailureFacts, FailureKind, RateLimitFacts } from './failure';
import type { TokenUsage } from './openrouter/types';
import type { Audience, ContextLevel } from './settings';

/**
 * The wire protocol between content scripts and the background service worker.
 *
 * Two channels, because they have different shapes:
 *
 * - **Ports** for generation. `sendMessage` resolves once, which cannot express
 *   a token stream. A port also keeps the service worker alive while it is
 *   open, which is exactly what a long generation needs.
 * - **`sendMessage`** for one-shot requests that return a single value.
 */

export const GENERATE_PORT = 'reply-ai:generate';

/**
 * Context about the comment being answered, gathered by the content script.
 *
 * What is filled in depends on the context level the user chose: L0 sends the
 * comment alone, L1 adds the video headline and the thread it sits in, L2 adds
 * the description. The content script only scrapes what the level asks for, so
 * an unused field is never gathered rather than gathered and dropped.
 */
export interface GenerationContext {
  commentText: string;
  commentAuthor: string;
  isReply: boolean;
  /** The comment that started the thread. L1+, and only inside a thread. */
  parent?: {
    text: string;
    author: string;
  };
  /** Present when the user is on a watch page. */
  video?: {
    videoId: string;
    title: string;
    channel: string;
    /** L2 only. Absent when the background already has it cached. */
    description?: string;
  };
}

/** Content script → background, over the generate port. */
export type GenerateClientMessage =
  | {
      type: 'start';
      context: GenerationContext;
      style?: string;
      contextLevel?: ContextLevel;
      /** 1–5. Omitted falls back to the stored level. */
      creativity?: number;
      /**
       * Which try this is, counting from 1. Drives the angle, the per-attempt
       * creativity bump and how hard the model is allowed to think.
       */
      attempt?: number;
      /**
       * Replies already offered for this comment, oldest first.
       *
       * Sent from the content script because the attempt stack lives there: the
       * worker is torn down between requests and cannot hold state of its own.
       */
      previous?: string[];
      /** Who the reply speaks as. Omitted falls back to the stored choice. */
      audience?: Audience;
      /**
       * What the user typed for this reply — an instruction, or a draft to fix
       * up. Per press, never stored, and absent when the field is empty.
       */
      note?: string;
      /** Language the user typed in the popover. Wins over everything else. */
      language?: string;
      /** Language detected from the comment text, used when nothing is pinned. */
      detectedLanguage?: string;
    }
  | { type: 'cancel' };

/**
 * A failure, as it crosses the boundary.
 *
 * The facts only — the background knows what happened and what the key's tier
 * is, the UI decides what to say about it (`lib/failure.ts`). Sending finished
 * prose instead would put user-facing copy in the service worker and leave the
 * options page and the popover free to disagree about the same failure.
 */
export interface FailurePayload {
  kind: FailureKind;
  /** OpenRouter's own text, kept for the cases where it says more than we can. */
  message: string;
  retryAfterSeconds?: number;
  /** Present on `rate_limited`, so the message can name the cap that was hit. */
  rateLimit?: RateLimitFacts;
  /** Present on `unauthorized`: false means no key was ever stored. */
  hadKey?: boolean;
  /** Present on `key_exhausted`: true means the key that ran out was the trial's. */
  keyIsOurs?: boolean;
}

/** Background → content script, over the generate port. */
export type GenerateServerMessage =
  | { type: 'delta'; text: string }
  /**
   * Still working, nothing to show yet.
   *
   * Carries no data: the message exists so that traffic crosses the port while
   * a model is thinking, which is what stops Chrome from retiring the service
   * worker mid-answer. See `KEEPALIVE_MS` in the background.
   */
  | { type: 'thinking' }
  /**
   * `truncated` when the model stopped because it ran out of room, not because
   * it finished.
   *
   * `nudge` carries a milestone the counter just crossed — 20, 40, 60 — and is
   * absent on every other reply, which is nineteen out of twenty. The worker
   * decides it rather than the content script because it is the only single
   * writer: two tabs finishing at the same instant would otherwise both claim
   * the same milestone and open two cards. See `takeNudge` in lib/replies.ts.
   */
  | { type: 'done'; text: string; usage?: TokenUsage; truncated?: boolean; nudge?: number }
  | ({ type: 'error' } & FailurePayload);

/** One-shot request/response pairs, sent with `chrome.runtime.sendMessage`. */
export type Request =
  | { type: 'auth:status' }
  | { type: 'auth:connect' }
  | { type: 'auth:disconnect' }
  | { type: 'auth:setKey'; apiKey: string }
  /**
   * Ask for the free trial key (#38). Answers with what happened, never with
   * the key — a key belongs in the background worker and nowhere else.
   */
  | { type: 'trial:claim' }
  /** The catalogue, from cache unless `refresh` says to go and ask again. */
  | { type: 'models:list'; refresh?: boolean }
  /** Check one id against the catalogue and return what it says about it. */
  | { type: 'models:validate'; id: string }
  | { type: 'usage:get' }
  /** Rewrite a soul profile, or reshape one written for another tool. */
  | { type: 'soul:improve'; markdown: string; mode: 'tighten' | 'import' }
  /**
   * Open a tab, on behalf of a caller that cannot.
   *
   * A content script has no `browser.tabs` and no `runtime.openOptionsPage`, so
   * every "Reconnect" or "Add credits" button in the injected popover has to
   * come through here — the popover used to call `openOptionsPage` directly,
   * which throws in a content script and left those buttons doing nothing.
   */
  | { type: 'ui:openOptions'; section: string }
  | { type: 'ui:openUrl'; url: string };

/**
 * Every one-shot reply is wrapped rather than thrown.
 *
 * An exception raised in the service worker does not cross the message boundary
 * — the caller just sees `undefined` and has to guess. Making failure part of
 * the return type means the caller cannot ignore it by accident.
 */
export type Response<T> = { ok: true; data: T } | ({ ok: false } & FailurePayload);

/** Strip the `ok` flag off a failed response, leaving what the UI describes. */
export function failureOf(response: { ok: false } & FailurePayload): FailureFacts {
  const { ok, ...facts } = response;
  return facts;
}

export async function sendRequest<T>(request: Request): Promise<Response<T>> {
  try {
    return await browser.runtime.sendMessage(request);
  } catch {
    // Thrown when the service worker is gone or the extension was reloaded.
    // Not a network failure: nothing was sent anywhere, so telling the user to
    // check OpenRouter would send them looking in the wrong place.
    return { ok: false, kind: 'interrupted', message: 'The extension is not responding' };
  }
}
