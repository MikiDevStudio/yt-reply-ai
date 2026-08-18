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
