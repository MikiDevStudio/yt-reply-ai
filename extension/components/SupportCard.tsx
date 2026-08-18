import { X } from 'lucide-react';
import { CoffeeButton } from '@/components/CoffeeButton';
import { ICON, MICRO, MICRO_TYPE } from '@/components/ui';
import { sendRequest } from '@/lib/messaging';
import { waitlistUrl } from '@/lib/pro';
import { NUDGE_EVERY } from '@/lib/replies';

interface SupportCardProps {
  /** The milestone being marked — 50, 100, 150 … See `takeNudge`. */
  count: number;
  onClose: () => void;
}

/**
 * The thank-you shown every fiftieth reply: one number, one ask, one exit.
 *
 * It used to be a modal raised over the popover with the page dimmed behind it,
 * every twentieth reply, and that was right while the card was also the thing a
 * licence switched off — the interruption was the price of a free, uncapped
 * tool, and a note that waited politely until the work was done is a note
 * nobody reads. #39 ended that: a coffee buys nothing at all, so the
 * interruption bought nothing either and only spent goodwill on the people
 * likeliest to give some.
 *
 * So it is rare now, and it no longer stands in the way. It renders inside the
 * popover, under the finished reply and under the actions, where it grows the
 * card downwards and covers nothing. Rare and modal is still modal —
 * "unobtrusive" is a fact about the shape, not only about the frequency.
 *
 * The rating question that used to sit here has moved out into
 * `components/ReviewAsk.tsx`, with its own counter and its own permanent
 * dismissal, and it took the "something broken?" links with it. The two asks
 * are different asks: one is for money and recurs for as long as this is free,
 * the other is for a sentence and is meant to be answered once.
 *
 * Lives in `components/` rather than beside the content script so the parts it
 * is made of are the same ones the About section uses. The card itself is only
 * ever drawn over YouTube: on a settings page nobody has to be thanked for
 * arriving.
 */
export function SupportCard({ count, onClose }: SupportCardProps) {
  return (
    <div className="flex flex-col gap-3 border border-line bg-surface-hi p-3 motion-safe:animate-ask-in">
      {/* The signature label, carrying the number it exists to mark. */}
      <div className="flex items-center gap-2">
        <span className={`${MICRO_TYPE} text-primary`}>{count}</span>
        <span aria-hidden className="h-px w-8 bg-primary" />
        <span className={MICRO}>replies written</span>
        <button type="button" className={`${ICON} -mr-1 ml-auto`} onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {/* Heading trick: the fact in full ink, the flattery at 55%. */}
      <h2 className="text-[15px] font-semibold leading-[1.3] tracking-[-0.01em]">
        {count} replies, <span className="text-base-content/55">all in your own voice.</span>
      </h2>

      {/* The ask. One paragraph, no second sentence about how hard it all is. */}
      <p className="text-[13px] leading-[1.6] text-base-content/70">
        Reply AI is free, has no account and no limit, and runs on your own key. If it saves you an
        evening of typing, a coffee is how it stays that way.
      </p>

      <CoffeeButton className="self-start" />

      {/* What the reader is entitled to know about the thing that just
          appeared: how often it comes back, that it reports nothing, and the
          one thing that switches it off. There is no "don't show again" tick —
          this is the only place the product asks for anything at all, and it
          now asks from the bottom of a panel rather than from in front of it. */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <span className={MICRO}>shown every {NUDGE_EVERY} replies · nothing is sent from here</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            className="text-[12px] text-base-content/45 underline decoration-line-hi underline-offset-4 transition-colors duration-150 hover:text-base-content"
            onClick={() => void sendRequest({ type: 'ui:openOptions', section: '/licence' })}
          >
            Have a licence code? Enter it here
          </button>
          <a
            className="text-[12px] text-base-content/45 underline decoration-line-hi underline-offset-4 transition-colors duration-150 hover:text-base-content"
            href={waitlistUrl('nudge')}
            target="_blank"
            rel="noreferrer"
          >
            What Pro would add
          </a>
        </div>
      </div>
    </div>
  );
}
