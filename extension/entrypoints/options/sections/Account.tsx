import { useEffect, useRef, useState } from 'react';
import { FailureNotice } from '@/components/FailureNotice';
import { FIELD, GHOST, MICRO_TYPE, SECONDARY, SOLID } from '@/components/ui';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, type Response, sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
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

  // What produced the failure on screen, so its retry button repeats that and
  // not whatever was pressed last.
  const lastAction = useRef<(() => Promise<Response<unknown>>) | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const status = await sendRequest<{ connected: boolean }>({ type: 'auth:status' });
    const isConnected = status.ok && status.data.connected;
    setConnected(isConnected);

    if (isConnected) {
      const info = await sendRequest<KeyInfo>({ type: 'usage:get' });
      setUsage(info.ok ? info.data : null);
    } else {
      setUsage(null);
    }
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
              <span className={`${MICRO_TYPE} text-connected`}>connected</span>
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
          <div className="flex flex-wrap gap-2">
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
          <p className="text-sm text-base-content/70">
            Authorising creates a key for this extension only — your main key is never shared.
            You can cap its spend and expiry on OpenRouter's screen.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={SOLID}
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
