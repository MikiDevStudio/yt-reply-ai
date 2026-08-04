import type { OpenRouterErrorKind } from './openrouter/errors';
import type { TokenUsage } from './openrouter/types';
import type { ContextLevel } from './settings';

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
  | { type: 'start'; context: GenerationContext; style?: string; contextLevel?: ContextLevel }
  | { type: 'cancel' };

/** Background → content script, over the generate port. */
export type GenerateServerMessage =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; usage?: TokenUsage }
  | { type: 'error'; kind: OpenRouterErrorKind; message: string; retryAfterSeconds?: number };

/** One-shot request/response pairs, sent with `chrome.runtime.sendMessage`. */
export type Request =
  | { type: 'auth:status' }
  | { type: 'auth:connect' }
  | { type: 'auth:disconnect' }
  | { type: 'auth:setKey'; apiKey: string }
  | { type: 'models:list' }
  | { type: 'usage:get' }
  /** Rewrite a soul profile, or reshape one written for another tool. */
  | { type: 'soul:improve'; markdown: string; mode: 'tighten' | 'import' };

/**
 * Every one-shot reply is wrapped rather than thrown.
 *
 * An exception raised in the service worker does not cross the message boundary
 * — the caller just sees `undefined` and has to guess. Making failure part of
 * the return type means the caller cannot ignore it by accident.
 */
export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; kind: OpenRouterErrorKind; message: string };

export async function sendRequest<T>(request: Request): Promise<Response<T>> {
  try {
    return await browser.runtime.sendMessage(request);
  } catch {
    // Thrown when the service worker is gone or the extension was reloaded.
    return { ok: false, kind: 'network', message: 'The extension is not responding' };
  }
}
