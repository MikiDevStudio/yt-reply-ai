import { MODEL_PRESETS, model as modelSetting } from '@/lib/settings';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';

/**
 * Measured, not calculated from the price list.
 *
 * A per-token price says nothing on its own once a model thinks before it
 * answers: the same reply on the balanced model costs $0.0003 with reasoning
 * held down and $0.0041 without. These numbers come from real replies at the
 * default context level.
 */
const PRESETS = [
  [MODEL_PRESETS.balanced, 'Balanced', '~3000 replies per $1'],
  [MODEL_PRESETS.cheap, 'Cheaper', '~20000 replies per $1'],
  [MODEL_PRESETS.free, 'Free', '20 requests/min, 50/day'],
] as const;

/** Three curated presets. The live catalogue picker is #13. */
export function Models() {
  const [model, setModel] = useSetting(modelSetting);

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
    </Section>
  );
}
