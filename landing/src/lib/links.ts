/**
 * Every outbound address the site uses, in one file.
 *
 * Not for tidiness: publication had to move the install button, the review link
 * on the feedback page and the sentence under the hero in one edit. One
 * constant and one flag made that a two-line change instead of a search, and
 * the same pair is what a future move of the listing would need.
 */

/** The repository. Source-available, and where a build can be read rather than had. */
export const SOURCE_URL = 'https://github.com/MikiDevStudio/yt-reply-ai';

/** Where a bug or an idea should land. */
export const ISSUES_URL = `${SOURCE_URL}/issues/new`;

/** Buy Me a Coffee. A plain outbound link with no id, campaign or per-page tag. */
export const SUPPORT_URL = 'https://buymeacoffee.com/mikipirson';

/** The address that receives mail, as opposed to the one mail is sent from. */
export const CONTACT_EMAIL = 'privacy@mikidev.app';

/**
 * The extension's id, as assigned by the Chrome Web Store on 2026-08-19. The
 * store URLs below are built from it. `/detail/<id>` redirects to the slugged
 * form the store prefers, so the short one is safe to link and survives a
 * rename of the listing.
 */
export const EXTENSION_ID = 'hekgfpaladkladgdiijepdiegkhnbhie';

export const STORE_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;
export const STORE_REVIEW_URL = `${STORE_URL}/reviews`;

/**
 * Whether the Chrome Web Store listing is live.
 *
 * True since 2026-08-19. While it was `false` the install button led to the
 * repository and said so, because a button that promises a store page and
 * delivers a 404 costs more trust than an honest "not there yet" ever could.
 */
export const IN_STORE = true;

/** Where the primary install button actually goes today. */
export const INSTALL_URL = IN_STORE ? STORE_URL : SOURCE_URL;
