import { Mail, MessageSquareWarning, Star, X } from 'lucide-react';
import { useState } from 'react';
import { FOCUS, GHOST, ICON, MICRO, SECONDARY } from '@/components/ui';
import { CONTACT_URL, IN_STORE, ISSUES_URL, REVIEW_URL } from '@/lib/feedback';
import { REVIEW_EVERY, silenceReview } from '@/lib/replies';

interface ReviewAskProps {
  /** Dismissed for this popover only — the X. See `onAnswer` for the other one. */
  onClose: () => void;
  /** One of the two buttons was pressed: gone for good, on this profile. */
  onAnswer: () => void;
}

/** Five, because that is how many the Chrome Web Store has. */
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * The review ask: five stars, both roads, and two ways to end it for good.
 *
 * Its own block rather than a paragraph on the coffee card, with its own
 * counter and its own dismissal, because it asks for something else and stops
 * for a different reason. A coffee recurs for as long as this is free; this one
 * is meant to be answered once and never seen again — and a licence must not
 * silence it, since a review that can be paid off is worth nothing to anybody.
 *
 * ## The stars decide nothing
 *
 * Both routes are rendered whatever the answer, and a star only lights one of
 * them. Routing four stars to the Store and two to a bug report is review
 * gating: Google Play and the App Store ban it outright, and the Web Store's
 * rating-manipulation policy reaches it. The cost of getting that wrong is the
 * listing, which is the whole business. `/feedback` on the site draws its two
 * columns the same way and for the same reason.
 *
 * Stars, and not the dot rating used for creativity, which the brand book
 * refuses on the grounds that a star is a widget from another product. Here the
 * other product is exactly the point: the thing being asked for is a star on a
 * store page, and drawing it as anything else would hide what the ask is.
 *
 * ## Nothing is counted
 *
 * The star is never sent anywhere and is not even stored — it lives in this
 * component's state for as long as the popover is open. See `lib/feedback.ts`
 * for why a rating we tallied ourselves would be the first telemetry this
 * product ever had.
 *
 * ## And it has to be taken on trust
 *
 * "I left one" is self-reported and unverifiable. The Chrome Web Store exposes
 * no signal for whether a review was left — no API, unlike Google Play and the
 * App Store — so "ask again only if they have not reviewed" cannot be built,
 * and both buttons do the same thing: stop asking.
 */
export function ReviewAsk({ onClose, onAnswer }: ReviewAskProps) {
  const [stars, setStars] = useState<number | null>(null);

  // 4 and 5 are what a store review is for; 1 to 3 is something to fix. The
  // split changes which line is emphasised and nothing else — see above.
  const pleased = stars !== null && stars >= 4;
  const unhappy = stars !== null && stars <= 3;

  const answer = () => {
    void silenceReview();
    onAnswer();
  };

  return (
    <div className="flex flex-col gap-3 border border-line bg-surface-hi p-3 motion-safe:animate-ask-in">
      <div className="flex items-center gap-2">
        <span className={MICRO}>after {REVIEW_EVERY} replies</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
        <button
          type="button"
          className={`${ICON} -mr-1`}
          onClick={onClose}
          aria-label="Not now"
          title="Not now"
        >
          <X className="size-4" />
        </button>
      </div>

      <h2 className="text-[15px] font-semibold leading-[1.3] tracking-[-0.01em]">
        How is it going? <span className="text-base-content/55">Both answers are useful.</span>
      </h2>

      <div className="flex items-center gap-1" role="group" aria-label="How it is going">
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            className={`p-0.5 transition-colors duration-150 ${
              stars !== null && value <= stars
                ? 'text-primary'
                : 'text-base-content/28 hover:text-base-content/55'
            } ${FOCUS}`}
            aria-label={`${value} out of 5`}
            aria-pressed={stars === value}
            onClick={() => setStars(value)}
          >
            <Star className={`size-5 ${stars !== null && value <= stars ? 'fill-current' : ''}`} />
          </button>
        ))}
      </div>

      {/* One sentence that changes with the answer, and two roads that do not.
          The sentence is the whole of what a star buys. */}
      <p className="text-[13px] leading-[1.6] text-base-content/70">
        {pleased
          ? IN_STORE
            ? 'Thank you. A review on the Store is the only thing that puts this in front of other channel owners — it takes a sentence.'
            : 'Thank you. The Store listing is still in preparation, so a star on the repository is what does that job for now.'
          : unhappy
            ? 'Then I would rather hear what is wrong than be rated for it. A bad reply, a button that never appeared, a comment section it could not read — all of it is fixable, and none of it is fixable without knowing.'
            : 'Nothing is sent from here, whichever star you press. Both roads below stay open either way.'}
      </p>

      {/* Both, always, in the same order, whatever the stars said. Only the
          weight changes: the lit one is outlined, the other is plain text. */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          className={pleased ? SECONDARY : GHOST}
          href={REVIEW_URL}
          target="_blank"
          rel="noreferrer"
        >
          <Star className="size-4" />
          {IN_STORE ? 'Leave a review' : 'Star it on GitHub'}
        </a>
        <a className={unhappy ? SECONDARY : GHOST} href={ISSUES_URL} target="_blank" rel="noreferrer">
          <MessageSquareWarning className="size-4" />
          Report a problem
        </a>
        <a className={GHOST} href={CONTACT_URL} target="_blank" rel="noreferrer">
          <Mail className="size-4" />
          Write to me
        </a>
      </div>

      {/* The end of it, either way. Taken on trust because there is nothing to
          check it against, and offered plainly because a block that could only
          be escaped by doing what it asks is not an ask. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3">
        <span className={MICRO}>then never again</span>
        <button
          type="button"
          className="text-[12px] text-base-content/45 underline decoration-line-hi underline-offset-4 transition-colors duration-150 hover:text-base-content"
          onClick={answer}
        >
          I left one
        </button>
        <button
          type="button"
          className="text-[12px] text-base-content/45 underline decoration-line-hi underline-offset-4 transition-colors duration-150 hover:text-base-content"
          onClick={answer}
        >
          Not interested
        </button>
      </div>
    </div>
  );
}
