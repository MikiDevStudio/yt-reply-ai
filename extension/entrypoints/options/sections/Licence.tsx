import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FIELD, GHOST, MICRO, SECONDARY, SOLID } from '@/components/ui';
import { CONTACT_URL } from '@/lib/feedback';
import {
  current,
  type Entitlement,
  forget,
  redeem,
  type Redemption,
  token as stored,
} from '@/lib/licence';
import { NUDGE_EVERY } from '@/lib/replies';
import { Section } from '../Section';

/**
 * Where a code becomes a licence (#39).
 *
 * A section of its own rather than a block inside About: someone arriving here
 * has a code and is looking for the place to put it, and "About" is not a word
 * anybody searches for with a code in hand.
 *
 * Two things it must not do. It must not oversell: today a licence switches off
 * the thank-you card and nothing else, and multiple profiles (#12) and profile
 * export (#33) do not exist yet. And it must not read as a shop — a licence
 * that could be bought would turn the coffee button into a checkout and bring
 * VAT, a Trader declaration and a right of withdrawal with it. Codes are gifts,
 * and the copy says so in the first paragraph rather than leaving it to be
 * inferred.
 */
export function Licence() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Redemption | null>(null);
  const [licence, setLicence] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setEntitlement(await current());
      setLicence(await stored.getValue());
      setLoaded(true);
    })();
  }, []);

  async function activate() {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await redeem(pasted);
      setResult(outcome);
      if (outcome.status === 'activated' || outcome.status === 'restored') {
        setEntitlement(outcome.entitlement);
        setLicence(await stored.getValue());
        setPasted('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await forget();
    setEntitlement(null);
    setLicence(null);
    setResult(null);
  }

  if (!loaded) return null;

  if (entitlement) {
    return (
      <>
        <Section
          n={1}
          title={entitlement.t === 'promo' ? 'Promo licence' : 'Supporter licence'}
          description={
            entitlement.t === 'promo'
              ? 'A code given rather than sold. It unlocks the same things and runs out on the date below.'
              : 'Thank you — that is the whole of what the free version ever asks for, and it is off now.'
          }
        >
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-base-content/60">Code</dt>
              <dd className="font-mono">{entitlement.id}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-base-content/60">Activated</dt>
              <dd className="font-mono">{day(entitlement.iat)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-base-content/60">Expires</dt>
              <dd className="font-mono">{entitlement.exp === null ? 'never' : day(entitlement.exp)}</dd>
            </div>
          </dl>

          <p className="text-sm text-base-content/70">
            The card that appeared every {NUDGE_EVERY} replies is switched off, here and on every
            machine this Chrome profile syncs to. Multiple soul profiles and profile export are
            what this will unlock next; they are not built yet, and this licence covers them when
            they are.
          </p>
        </Section>

        <Section
          n={2}
          title="Keep a copy"
          description="The string below is the licence itself. It is worth saving somewhere you keep things — a password manager, a note."
        >
          {licence && <Export licence={licence} />}

          <p className="text-sm text-base-content/70">
            Two reasons to have it. If Chrome sync is off, this is how the licence reaches your
            other machines — paste it into this field there. And if this project ever stops, this
            string still works: nothing checks in with us again, so there is nothing to switch off.
          </p>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <input
              className={FIELD}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder="Paste another code or licence here"
              spellCheck={false}
            />
            <button type="button" className={SECONDARY} disabled={busy || !pasted.trim()} onClick={activate}>
              Replace
            </button>
            <button type="button" className={GHOST} onClick={remove}>
              Remove this licence
            </button>
          </div>

          {result && <Outcome result={result} />}
        </Section>
      </>
    );
  }

  return (
    <Section
      n={1}
      title="Licence code"
      description={`If you were given one, it goes here — and the card that appears every ${NUDGE_EVERY} replies never appears again.`}
    >
      {/* The sentence this screen exists to make unmissable. A licence that
          could be bought would make the coffee button a checkout, and with it
          come VAT, a Trader declaration on the Store listing and a statutory
          right of withdrawal. Codes are given instead, which keeps a donation a
          donation — so the copy has to close the door rather than leave it
          ambiguous. */}
      <p className="text-sm text-base-content/70">
        Codes are given, never sold. They turn up in giveaways under the promo videos, and go out
        by hand. There is nothing to buy on this screen and no way to buy one anywhere else —
        buying a coffee does not produce one either.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={FIELD}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder="RA-…"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="button" className={SOLID} disabled={busy || !pasted.trim()} onClick={activate}>
          {busy ? 'Checking…' : 'Activate'}
        </button>
      </div>

      {result && <Outcome result={result} />}

      <p className="text-sm text-base-content/70">
        A licence exported from another machine goes in the same field. Activating happens once:
        afterwards the extension never contacts us about it again — there is no re-check and
        nothing to renew, which is also why a licence keeps working if this project ever stops.
      </p>

      <p className={MICRO}>replies are free, unlimited and on your own key, licence or not</p>
    </Section>
  );
}

/** The licence as text, with the one control it needs. */
function Export({ licence }: { licence: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <code className="block max-h-24 overflow-auto break-all border border-line bg-base-100 p-3 font-mono text-[12px] text-base-content/70">
        {licence}
      </code>
      <button
        type="button"
        className={SECONDARY}
        onClick={() => {
          void navigator.clipboard.writeText(licence).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy the licence'}
      </button>
    </div>
  );
}

/**
 * What happened, in one sentence each.
 *
 * A refused code gets a reason it can act on — except a forged one, which gets
 * the same words as a typo. Explaining exactly why a signature failed is
 * explaining how to make one that does not.
 */
function Outcome({ result }: { result: Redemption }) {
  const message: Record<Redemption['status'], string> = {
    activated: 'Activated. The card is off from here on.',
    restored: 'Restored from the licence you pasted — nothing had to be asked of anyone.',
    malformed: 'That is not a code or a licence. Check it against the email it came in.',
    unknown: 'We have no record of that code. If it was typed by hand, the letters I, L, O and U never appear in one.',
    spent: 'Every activation on that code has been used. Write in and it will be sorted out.',
    expired: 'That code has passed its date.',
    unavailable: 'Could not reach us just now. Nothing was used up — try again in a minute.',
  };

  const good = result.status === 'activated' || result.status === 'restored';

  return (
    <p
      role="status"
      className={`border p-3 text-[13px] ${
        good ? 'border-accent-line bg-accent-soft text-accent' : 'border-warning/25 bg-warning/10'
      }`}
    >
      {message[result.status]}
      {result.status === 'spent' && (
        <>
          {' '}
          <a className="underline" href={CONTACT_URL} target="_blank" rel="noreferrer">
            Write in
          </a>
          .
        </>
      )}
    </p>
  );
}

function day(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
