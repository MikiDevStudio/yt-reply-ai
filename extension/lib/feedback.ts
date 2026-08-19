/**
 * Where an opinion goes, and why it never goes to us directly.
 *
 * Every route out of the review block is a link the user presses. Nothing is
 * posted, nothing is recorded, no star is counted, and the extension keeps
 * talking to openrouter.ai and nothing else. A rating tallied here would be the
 * first telemetry this product has ever had, and it would have to be declared
 * on the Web Store listing and in the privacy policy for a number that a public
 * review page already reports better.
 *
 * The stars in `components/ReviewAsk.tsx` therefore decide nothing except which
 * of the two routes is emphasised — both are rendered whatever the answer. That
 * is not politeness, it is the rule: sending five stars to the Store and two to
 * a support form is review gating, which Google Play and the App Store ban
 * outright and the Web Store's rating-manipulation policy reaches. The cost of
 * getting it wrong is the listing.
 */

/** The repository, and the only place a build can be had until the listing is live. */
export const SOURCE_URL = 'https://github.com/MikiDevStudio/yt-reply-ai';

/**
 * Where a bug or an idea should land: the tracker the code already lives in.
 *
 * `/issues/new` rather than the repository root — someone who has decided to
 * report something should not have to find the button.
 */
export const ISSUES_URL = `${SOURCE_URL}/issues/new`;

/**
 * The extension's id, as assigned by the Chrome Web Store on 2026-08-19.
 *
 * Written out rather than read from `browser.runtime.id`, which answers with
 * whatever id an unpacked build was given and would point the review link at
 * somebody else's listing. The site pins the same string; see
 * `landing/src/lib/links.ts`.
 *
 * The development id is a different string — production builds ship without a
 * manifest `key` so that the store could assign this one. Never swap them.
 */
const EXTENSION_ID = 'hekgfpaladkladgdiijepdiegkhnbhie';

/**
 * Whether the Chrome Web Store listing exists yet.
 *
 * True since 2026-08-19. It was `false` while a review could not be left
 * anywhere, because asking for one where none can be left is worse than not
 * asking; the review block sent people to the repository and said so. The
 * matching flag on the site flipped in the same change.
 */
export const IN_STORE = true;

/** The listing's reviews tab. Correct the day it goes live, a 404 before that. */
const STORE_REVIEW_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}/reviews`;

/** Where "say so where it counts" actually goes today. */
export const REVIEW_URL = IN_STORE ? STORE_REVIEW_URL : SOURCE_URL;

/**
 * The address that actually receives mail, as opposed to the one mail is sent
 * from. Named in full so it can be copied out of a screenshot.
 */
export const CONTACT_EMAIL = 'privacy@mikidev.app';

/**
 * Where "write to me" goes: a form on the site, not a `mailto:`.
 *
 * A `mailto:` assumes a configured mail client. On a machine with none it opens
 * nothing at all, or opens something the person has not signed into in years —
 * and the message is never sent, silently, by someone who believes it was. It
 * also hands them an empty window and asks for a letter, which is a much higher
 * bar than a field with a placeholder in it.
 *
 * The address itself is still printed on the site's footer and privacy page, as
 * text, for exactly the cases this page cannot serve: the form being down, or
 * JavaScript being off. It stops being the only route, not a route.
 */
export const CONTACT_URL = 'https://reply-ai.mikidev.app/contact?from=extension';
