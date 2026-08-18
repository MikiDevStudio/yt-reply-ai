/**
 * Where every Pro entry point leads.
 *
 * Pro is not built (#20). What exists is a waitlist page (#32) that captures an
 * address and a vote on which features are worth building — the whole demand
 * measurement, kept on a web page so the extension carries no telemetry at all
 * and the privacy policy has nothing to declare.
 *
 * The host is interim: it is a subdomain of a personal domain rather than the
 * product's own, which #34 has still to choose. The path is `/pro` for that
 * reason — when the brand domain arrives, only the host moves, and every link
 * shipped in an already-installed copy keeps working through a redirect.
 */
const WAITLIST_URL = 'https://reply-ai.mikidev.app/pro';

/**
 * Which entry point sent the user, tagged so the two stay separate numbers.
 *
 * `settings` is someone reading the Pro section with the ballot in front of
 * them; `popup` is a one-line link clicked out of curiosity; `nudge` is a click
 * from the support card, which is the one place the product interrupts anybody.
 * Three different claims, and they have to stay three different numbers.
 *
 * `nudge` matters more than the other two. There used to be a `limit` tag for a
 * person blocked by the daily cap, and it was the strongest signal we had;
 * removing the cap removed it. Someone who reaches for Pro while a card is in
 * their way is the nearest thing left to it — they are not browsing a feature
 * list, they are buying back a moment of their attention.
 */
export type ProEntryPoint = 'settings' | 'popup' | 'nudge';

/**
 * What Pro would contain, as a ballot.
 *
 * Ids and copy in one list because they cannot be allowed to drift: the id is
 * what a vote is counted under on the other side, and the sentence is what the
 * person was agreeing to when they ticked it. Each line is an issue that exists
 * and is unbuilt — announcing anything else would make the vote worthless.
 */
export const PRO_FEATURES = [
  {
    id: 'managed',
    title: 'No key to set up',
    detail:
      'Replies run on a key we provision, with a spend limit you set — no OpenRouter account, ' +
      'no top-ups. Everything free stays free and stays on your own key.',
  },
  {
    id: 'scanner',
    title: 'Relevance scanner',
    detail: 'Reads a comment section and points at the comments actually worth answering.',
  },
  {
    id: 'bulk',
    title: 'Bulk mode',
    detail: 'Draft replies to a whole page of comments at once, then go through them one by one.',
  },
  {
    id: 'presets',
    title: 'Style presets',
    detail: 'Saved voices to switch between — a channel, a client, a second language.',
  },
] as const;

export type ProFeatureId = (typeof PRO_FEATURES)[number]['id'];

/**
 * Where a Pro button leads, carrying what the user already ticked.
 *
 * The votes ride in the query string rather than being posted from here, and
 * the difference is the whole point: a navigation the user pressed, with its
 * parameters visible in the address bar, is not the extension reporting on
 * them. Nothing leaves this machine on its own, which is what keeps the
 * manifest free of telemetry and the privacy policy short (#17).
 *
 * The page reads `want` to pre-tick its own boxes, so the only thing left to
 * fill in there is an email address.
 */
export function waitlistUrl(from: ProEntryPoint, want: readonly ProFeatureId[] = []): string {
  const url = `${WAITLIST_URL}?from=${from}`;
  return want.length > 0 ? `${url}&want=${want.join(',')}` : url;
}
