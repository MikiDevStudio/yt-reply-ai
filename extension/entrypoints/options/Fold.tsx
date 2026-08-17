import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface FoldProps {
  title: string;
  /** Shown under the title, in the summary, so a closed fold still says what it holds. */
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
export function Fold({ title, description, defaultOpen = false, children }: FoldProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group card border border-line bg-base-200"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="card-body cursor-pointer list-none flex-row items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-1">
          <h2 className="card-title text-base">{title}</h2>
          {description && <p className="text-sm text-base-content/70">{description}</p>}
        </div>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-base-content/50 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="card-body gap-4 pt-0">{children}</div>
    </details>
  );
}
