import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
import { model as modelSetting } from '@/lib/settings';

/**
 * Toolbar popup: status at a glance, and a way into the settings.
 *
 * Deliberately thin. Anything that needs room — soul profiles, the model
 * picker, generation options — lives on the options page, which opens in a full
 * tab rather than this 320px box.
 */
export function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<KeyInfo | null>(null);
  const [model, setModel] = useState('');

  useEffect(() => {
    void (async () => {
      const status = await sendRequest<{ connected: boolean }>({ type: 'auth:status' });
      const isConnected = status.ok && status.data.connected;
      setConnected(isConnected);

      setModel(await modelSetting.getValue());

      if (isConnected) {
        const info = await sendRequest<KeyInfo>({ type: 'usage:get' });
        if (info.ok) setUsage(info.data);
      }
    })();
  }, []);

  const openSettings = () => {
    void browser.runtime.openOptionsPage();
    window.close();
  };

  return (
    <div className="flex w-80 flex-col gap-4 bg-base-100 p-4 text-base-content">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Reply AI</span>
        {connected === null ? (
          <span className="loading loading-dots loading-xs" />
        ) : connected ? (
          <span className="badge badge-success badge-soft badge-sm">Connected</span>
        ) : (
          <span className="badge badge-warning badge-soft badge-sm">Not connected</span>
        )}
      </header>

      {connected === false && (
        <p className="text-sm text-base-content/70">
          Connect an OpenRouter account to start generating replies.
        </p>
      )}

      {connected && (
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Model</dt>
            <dd className="truncate text-right font-medium">{model}</dd>
          </div>
          {usage && (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-base-content/60">Spent</dt>
                <dd className="font-medium">{usage.usage.toFixed(3)} credits</dd>
              </div>
              {usage.limitRemaining !== null && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-base-content/60">Left on this key</dt>
                  <dd className="font-medium">{usage.limitRemaining.toFixed(3)}</dd>
                </div>
              )}
              {usage.isFreeTier && (
                <p className="text-xs text-base-content/50">
                  Free tier — 20 requests per minute, 50 per day.
                </p>
              )}
            </>
          )}
        </dl>
      )}

      <button type="button" className="btn btn-primary btn-sm" onClick={openSettings}>
        {connected ? 'Settings' : 'Connect OpenRouter'}
      </button>

      <p className="text-xs text-base-content/50">
        Open a YouTube video and press <span className="font-medium">AI reply</span> under any
        comment.
      </p>
    </div>
  );
}
