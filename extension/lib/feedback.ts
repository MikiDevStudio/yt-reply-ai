/**
 * Where an opinion goes, and why it never goes to us directly.
 *
 * The support dialog asks one question — is this working for you — and both
 * answers are a link the user presses. Nothing is posted, nothing is recorded,
 * and the extension keeps talking to openrouter.ai and nothing else. A rating
 * counted here would be the first telemetry this product has ever had, and it
 * would have to be declared on the Web Store listing and in the privacy policy
 * for a number that a public review page already reports better.
 *
 * The page on the other side reads `rating` to choose its words: someone who
 * pressed "good" is shown where to leave a review, someone who pressed "could
 * be better" is shown how to say what went wrong. Which is to say the query
 * string is the whole mechanism, in the address bar, where the person who wrote
 * it can see it.
 */
const FEEDBACK_URL = 'https://reply-ai.mikidev.app/feedback';

/** What the user pressed. Two answers, because a third would be nobody's. */
export type Rating = 'good' | 'bad';

export function feedbackUrl(rating: Rating): string {
  return `${FEEDBACK_URL}?rating=${rating}`;
}

/**
 * Where a bug or an idea should land: the tracker the code already lives in.
 *
 * `/issues/new` rather than the repository root — someone who has decided to
 * report something should not have to find the button.
 */
export const ISSUES_URL = 'https://github.com/MikiDevStudio/yt-reply-ai/issues/new';

/**
 * The address that actually receives mail, as opposed to the one mail is sent
 * from. Named in full so it can be copied out of a screenshot.
 */
export const CONTACT_EMAIL = 'privacy@mikidev.app';

/** A mail link with the subject already filled in, so replies can be filed. */
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Reply AI')}`;
