/**
 * Every outbound address the site uses, in one file.
 *
 * Not for tidiness: the Chrome Web Store listing does not exist yet, and when
 * it does exist the install button, the review link on the feedback page and
 * the sentence under the hero all have to change in the same edit. One
 * constant and one flag make that a two-line change instead of a search.
 */

/** The repository. Public, and the only place a build can be had today. */
export const SOURCE_URL = 'https://github.com/MikiDevStudio/yt-reply-ai';

/** Where a bug or an idea should land. */
export const ISSUES_URL = `${SOURCE_URL}/issues/new`;

/** Buy Me a Coffee. A plain outbound link with no id, campaign or per-page tag. */
export const SUPPORT_URL = 'https://buymeacoffee.com/mikipirson';

/** The address that receives mail, as opposed to the one mail is sent from. */
export const CONTACT_EMAIL = 'privacy@mikidev.app';

/**
 * The extension's id, pinned because the OpenRouter OAuth redirect embeds it.
 * The store URLs below are built from it and are correct the day the listing
 * goes live — they 404 until then, which is why `IN_STORE` gates them.
 */
export const EXTENSION_ID = 'lbldodejinpgfnoaficdhaglkbhnkmlb';

export const STORE_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;
export const STORE_REVIEW_URL = `${STORE_URL}/reviews`;

/**
 * Whether the Chrome Web Store listing is live.
 *
 * Flip this to `true` the day it is published — nothing else on the site has to
 * change. Until then the install button leads to the repository and says so,
 * because a button that promises a store page and delivers a 404 costs more
 * trust than an honest "not there yet" ever could.
 */
export const IN_STORE = false;

/** Where the primary install button actually goes today. */
export const INSTALL_URL = IN_STORE ? STORE_URL : SOURCE_URL;
