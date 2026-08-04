import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
import { MODEL_PRESETS, model as modelSetting } from '@/lib/settings';

/**
 * Minimal settings page: connect an account and choose a model.
 *
 * Enough to use the extension end to end. The full multi-section shell with
 * routing, soul profiles and a live model picker is #9, #10 and #13.
 */
export function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<KeyInfo | null>(null);
  const [model, setModel] = useState<string>(MODEL_PRESETS.balanced);
  const [manualKey, setManualKey] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void modelSetting.getValue().then(setModel);
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 bg-base-100 p-8 text-base-content">
      <header>
        <h1 className="text-xl font-semibold">Reply AI</h1>
        <p className="text-sm text-base-content/60">
          Replies to YouTube comments, in your own voice.
        </p>
      </header>

      <section className="card card-border bg-base-100">
        <div className="card-body gap-4">
          <h2 className="card-title text-base">OpenRouter account</h2>

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
                Authorising creates a key for this extension only — your main key is never
                shared. You can cap its spend and expiry on OpenRouter's screen.
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
        </div>
      </section>

      <section className="card card-border bg-base-100">
        <div className="card-body gap-4">
          <h2 className="card-title text-base">Model</h2>

          <div className="flex flex-col gap-2">
            {(
              [
                [MODEL_PRESETS.balanced, 'Balanced', '~1000 replies per $1'],
                [MODEL_PRESETS.cheap, 'Cheaper', '~5000 replies per $1'],
                [MODEL_PRESETS.free, 'Free', '20 requests/min, 50/day'],
              ] as const
            ).map(([id, label, hint]) => (
              <label key={id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="model"
                  className="radio radio-sm"
                  checked={model === id}
                  onChange={() => {
                    setModel(id);
                    void modelSetting.setValue(id);
                  }}
                />
                <span className="font-medium">{label}</span>
                <span className="text-base-content/50">{id}</span>
                <span className="ml-auto text-xs text-base-content/50">{hint}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
