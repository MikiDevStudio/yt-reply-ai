import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
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
  const [error, setError] = useState<string | null>(null);

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

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.message ?? 'Something went wrong');
    await refresh();
    setBusy(false);
  }

  return (
    <Section title="OpenRouter account">
      {connected === null ? (
        <span className="loading loading-dots loading-sm" />
      ) : connected ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="badge badge-success badge-soft">Connected</span>
            {usage && (
              <span className="text-base-content/60">
                {usage.usage.toFixed(3)} credits used
                {usage.limitRemaining !== null &&
                  ` · ${usage.limitRemaining.toFixed(3)} left on this key`}
                {usage.isFreeTier && ' · free tier (50 requests/day)'}
              </span>
            )}
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-sm"
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

          <div className="card-actions items-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => run(() => sendRequest({ type: 'auth:connect' }))}
            >
              Connect OpenRouter
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowManual((value) => !value)}
            >
              Already have a key?
            </button>
          </div>

          {showManual && (
            <div className="flex gap-2">
              <input
                type="password"
                className="input input-sm flex-1"
                placeholder="sk-or-v1-…"
                value={manualKey}
                onChange={(event) => setManualKey(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
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

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {error}
        </div>
      )}
    </Section>
  );
}
