import { storage } from '#imports';
import { MODEL_PRESETS } from './models';
import type { ModelCatalogue, ModelInfo } from './openrouter/types';
import type { SoulProfile } from './soul';

/**
 * Persisted settings.
 *
 * Everything here uses the `local` area, never `sync`. `sync` uploads to
 * Google's servers and caps at 8 KB per item and 100 KB overall — a credential
 * has no business going there, and a soul profile would blow the quota on its
 * own. Small UI preferences may move to `sync` later; secrets never will.
 *
 * The one thing that does live in `sync` is the reply counter in
 * `lib/replies.ts`: a couple of kilobytes that are worth carrying between
 * machines, and nothing sensitive in them.
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
 * The last catalogue fetched, so the picker opens on a full list rather than a
 * spinner, and keeps working with no network.
 *
 * Nothing expires it on a timer. A model is chosen once or twice in the life of
 * an install, so a scheduled refresh would spend requests on a screen nobody is
 * looking at and add a way to fail for no gain. It is fetched when there is
 * nothing to show, and after that only when the user asks. A model withdrawn in
 * the meantime is caught by `models:validate` when the settings page opens.
 */
export const modelCatalogue = storage.defineItem<ModelCatalogue | null>(
  'local:openrouter.catalogue',
  { fallback: null },
);

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

/**
 * Whether the coffee card may appear every fiftieth reply.
 *
 * On, and deliberately with no control anywhere in the interface that turns it
 * off: it is the only thing this extension ever asks for, and a tick box beside
 * it would be a tick box for paying nothing.
 *
 * It governs the coffee card alone. The review block has its own counter and
 * its own two buttons, either of which ends it for good — see `takeReview` in
 * lib/replies.ts — so it needs no flag here and is not covered by this one.
 *
 * It is **not** what a licence writes. A Supporter entitlement lives in `sync`
 * so it reaches the buyer's other machines, and the background worker asks
 * `lib/licence.ts` directly before claiming a milestone — mirroring the answer
 * into this local flag would leave a paid-for card showing on the second
 * machine until something happened to write it. What survives here is the
 * escape hatch: a value anyone can set to `false` in `chrome.storage` if they
 * want the card gone without paying, which is a door left deliberately unlocked.
 *
 * Read in the background worker, which is where the milestone is claimed, so a
 * user who has it off never burns one.
 *
 * `local`, like every other preference: it describes this install.
 */
export const supportNudges = storage.defineItem<boolean>('local:support.nudges', {
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
 * Who the reply is written as.
 *
 * The same person is a channel owner under their own videos and an ordinary
 * viewer under everyone else's, and the two need different replies: an owner
 * answers for the channel and can promise things, a viewer speaks only for
 * themselves and thanking people for watching would be absurd.
 *
 * Kept as a setting rather than guessed from the page. The signal — whether the
 * comment sits under a video whose channel is the user's — is not something we
 * can read reliably from the DOM for someone who is not signed in as the owner,
 * and getting it wrong silently is worse than one visible switch.
 *
 * The full viewer flow, with a button in the "Add a comment" box, is #19. This
 * is its prompt half, which the reply popover can use today.
 */
export type Audience = 'owner' | 'viewer';

export const replyAs = storage.defineItem<Audience>('local:generation.replyAs', {
  fallback: 'owner',
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
