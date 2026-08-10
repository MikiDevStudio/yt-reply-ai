import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import type { ModelInfo } from '@/lib/openrouter/types';
import {
  MODEL_PRESETS,
  customModel as customModelSetting,
  model as modelSetting,
} from '@/lib/settings';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';

/**
 * Measured, not calculated from the price list.
 *
 * A per-token price says nothing on its own once a model thinks before it
 * answers: the same reply on the balanced model costs $0.0003 with reasoning
 * held down and $0.0041 without. These numbers come from real replies at the
 * default context level.
 *
 * They no longer reconcile with the catalogue, or with each other — see #27.
 * Left as they are here rather than recomputed inside an unrelated feature.
 */
const PRESETS = [
  [MODEL_PRESETS.balanced, 'Balanced', '~3000 replies per $1'],
  [MODEL_PRESETS.cheap, 'Cheaper', '~20000 replies per $1'],
  [MODEL_PRESETS.free, 'Free', '20 requests/min, 50/day'],
] as const;

const PRESET_IDS: readonly string[] = PRESETS.map(([id]) => id);

/**
 * One reply, in tokens: an L0 prompt as the README measures it, and a reply
 * measured with reasoning held to minimal.
 *
 * Stated rather than hidden, because the estimate built on it is arithmetic
 * over someone else's price list and not a measurement of anything.
 */
const REPLY_PROFILE = { promptTokens: 300, completionTokens: 33 };

/** Three curated presets, plus any id the user cares to type. See #13 for a picker. */
export function Models() {
  const [model, setModel] = useSetting(modelSetting);
  const [custom, setCustom] = useSetting(customModelSetting);

  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The catalogue stopped offering the stored model. */
  const [withdrawn, setWithdrawn] = useState<string | null>(null);

  // Adopt the stored id once it arrives, but never overwrite what is being typed.
  useEffect(() => {
    setDraft((current) => (current === null ? (custom?.id ?? '') : current));
  }, [custom]);

  // Re-check the stored model when the page opens. Not for the price: for the
  // model that was withdrawn, which would otherwise surface as a failed reply.
  useEffect(() => {
    const id = custom?.id;
    if (!id) return;

    let cancelled = false;
    void sendRequest<ModelInfo>({ type: 'models:validate', id }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCustom(result.data);
        return;
      }
      // Only the catalogue rejecting the id says anything about the model.
      // Being offline says nothing, and must not read as bad news.
      if (result.kind === 'invalid_request') setWithdrawn(result.message);
    });

    return () => {
      cancelled = true;
    };
    // Keyed on the id alone: refreshing the snapshot writes a new object every
    // time, and depending on that would re-fetch forever.
  }, [custom?.id]);

  const usingCustom = custom !== null && model === custom.id;
  const dirty = (draft ?? '') !== (custom?.id ?? '');

  async function save() {
    const id = (draft ?? '').trim();
    setError(null);
    setWithdrawn(null);

    if (id.length === 0) {
      // Nothing left to point at: leaving `model` on a forgotten id would break
      // generation with no visible cause.
      setCustom(null);
      if (usingCustom) setModel(MODEL_PRESETS.balanced);
      return;
    }

    if (PRESET_IDS.includes(id)) {
      // Two lit radios is a state with no meaning, and the page already has a
      // name for this model.
      setCustom(null);
      setModel(id);
      setDraft('');
      return;
    }

    setBusy(true);
    const result = await sendRequest<ModelInfo>({ type: 'models:validate', id });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    // The catalogue's id, not the typed one: an alias resolves to what the
    // request will actually be routed to.
    setCustom(result.data);
    setModel(result.data.id);
    setDraft(result.data.id);
  }

  return (
    <Section
      title="Model"
      description="Every request goes to your own OpenRouter account, so these prices are what you pay, with no markup from us."
    >
      <div className="flex flex-col gap-2">
        {PRESETS.map(([id, label, hint]) => (
          <label key={id} className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="model"
              className="radio radio-sm"
              checked={model === id}
              disabled={model === null}
              onChange={() => setModel(id)}
            />
            <span className="font-medium">{label}</span>
            <span className="text-base-content/50">{id}</span>
            <span className="ml-auto text-xs text-base-content/50">{hint}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="model"
            className="radio radio-sm"
            checked={usingCustom}
            disabled={custom === null}
            onChange={() => custom && setModel(custom.id)}
          />
          <span className="font-medium">Custom</span>
          <span className="text-base-content/50">
            {custom ? custom.name : 'Any model id from openrouter.ai'}
          </span>
        </label>

        <div className="flex gap-2 pl-8">
          <input
            type="text"
            className="input input-sm flex-1 font-mono text-sm"
            placeholder="anthropic/claude-sonnet-5"
            value={draft ?? ''}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? (
              <>
                <span className="loading loading-dots loading-xs" />
                Checking
              </>
            ) : (
              'Check and save'
            )}
          </button>
        </div>

        <div className="pl-8">
          {error ? (
            <div role="alert" className="alert alert-error alert-soft text-sm">
              {error}
            </div>
          ) : withdrawn ? (
            <div role="alert" className="alert alert-warning alert-soft text-sm">
              {withdrawn} — pick another model before the next reply.
            </div>
          ) : dirty ? (
            <p className="text-xs text-base-content/50">
              Unsaved. The model in use does not change until this id checks out.
            </p>
          ) : (
            custom && <p className="text-xs text-base-content/50">{describe(custom)}</p>
          )}
        </div>
      </div>
    </Section>
  );
}

/** What the catalogue says, and what it cannot say. */
function describe(info: ModelInfo): string {
  const context = `${contextLabel(info.contextLength)} context`;

  if (info.isFree) {
    // "Infinite replies per $1" is a joke, not a figure. The cap is the real
    // limit on a free variant, so quote that instead.
    return `${context} · free variant — 20 requests/min, 50/day.`;
  }

  const prices = `$${perMillion(info.promptPrice)} / $${perMillion(info.completionPrice)} per M tokens`;

  if (!info.acceptsReasoning) {
    return (
      `${context} · ${prices}. No per-reply estimate: this model does not take a reasoning ` +
      'setting, so it thinks for as long as it likes — measured elsewhere at 396 completion ' +
      'tokens against 33.'
    );
  }

  const perReply =
    REPLY_PROFILE.promptTokens * info.promptPrice +
    REPLY_PROFILE.completionTokens * info.completionPrice;

  const perDollar = Math.round(1 / perReply).toLocaleString('en-US');

  return (
    `≈ ${perDollar} replies per $1 (estimated at ~${REPLY_PROFILE.promptTokens} prompt + ` +
    `~${REPLY_PROFILE.completionTokens} reply tokens, not measured) · ${prices} · ${context}`
  );
}

function perMillion(pricePerToken: number): string {
  const price = pricePerToken * 1_000_000;
  // Sub-cent models exist and rounding them to $0.00 would read as free.
  return price < 0.01 && price > 0 ? price.toFixed(4) : price.toFixed(2);
}

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return `${tokens} token`;
}
