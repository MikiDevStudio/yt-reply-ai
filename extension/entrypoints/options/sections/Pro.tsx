import { useState } from 'react';
import { PRO_FEATURES, type ProFeatureId, waitlistUrl } from '@/lib/pro';
import { useQuota } from '@/lib/use-quota';
import { Section } from '../Section';

/**
 * The Pro placeholder: a page that says what Pro would be and leads to a
 * waitlist, because Pro is not built and will not be until the waitlist says it
 * should be. See `docs/plans/2026-08-16-pro-offer-decisions.md`.
 *
 * Deliberately not a purchase. There is nothing to buy, nothing is taken here,
 * and the copy has to leave the reader in no doubt about that — a page that
 * feels like a checkout which failed would cost the trust that makes the email
 * worth giving in the first place.
 */
export function Pro() {
  const quota = useQuota();

  // Held for this visit only, and deliberately not stored. A saved vote would
  // be an opinion we remember but never sent anywhere, and the person would
  // have every reason to assume the opposite.
  const [want, setWant] = useState<ProFeatureId[]>([]);

  const toggle = (id: ProFeatureId) =>
    setWant((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  return (
    <>
      <Section
        title="Today's replies"
        description="The free tier covers 50 replies a day. A comment costs one the first time it is answered; regenerating that same comment costs nothing, however many attempts it takes."
      >
        <div className="flex items-baseline gap-3">
          <span className="font-medium text-2xl">
            {quota ? quota.used : '…'}
            <span className="text-base text-base-content/50"> of {quota?.limit ?? 50}</span>
          </span>
          <span className="text-sm text-base-content/60">used since midnight</span>
        </div>

        <p className="text-sm text-base-content/70">
          The count is stored in your Chrome profile, so it follows you to another machine and
          survives a reinstall. It is never sent anywhere.
        </p>
      </Section>

      <Section
        title="Pro"
        description="Pro does not exist yet. Tick what you would actually pay for — nothing here is for sale today, and what you tick decides what gets built first."
      >
        <div className="flex flex-col gap-3">
          {PRO_FEATURES.map(({ id, title, detail }) => (
            <label key={id} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm mt-0.5"
                checked={want.includes(id)}
                onChange={() => toggle(id)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-base-content/70">{detail}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-sm text-base-content/70">
          The button carries these ticks to the waitlist page, where the boxes arrive already
          filled and only an email is left to type. That page also shows what everyone else voted
          for, and asks the price question — a monthly subscription and a one-off licence are
          different products, and only you can say which one you would take.
        </p>

        <div className="card-actions">
          <a
            className="btn btn-primary btn-sm"
            href={waitlistUrl('settings', want)}
            target="_blank"
            rel="noreferrer"
          >
            {want.length > 0 ? 'Vote and join the waitlist' : 'Join the waitlist'}
          </a>
        </div>

        <p className="text-xs text-base-content/50">
          Nothing is sent from here. Pressing the button opens that page with your choices in the
          address bar; the extension itself reports nothing, ever.
        </p>
      </Section>
    </>
  );
}
