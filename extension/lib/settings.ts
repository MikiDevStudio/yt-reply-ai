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
 * Curated starting points. The picker (#13) fetches the live catalogue — these
 * are only the defaults and the one-click alternatives, and every id here was
 * checked against that catalogue rather than remembered.
 *
 * Prices are per million tokens, as of the last check.
 */
export const MODEL_PRESETS = {
  /** Default. $1.50 in / $7.50 out — roughly 1000 replies per dollar. */
  balanced: 'google/gemini-3.6-flash',
  /** $0.25 in / $1.50 out — roughly 5000 replies per dollar. */
  cheap: 'google/gemini-3.1-flash-lite',
  /**
   * Offered when a paid call fails for lack of credits, so a new account is
   * never dead-ended. Free variants are capped at 20 requests/minute and
   * 50/day by OpenRouter.
   */
  free: 'google/gemma-4-31b-it:free',
} as const;

/**
 * Model used for generating replies.
 *
 * The default is a paid model, which means a brand-new account with no credits
 * will get a `no_credits` failure on its first generation. That is deliberate —
 * reply quality is the product — but the error state must offer a one-click
 * switch to `MODEL_PRESETS.free` rather than just reporting the failure (#15).
 */
export const model = storage.defineItem<string>('local:openrouter.model', {
  fallback: MODEL_PRESETS.balanced,
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
