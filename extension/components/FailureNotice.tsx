import { useState } from 'react';
import { type FailureFacts, describeFailure } from '@/lib/failure';
import { failureOf, sendRequest } from '@/lib/messaging';
import { MODEL_PRESETS } from '@/lib/models';
import { model as modelSetting } from '@/lib/settings';
import type { TrialOutcome } from '@/lib/trial';
import { SECONDARY } from './ui';

interface FailureNoticeProps {
  facts: FailureFacts;
  /**
   * Runs the same request again. Without it the retry button is left out
   * entirely rather than rendered dead — a button that does nothing is worse
   * than one that is not there.
   */
  onRetry?: () => void;
  /**
   * The settings section this card is rendered on, when it is on one. An action
   * pointing at the page you are already looking at would open a second tab of
   * it, so that one is dropped.
   */
  at?: '/account' | '/models';
  className?: string;
}

/**
 * One failure card, shown by every surface that can fail.
 *
 * The popover, the popup and the settings page all render this, so a 402 reads
 * the same wherever it is met and every case arrives with something to press.
 * The words come from `lib/failure.ts`; this file only knows how to draw them
 * and how to carry out an action.
 *
 * Opening a tab goes through the background worker: `openOptionsPage` and
 * `browser.tabs` do not exist in a content script, so calling them from the
 * popover threw — which is how the "Connect OpenRouter" button under a YouTube
 * comment came to do nothing at all.
 */
export function FailureNotice({ facts, onRetry, at, className = '' }: FailureNoticeProps) {
  /** The trial is a round trip, and a button that looks idle gets pressed twice. */
  const [claiming, setClaiming] = useState(false);
  /** What the trial answered when it answered something other than a key. */
  const [claimNote, setClaimNote] = useState<string | null>(null);

  // Cancelling is a decision, not a failure. Guarded here as well as at every
  // caller, so a missed check upstream cannot put "Cancelled" in a red box.
  // Below the hooks, which have to run on every render whatever this says.
  if (facts.kind === 'aborted') return null;

  const failure = describeFailure(facts);
  // The frame, and with it the role: an offer and a fault are not the same kind
  // of thing however alike their shape is.
  const notice = failure.tone === 'notice';
  const actions = failure.actions.filter(
    (action) => !(action.kind === 'options' && action.section === at),
  );

  async function useFreeModel() {
    await modelSetting.setValue(MODEL_PRESETS.free);
    onRetry?.();
  }

  /**
   * Take the free trial from wherever this card is standing.
   *
   * A key arriving means the request that failed can now succeed, so it is
   * simply run again — under a YouTube comment that turns one press into the
   * reply the person came for, with no tab in between. The answers that are not
   * a key are not failures and must not be drawn as any: the day's keys running
   * out is a sentence, not a red box inside a red box.
   */
  async function claimTrial() {
    setClaiming(true);
    setClaimNote(null);

    const result = await sendRequest<TrialOutcome>({ type: 'trial:claim' });
    setClaiming(false);

    if (!result.ok) {
      const described = describeFailure(failureOf(result));
      setClaimNote(`${described.title}. ${described.detail ?? ''}`.trim());
      return;
    }

    switch (result.data.status) {
      // `connected` means a key turned up from somewhere else — another tab,
      // most likely. Same conclusion: there is a key now, so try again.
      case 'issued':
      case 'connected':
        if (onRetry) onRetry();
        else setClaimNote('Your key is ready. Try that again.');
        return;
      case 'unavailable':
        setClaimNote(
          'Trial keys have run out for today. Try again tomorrow, or connect your own account.',
        );
        return;
      case 'used':
        setClaimNote('This install has already had its trial. Your own account is the way on.');
    }
  }

  /**
   * On the settings page itself the hash router is the whole navigation, and
   * asking the background for a tab would open a second copy of the page in
   * front of the one being read.
   */
  function openOptions(section: string) {
    if (location.protocol === 'chrome-extension:' && location.pathname.endsWith('/options.html')) {
      location.hash = section;
      return;
    }
    void sendRequest({ type: 'ui:openOptions', section });
  }

  return (
    // Built from utilities rather than daisyUI's `.alert`, which is a grid with
    // `grid-auto-flow: column` and an auto-sized track: it laid the title and
    // the explanation out as columns — "…rejected the keyIt was revoked…" — and
    // grew past the 420px popover until the button hung off the edge. A card
    // this shape is three utilities; fighting the component was more.
    <div
      // A card that is not reporting a fault must not announce itself as one:
      // `alert` interrupts a screen reader, which is right for a failure and
      // wrong for an offer.
      role={notice ? 'status' : 'alert'}
      className={`flex w-full min-w-0 flex-col items-start gap-2 border p-3 text-left text-[13px] ${
        notice ? 'border-accent-line bg-accent-soft' : 'border-error/25 bg-error/10'
      } ${className}`}
    >
      <span className={`font-medium ${notice ? 'text-accent' : 'text-error'}`}>
        {failure.title}
      </span>

      {failure.detail && (
        <span className="text-base-content/80">{failure.detail}</span>
      )}

      {/* OpenRouter's own words, kept quiet: useful when reporting a problem,
          never the first thing to read. `break-words` because a provider can
          answer with an unbroken URL or a stack of ids. */}
      {failure.raw && (
        <span className="break-words font-mono text-[11px] text-base-content/45">
          {failure.raw}
        </span>
      )}

      {claimNote && <span className="text-base-content/80">{claimNote}</span>}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            if (action.kind === 'retry') {
              return onRetry ? (
                <button key="retry" type="button" className={SECONDARY} onClick={onRetry}>
                  {action.label}
                </button>
              ) : null;
            }

            if (action.kind === 'trial') {
              return (
                <button
                  key="trial"
                  type="button"
                  className={SECONDARY}
                  disabled={claiming}
                  onClick={() => void claimTrial()}
                >
                  {claiming ? 'Getting your key…' : action.label}
                </button>
              );
            }

            if (action.kind === 'free-model') {
              return (
                <button
                  key="free-model"
                  type="button"
                  className={SECONDARY}
                  onClick={() => void useFreeModel()}
                >
                  {action.label}
                </button>
              );
            }

            const open =
              action.kind === 'options'
                ? () => openOptions(action.section)
                : () => void sendRequest({ type: 'ui:openUrl', url: action.url });

            return (
              <button key={action.label} type="button" className={SECONDARY} onClick={open}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
