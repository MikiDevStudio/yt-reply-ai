import type { ReactNode } from 'react';
import { CardLabel } from './CardLabel';

interface SectionProps {
  /** Position on the page, 1-based. Cards are numbered down the column. */
  n: number;
  title: string;
  /** Shown under the label, before the controls. */
  description?: ReactNode;
  children: ReactNode;
}

/**
 * One settings card. Keeps every section framed the same way.
 *
 * Plain utilities rather than daisyUI's `card`: the frame is a 1px line, sharp
 * corners and `p-5`, and every one of those had to be overridden anyway.
 */
export function Section({ n, title, description, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4 border border-line bg-base-200 p-5">
      <div className="flex flex-col gap-2">
        <CardLabel n={n}>{title}</CardLabel>
        {description && <p className="text-sm text-base-content/70">{description}</p>}
      </div>
      {children}
    </section>
  );
}
