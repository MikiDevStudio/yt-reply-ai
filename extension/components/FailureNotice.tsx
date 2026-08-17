import { type FailureFacts, describeFailure } from '@/lib/failure';
import { sendRequest } from '@/lib/messaging';
import { MODEL_PRESETS } from '@/lib/models';
import { model as modelSetting } from '@/lib/settings';
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
  // Cancelling is a decision, not a failure. Guarded here as well as at every
  // caller, so a missed check upstream cannot put "Cancelled" in a red box.
  if (facts.kind === 'aborted') return null;

  const failure = describeFailure(facts);
  const actions = failure.actions.filter(
    (action) => !(action.kind === 'options' && action.section === at),
  );

  async function useFreeModel() {
    await modelSetting.setValue(MODEL_PRESETS.free);
    onRetry?.();
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

  // A cap that has been reached is not a fault, and red would say it was. See
  // the `tone` note in `lib/failure.ts`.
  const notice = failure.tone === 'notice';
  const frame = notice ? 'border-warning/25 bg-warning/10' : 'border-error/25 bg-error/10';

  return (
    // Built from utilities rather than daisyUI's `.alert`, which is a grid with
    // `grid-auto-flow: column` and an auto-sized track: it laid the title and
    // the explanation out as columns — "…rejected the keyIt was revoked…" — and
    // grew past the 420px popover until the button hung off the edge. A card
    // this shape is three utilities; fighting the component was more.
    <div
      role="alert"
      className={`flex w-full min-w-0 flex-col items-start gap-2 border p-3 text-left text-[13px] ${frame} ${className}`}
    >
      <span className={`font-medium ${notice ? 'text-warning' : 'text-error'}`}>
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
