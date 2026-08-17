import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  /** Shown under the title, before the controls. */
  description?: ReactNode;
  children: ReactNode;
}

/** One settings card. Keeps every section framed the same way. */
export function Section({ title, description, children }: SectionProps) {
  return (
    <section className="card border border-line bg-base-200">
      <div className="card-body gap-4">
        <h2 className="card-title text-base">{title}</h2>
        {description && <p className="text-sm text-base-content/70">{description}</p>}
        {children}
      </div>
    </section>
  );
}
