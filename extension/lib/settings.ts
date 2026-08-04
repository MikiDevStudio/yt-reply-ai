import { storage } from '#imports';

/**
 * Persisted settings.
 *
 * Everything here uses the `local` area, never `sync`. `sync` uploads to
 * Google's servers and caps at 8 KB per item and 100 KB overall — a credential
 * has no business going there, and a soul profile would blow the quota on its
 * own. Small UI preferences may move to `sync` later; secrets never will.
 */

/**
 * The OpenRouter key, obtained either through the OAuth flow or pasted by hand.
 *
 * Read only in the background service worker. A content script runs in a page
 * we do not control, so the key must never be sent there.
 */
export const apiKey = storage.defineItem<string | null>('local:openrouter.apiKey', {
  fallback: null,
});

/**
 * Model used for generating replies.
 *
 * The default is a free variant so a new user can generate something before
 * spending anything. It is only a starting point — the picker fetches the live
 * list, because hardcoded model ids rot within months.
 */
export const model = storage.defineItem<string>('local:openrouter.model', {
  fallback: 'google/gemma-4-31b-it:free',
});

/** How much context to send. See README for what each level costs. */
export type ContextLevel = 0 | 1 | 2;

export const contextLevel = storage.defineItem<ContextLevel>('local:generation.contextLevel', {
  fallback: 0,
});

/** Tone preset applied on top of the soul profile. */
export const style = storage.defineItem<string>('local:generation.style', {
  fallback: 'auto',
});

/** The user's voice profile, as markdown. Empty until they create one. */
export const soul = storage.defineItem<string>('local:soul.active', {
  fallback: '',
});
