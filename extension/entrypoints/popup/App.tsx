import { useEffect, useState } from 'react';
import { CoffeeMark } from '@/components/CoffeeMark';
import { FailureNotice } from '@/components/FailureNotice';
import { GHOST, MICRO, MICRO_TYPE, SOLID } from '@/components/ui';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, sendRequest } from '@/lib/messaging';
import type { KeyInfo } from '@/lib/openrouter/types';
import { waitlistUrl } from '@/lib/pro';
import { enabled as enabledSetting, model as modelSetting, soul as soulSetting } from '@/lib/settings';
import { SUPPORT_URL } from '@/lib/support';
import { useQuota } from '@/lib/use-quota';
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
  const [on, setOn] = useSetting(enabledSetting);
  const quota = useQuota();

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

      if (isConnected) await loadUsage();
    })();
  }, []);

  const openSettings = (section: string) => {
    // `openOptionsPage` cannot target a section, so the URL is built by hand.
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
    window.close();
  };

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
          Connect an OpenRouter account to start generating replies.
        </p>
      )}

      {connected && (
        <dl className="flex flex-col gap-2 text-sm">
          {/* Ours, and first: it is the number that decides whether the next
              reply happens at all. Everything below it belongs to OpenRouter. */}
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60" title="Resets at midnight">
              Replies today
            </dt>
            {/* Counts, credits and model ids are mono: they are numbers and
                machine names, and the face says so (brand.md §2). */}
            <dd className="font-mono">{quota ? `${quota.used} of ${quota.limit}` : '…'}</dd>
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

      <button
        type="button"
        className={`${SOLID} justify-center`}
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

      {/* The curiosity entry point, tagged apart from the one behind the daily
          cap: a click from here and a click from a blocked reply are different
          claims and have to stay different numbers (#31). */}
      <a
        className="link text-xs text-base-content/50"
        href={waitlistUrl('settings')}
        target="_blank"
        rel="noreferrer"
      >
        What Pro would add, and how to ask for it
      </a>

      {/* Under Pro on purpose: one of these two asks for money for something
          that does not exist yet, and the other asks for nothing at all. */}
      <a
        className="flex items-center gap-1.5 text-xs text-base-content/50 transition-colors duration-150 hover:text-base-content"
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
      >
        <CoffeeMark className="h-3.5" />
        Buy me a coffee
      </a>
    </div>
  );
}
