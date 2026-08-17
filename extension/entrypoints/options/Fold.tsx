import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { CardLabel } from './CardLabel';

interface FoldProps {
  /** Position on the page, 1-based. Same counter as `Section`. */
  n: number;
  title: string;
  /** Shown under the label, in the summary, so a closed fold still says what it holds. */
  description?: ReactNode;
  /**
   * Whether it starts open. Session-only, and only the first render reads it —
   * after that the fold is the user's to open and close.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A `Section` that folds away.
 *
 * Same card frame, so a folded control reads as put away rather than missing.
 * Controlled `open` rather than the browser's own state: this sits in a page
 * that re-renders on every keystroke elsewhere, and an uncontrolled `<details>`
 * would be one prop diff away from snapping shut under the user.
 */
export function Fold({ n, title, description, defaultOpen = false, children }: FoldProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group border border-line bg-base-200"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-2">
          <CardLabel n={n}>{title}</CardLabel>
          {description && <p className="text-sm text-base-content/70">{description}</p>}
        </div>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-base-content/50 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="flex flex-col gap-4 px-5 pb-5">{children}</div>
    </details>
  );
}
