import { useEffect, useState } from 'react';
import { CoffeeButton } from '@/components/CoffeeButton';
import { FailureNotice } from '@/components/FailureNotice';
import { GHOST, MICRO, MICRO_TYPE, SECONDARY, SOLID } from '@/components/ui';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
import { waitlistUrl } from '@/lib/pro';
import { enabled as enabledSetting, model as modelSetting, soul as soulSetting } from '@/lib/settings';
import { claimed as trialClaimed, type TrialOutcome } from '@/lib/trial';
import { useReplies } from '@/lib/use-replies';
import { useSetting } from '@/lib/use-setting';

/**
 * Toolbar popup: status at a glance, one switch, and a way into the settings.
 *
 * Deliberately thin. Anything that needs room — the soul profile, the model
 * picker, generation options — lives on the options page, which opens in a full
 * tab rather than this 320px box.
 */
export function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<KeyInfo | null>(null);
  const [usageFailure, setUsageFailure] = useState<FailureFacts | null>(null);
  const [model, setModel] = useState('');
  const [hasSoul, setHasSoul] = useState<boolean | null>(null);
  /** Whether this install can still take the free trial (#35). */
  const [trialAvailable, setTrialAvailable] = useState(false);
  const [claiming, setClaiming] = useState(false);
  /** What the trial answered when it answered something other than a key. */
  const [claimNote, setClaimNote] = useState<string | null>(null);
  const [claimFailure, setClaimFailure] = useState<FailureFacts | null>(null);
  const [on, setOn] = useSetting(enabledSetting);
  const replies = useReplies();

  // A key that cannot be read is a key that will not generate either, so the
  // reason is shown here rather than swallowed — this panel is where someone
  // looks first when replies stop working.
  async function loadUsage() {
    setUsageFailure(null);
    const info = await sendRequest<KeyInfo>({ type: 'usage:get' });
    if (info.ok) setUsage(info.data);
    else setUsageFailure(failureOf(info));
  }

  useEffect(() => {
    void (async () => {
      const status = await sendRequest<{ connected: boolean }>({ type: 'auth:status' });
      const isConnected = status.ok && status.data.connected;
      setConnected(isConnected);

      setModel(await modelSetting.getValue());
      setHasSoul((await soulSetting.getValue()).trim().length > 0);
      setTrialAvailable(!(await trialClaimed.getValue()));

      if (isConnected) await loadUsage();
    })();
  }, []);

  /**
   * Take the free trial here rather than send the reader somewhere to take it.
   *
   * Same request the settings page and the popover card send; this panel is
   * simply another place a first run can begin. The answers that are not a key
   * are sentences, not failures — only a genuine one gets the red card.
   */
  async function claimTrial() {
    setClaiming(true);
    setClaimNote(null);
    setClaimFailure(null);

    const result = await sendRequest<TrialOutcome>({ type: 'trial:claim' });
    setClaiming(false);

    if (!result.ok) {
      setClaimFailure(failureOf(result));
      return;
    }

    if (result.data.status === 'issued' || result.data.status === 'connected') {
      setConnected(true);
      setTrialAvailable(false);
      await loadUsage();
      return;
    }

    // "Not this minute" leaves the offer standing; "you have had yours" does not.
    if (result.data.status === 'used') setTrialAvailable(false);
    setClaimNote(
      result.data.status === 'unavailable'
        ? 'Trial keys have run out for today. Try again tomorrow, or connect your own account.'
        : 'This install has already had its trial. Your own account is the way on.',
    );
  }

  const openSettings = (section: string) => {
    // `openOptionsPage` cannot target a section, so the URL is built by hand.
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
    window.close();
  };

  const offerTrial = connected === false && trialAvailable;

  return (
    <div className="flex w-80 flex-col gap-4 bg-base-100 p-4 text-base-content">
      {/* A dot and a mono label, not a filled badge: a badge that size reads as
          a control you can press, and this one only reports. */}
      <header className="flex items-center justify-between gap-2">
        <span className="font-semibold">Reply AI</span>
        {connected === null ? (
          <span className={MICRO}>checking</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${connected ? 'bg-connected' : 'bg-warning'}`}
            />
            <span className={`${MICRO_TYPE} ${connected ? 'text-connected' : 'text-warning'}`}>
              {connected ? 'connected' : 'no key'}
            </span>
          </span>
        )}
      </header>

      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span className="font-medium">Show the button on YouTube</span>
        <input
          type="checkbox"
          className="toggle toggle-sm"
          checked={on ?? true}
          disabled={on === null}
          onChange={(event) => setOn(event.target.checked)}
        />
      </label>

      {connected === false && (
        <p className="text-sm text-base-content/70">
          {trialAvailable
            ? 'About thirty free replies to start with — no account, no card, nothing to cancel. Your own OpenRouter account carries on from there.'
            : 'Connect an OpenRouter account to start generating replies.'}
        </p>
      )}

      {connected && (
        <dl className="flex flex-col gap-2 text-sm">
          {/* Ours, and first. It used to read "3 of 50" and was a cap as much
              as a count; the cap is gone, so it is now only what it always
              claimed to be. The lifetime figure rides alongside it — that is
              the number people are actually pleased by. */}
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60" title="Since midnight, on this machine">
              Replies today
            </dt>
            {/* Counts, credits and model ids are mono: they are numbers and
                machine names, and the face says so (brand.md §2). */}
            <dd className="font-mono">
              {replies ? replies.today : '…'}
              {replies && replies.total > replies.today && (
                <span className="text-base-content/45"> · {replies.total} in all</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Model</dt>
            <dd className="truncate text-right font-mono text-[13px]">{model}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Soul profile</dt>
            <dd className="font-medium">
              {hasSoul === null ? '…' : hasSoul ? 'Set' : 'Not set'}
            </dd>
          </div>
          {usage && (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-base-content/60">Spent</dt>
                <dd className="font-mono">{usage.usage.toFixed(3)} credits</dd>
              </div>
              {usage.limitRemaining !== null && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-base-content/60">Left on this key</dt>
                  <dd className="font-mono">{usage.limitRemaining.toFixed(3)}</dd>
                </div>
              )}
              {usage.isFreeTier && (
                <p className="text-xs text-base-content/50">
                  No credits bought yet — free models allow 20 requests a minute and 50 a day.
                </p>
              )}
            </>
          )}
        </dl>
      )}

      {connected && usageFailure && (
        <FailureNotice facts={usageFailure} onRetry={() => void loadUsage()} />
      )}

      {claimNote && <p className="text-sm text-base-content/70">{claimNote}</p>}
      {claimFailure && <FailureNotice facts={claimFailure} onRetry={() => void claimTrial()} />}

      {offerTrial && (
        <button
          type="button"
          className={`${SOLID} justify-center`}
          disabled={claiming}
          onClick={() => void claimTrial()}
        >
          {claiming ? 'Getting your key…' : 'Try it free'}
        </button>
      )}

      {/* Solid unless the trial is on offer above it: one filled button to a
          surface, and when there is a free first run to be had, that is it. */}
      <button
        type="button"
        className={`${offerTrial ? SECONDARY : SOLID} justify-center`}
        onClick={() => openSettings('/account')}
      >
        {connected ? 'Settings' : 'Connect OpenRouter'}
      </button>

      {connected && hasSoul === false && (
        <button
          type="button"
          className={`${GHOST} justify-center`}
          onClick={() => openSettings('/soul')}
        >
          Write your soul profile
        </button>
      )}

      <p className="text-xs text-base-content/50">
        Open a YouTube video and press <span className="font-medium">AI reply</span> under any
        comment.
      </p>

      {/* The curiosity entry point, tagged apart from the ballot on the
          settings page: a link clicked in passing and a vote cast after reading
          are different claims and have to stay different numbers (#31). */}
      <a
        className="link text-xs text-base-content/50"
        href={waitlistUrl('popup')}
        target="_blank"
        rel="noreferrer"
      >
        What Pro would add, and how to ask for it
      </a>

      {/* Under Pro on purpose: one of these two asks for money for something
          that does not exist yet, and the other asks for nothing at all.

          Their button rather than the quiet line that used to be here. The
          extension is free, unlimited and has no upsell in it any more, so this
          is the only place the product asks for anything — and an ask that has
          to be squinted at is not worth making. Their colours, per brand.md §1;
          see components/CoffeeButton.tsx for why it is not their script.

          Their button, flat and in their yellow, and deliberately still that
          here. The standing ask that lets the card be rare (#45) is the glowing
          one in the reply popover — `components/CoffeeGlow.tsx` — which is in
          front of somebody a hundred times more often than this panel is. Two
          animated buttons would be one too many, and the mark itself has to
          appear somewhere undisguised. */}
      <CoffeeButton className="w-full" />
    </div>
  );
}
