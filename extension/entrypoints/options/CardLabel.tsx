import { MICRO, MICRO_TYPE } from '@/components/ui';

interface CardLabelProps {
  /** Position on the page, 1-based. Shown as two digits. */
  n: number;
  children: string;
}

/**
 * How a settings card opens: a two-digit number in the accent, a 40px hairline,
 * and the card's name in the micro type. brand.md §2 calls this the signature
 * element, and on this page it is the card's title — there is no second, larger
 * heading repeating the same words underneath it.
 *
 * The number and the rule index the page for the eye and say nothing out loud,
 * so both are hidden from assistive tech and the heading is the name alone.
 */
export function CardLabel({ n, children }: CardLabelProps) {
  return (
    <h2 className="flex items-center gap-3">
      <span aria-hidden className={`${MICRO_TYPE} text-accent`}>
        {String(n).padStart(2, '0')}
      </span>
      <span aria-hidden className="h-px w-10 bg-accent" />
      <span className={MICRO}>{children}</span>
    </h2>
  );
}
