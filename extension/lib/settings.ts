import { storage } from '#imports';
import type { ModelInfo } from './openrouter/types';
import type { SoulProfile } from './soul';

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
  /**
   * Default. $1.50 in / $7.50 out, and it thinks before answering: measured at
   * $0.0003 per reply with reasoning held to `minimal`, $0.0041 without.
   */
  balanced: 'google/gemini-3.6-flash',
  /** $0.25 in / $1.50 out, no reasoning — measured at $0.00005 per reply. */
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

/**
 * A model id typed by hand, with what the catalogue said about it.
 *
 * One object rather than a field per number, so the snapshot can never be half
 * written. It is kept apart from `model` for two reasons: the row can show real
 * figures before the network answers, and switching to a preset and back does
 * not erase what the user typed.
 *
 * `model` is still the only answer to which model is used — it equals either a
 * preset id or this one's.
 */
export const customModel = storage.defineItem<ModelInfo | null>('local:openrouter.customModel', {
  fallback: null,
});

/**
 * Master switch for the injected UI.
 *
 * Off removes the button from YouTube entirely rather than making it fail
 * quietly — someone who turns the extension off wants their comment section
 * back, not a button that does nothing.
 */
export const enabled = storage.defineItem<boolean>('local:enabled', {
  fallback: true,
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

/**
 * How far the model may stray, 1–5. See `CREATIVITY` in `lib/prompt.ts`.
 *
 * Three by default: the middle of the table is where a reply sounds written
 * rather than either generated or unhinged. Set from the popover and kept
 * globally — someone who likes their replies bold likes them bold on the next
 * comment too, and re-picking under every comment is the kind of friction this
 * control exists to remove.
 *
 * Each regeneration raises the level a step for that attempt only, which is why
 * this value never moves on its own.
 */
export const creativity = storage.defineItem<number>('local:generation.creativity', {
  fallback: 3,
});

/**
 * Whether opening the popover starts a generation on its own.
 *
 * On by default: clicking the button is already a statement of intent, and a
 * second click for nothing is a worse first impression. Turning it off is for
 * people who want to pick a tone — or just read the comment — before spending a
 * request, which matters on metered credit and on rate-limited free models.
 */
export const autoGenerate = storage.defineItem<boolean>('local:generation.auto', {
  fallback: true,
});

/**
 * The user's voice profile, as markdown. Empty until they create one.
 *
 * This is what the prompt uses, whether it came from the constructor or was
 * typed by hand.
 */
export const soul = storage.defineItem<string>('local:soul.active', {
  fallback: '',
});

/**
 * The constructor's answers behind that markdown.
 *
 * Kept separately so reopening the constructor shows the choices instead of a
 * blank form. `null` means the profile was written by hand and has no answers
 * to restore — the constructor then starts from defaults and says so before it
 * overwrites anything.
 */
export const soulProfile = storage.defineItem<SoulProfile | null>('local:soul.profile', {
  fallback: null,
});
