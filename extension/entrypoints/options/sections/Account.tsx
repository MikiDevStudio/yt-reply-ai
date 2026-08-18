import { useEffect, useRef, useState } from 'react';
import { FailureNotice } from '@/components/FailureNotice';
import { FIELD, GHOST, MICRO_TYPE, SECONDARY, SOLID } from '@/components/ui';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, type Response, sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
import {
  claimed as trialClaimed,
  keyIsOurs as trialKeyIsOurs,
  spent as trialKeySpent,
  type TrialOutcome,
} from '@/lib/trial';
import { Section } from '../Section';

/**
 * The OpenRouter connection: authorise, see what the key has spent, disconnect.
 *
 * Everything here goes through the background worker rather than storage,
 * because the key itself must never reach a page — not even ours.
 */
export function Account() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<KeyInfo | null>(null);
  const [manualKey, setManualKey] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailureFacts | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  /**
   * Whether the connected key is the trial one rather than an account of the
   * user's. Read here as well as in the failure copy, because "connected" on
   * its own would let someone believe they had already done the thing this
   * page is asking them to do.
   */
  const [onTrialKey, setOnTrialKey] = useState(false);
  /** Whether that trial key has already been refused. See `spent` in lib/trial.ts. */
  const [trialSpent, setTrialSpent] = useState(false);
  /** What the trial answered, when it answered something other than a key. */
  const [trialNote, setTrialNote] = useState<string | null>(null);

  // What produced the failure on screen, so its retry button repeats that and
  // not whatever was pressed last.
  const lastAction = useRef<(() => Promise<Response<unknown>>) | null>(null);

  useEffect(() => {
    void refresh();
    void trialClaimed.getValue().then(setTrialUsed);
  }, []);

  async function refresh() {
    const status = await sendRequest<{ connected: boolean }>({ type: 'auth:status' });
    const isConnected = status.ok && status.data.connected;
    setConnected(isConnected);
    setOnTrialKey(await trialKeyIsOurs.getValue());
    setTrialSpent(await trialKeySpent.getValue());

    if (isConnected) {
      const info = await sendRequest<KeyInfo>({ type: 'usage:get' });
      setUsage(info.ok ? info.data : null);
    } else {
      setUsage(null);
    }
  }

  /**
   * The trial (#38): one button, no account, a key of this install's own with a
   * few cents on it.
   *
   * Kept apart from `run` because the interesting answers are successes rather
   * than failures — "not this minute" and "you have had yours" both come back
   * `ok`, and neither is an error notice.
   */
  async function startTrial() {
    const action = () => sendRequest<TrialOutcome>({ type: 'trial:claim' });
    lastAction.current = action;
    setBusy(true);
    setFailure(null);
    setTrialNote(null);

    const result = await action();
    if (!result.ok) {
      setFailure(failureOf(result));
    } else {
      if (result.data.status === 'unavailable') {
        setTrialNote('Trial keys have run out for today. Try again tomorrow, or connect your own account.');
      }
      if (result.data.status === 'used') {
        setTrialNote('This install has already had its trial. Connecting your own account is the way on.');
      }
      if (result.data.status !== 'unavailable') setTrialUsed(true);
    }

    await refresh();
    setBusy(false);
  }

  async function run(action: () => Promise<Response<unknown>>) {
    lastAction.current = action;
    setBusy(true);
    setFailure(null);

    const result = await action();
    // Closing the consent window is a decision, not a failure worth an alert.
    if (!result.ok && result.kind !== 'aborted') {
      setFailure(failureOf(result));
    }

    await refresh();
    setBusy(false);
  }

  return (
    <Section n={1} title="OpenRouter account">
      {connected === null ? (
        <span className="loading loading-dots loading-sm" />
      ) : connected ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* A dot and a mono label, not a filled badge — the same status this
                key gets in the popup, said the same way. */}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-connected" />
              <span className={`${MICRO_TYPE} text-connected`}>
                {onTrialKey ? 'trial key' : 'connected'}
              </span>
            </span>
            {usage && (
              <span className="text-base-content/60">
                <span className="font-mono">{usage.usage.toFixed(3)}</span> credits used
                {usage.limitRemaining !== null && (
                  <>
                    {' · '}
                    <span className="font-mono">{usage.limitRemaining.toFixed(3)}</span> left on
                    this key
                  </>
                )}
                {usage.isFreeTier && ' · no credits bought — free models capped at 50/day'}
              </span>
            )}
          </div>
          {onTrialKey && (
            <p className="text-sm text-base-content/70">
              {trialSpent
                ? 'The trial is used up. Connecting your own OpenRouter account picks up from ' +
                  'here — replies cost about $0.00125 each, billed by OpenRouter.'
                : 'These replies are on the trial key, not on an account of yours. Connect one ' +
                  'whenever you like; the trial runs until it is spent either way.'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Offered while a key is stored only when that key is ours.
                Authorising replaces it, which is what someone at the end of the
                trial needs and what someone with their own account does not. */}
            {onTrialKey && (
              <button
                type="button"
                className={trialSpent ? SOLID : SECONDARY}
                disabled={busy}
                onClick={() => run(() => sendRequest({ type: 'auth:connect' }))}
              >
                Connect OpenRouter
              </button>
            )}
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => run(() => sendRequest({ type: 'auth:disconnect' }))}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          {!trialUsed && (
            <p className="text-sm text-base-content/70">
              The trial is about thirty replies on a key of this install's own — no account, no
              card, nothing to cancel. When it runs out, connect your own OpenRouter account and
              carry on; replies cost about $0.00125 each.
            </p>
          )}

          <p className="text-sm text-base-content/70">
            Authorising creates a key for this extension only — your main key is never shared.
            You can cap its spend and expiry on OpenRouter's screen.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {!trialUsed && (
              <button type="button" className={SOLID} disabled={busy} onClick={startTrial}>
                Try it free
              </button>
            )}
            <button
              type="button"
              className={trialUsed ? SOLID : SECONDARY}
              disabled={busy}
              onClick={() => run(() => sendRequest({ type: 'auth:connect' }))}
            >
              Connect OpenRouter
            </button>
            <button
              type="button"
              className={GHOST}
              onClick={() => setShowManual((value) => !value)}
            >
              Already have a key?
            </button>
          </div>

          {showManual && (
            <div className="flex gap-2">
              <input
                type="password"
                className={`${FIELD} flex-1 font-mono`}
                placeholder="sk-or-v1-…"
                value={manualKey}
                onChange={(event) => setManualKey(event.target.value)}
              />
              <button
                type="button"
                className={SECONDARY}
                disabled={busy || manualKey.trim().length === 0}
                onClick={() =>
                  run(() => sendRequest({ type: 'auth:setKey', apiKey: manualKey.trim() }))
                }
              >
                Save
              </button>
            </div>
          )}

          {trialNote && <p className="text-sm text-base-content/70">{trialNote}</p>}
        </>
      )}

      {failure && (
        <FailureNotice
          facts={failure}
          at="/account"
          onRetry={() => {
            const action = lastAction.current;
            if (action) void run(action);
          }}
        />
      )}
    </Section>
  );
}
