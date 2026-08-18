import { Mail, MessageSquareWarning, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { CoffeeButton } from '@/components/CoffeeButton';
import { GHOST, ICON, MICRO, MICRO_TYPE, SECONDARY } from '@/components/ui';
import { CONTACT_URL, feedbackUrl, ISSUES_URL, type Rating } from '@/lib/feedback';
import { NUDGE_EVERY } from '@/lib/replies';

interface SupportCardProps {
  /** The milestone being marked — 20, 40, 60 … See `takeNudge`. */
  count: number;
  /** Ticking "don't show this again". Absent where the card cannot be silenced. */
  onSilence?: () => void;
  onClose: () => void;
}

/**
 * The thank-you shown every twentieth reply: one question, one ask, one exit.
 *
 * Deliberately not the dialog every extension ships at this point. Those rate
 * you on the way past — a modal that appears mid-task, wants five stars, and
 * offers no way to say the honest thing. This one only appears once a reply has
 * landed, states plainly how often it will be back, and can be switched off
 * from inside itself.
 *
 * Both answers to the question are outbound links the user presses. Nothing is
 * counted here and nothing is sent: see `lib/feedback.ts` for why a rating we
 * tallied ourselves would be the first telemetry this product ever had.
 *
 * Lives in `components/` rather than beside the content script so the parts it
 * is made of — the button, the contact links, the wording of the ask — are the
 * same ones the About section uses. The card itself is only ever drawn over
 * YouTube: on a settings page nobody has to be thanked for arriving.
 */
export function SupportCard({ count, onSilence, onClose }: SupportCardProps) {
  // Which answer was given, so the card can acknowledge it instead of sitting
  // there unchanged after a click that opened a tab somewhere behind it.
  const [rated, setRated] = useState<Rating | null>(null);

  const rate = (rating: Rating) => {
    setRated(rating);
    window.open(feedbackUrl(rating), '_blank', 'noreferrer');
  };

  return (
    <div className="flex w-[420px] max-w-[92vw] flex-col gap-4 border border-line-hi bg-overlay p-5 text-[14px] leading-[1.6] text-base-content shadow-elevated">
      {/* The signature label, carrying the number it exists to mark. */}
      <div className="flex items-center gap-2">
        <span className={`${MICRO_TYPE} text-primary`}>{count}</span>
        <span aria-hidden className="h-px w-10 bg-primary" />
        <span className={MICRO}>replies written</span>
        <button type="button" className={`${ICON} ml-auto -mr-1`} onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {/* Heading trick: the fact in full ink, the flattery at 55%. */}
      <h2 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.015em]">
        {count} replies, <span className="text-base-content/55">all in your own voice.</span>
      </h2>

      <div className="flex flex-col gap-2">
        <span className={MICRO}>is it working for you?</span>
        {rated ? (
          // One sentence, and no second ask. The tab that just opened is where
          // the rest of this conversation happens.
          <p className="text-base-content/70">
            {rated === 'good'
              ? 'Thank you — the page that just opened says where a review helps most.'
              : 'Fair enough. The page that just opened is the shortest way to tell me what went wrong.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SECONDARY} onClick={() => rate('bad')}>
              <ThumbsDown className="size-4" />
              Could be better
            </button>
            <button type="button" className={SECONDARY} onClick={() => rate('good')}>
              <ThumbsUp className="size-4" />
              Working well
            </button>
          </div>
        )}
      </div>

      {/* The ask. One paragraph, no second sentence about how hard it all is. */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-base-content/70">
          Reply AI is free, has no account and no limit, and runs on your own key. If it saves you
          an evening of typing, a tea is how it stays that way.
        </p>
        <CoffeeButton className="self-start" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <span className={MICRO}>something broken, or an idea?</span>
        <a className={GHOST} href={ISSUES_URL} target="_blank" rel="noreferrer">
          <MessageSquareWarning className="size-4" />
          Open an issue
        </a>
        <a className={GHOST} href={CONTACT_URL}>
          <Mail className="size-4" />
          Email
        </a>
      </div>

      {/* What the user is entitled to know about the thing they are looking at:
          how often it comes back, how to stop it, and that it reports nothing. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={MICRO}>shown every {NUDGE_EVERY} replies · nothing is sent from here</span>
        {onSilence && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-base-content/55 transition-colors duration-150 hover:text-base-content">
            <input type="checkbox" className="checkbox checkbox-xs" onChange={onSilence} />
            Don&rsquo;t show again
          </label>
        )}
      </div>
    </div>
  );
}
