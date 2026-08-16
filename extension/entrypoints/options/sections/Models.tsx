import { useEffect, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import type { ModelInfo } from '@/lib/openrouter/types';
import { customModel as customModelSetting, model as modelSetting } from '@/lib/settings';
import { useSetting } from '@/lib/use-setting';
import { PRESET_IDS } from '../models/catalogue';
import { Picker } from '../models/Picker';
import { Section } from '../Section';

/** Our three, plus the live catalogue behind one searchable list. */
export function Models() {
  const [model, setModel] = useSetting(modelSetting);
  const [custom, setCustom] = useSetting(customModelSetting);

  /** The catalogue stopped offering the stored model. */
  const [withdrawn, setWithdrawn] = useState<string | null>(null);

  // Re-check the stored model when the page opens. Not for the price: for the
  // model that was withdrawn, which would otherwise surface as a failed reply.
  // This is also why the catalogue is never refreshed on a timer — the check
  // that matters is this one, and it is one request rather than the whole list.
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

  function pickPreset(id: string) {
    setWithdrawn(null);
    // A preset already has a name and a price on the row. Keeping a second
    // record of the same model in `custom` would only give it two.
    setCustom(null);
    setModel(id);
  }

  function pickModel(info: ModelInfo) {
    setWithdrawn(null);
    // Reachable by pasting a preset's own id into the search box.
    if (PRESET_IDS.includes(info.id)) {
      pickPreset(info.id);
      return;
    }

    setCustom(info);
    setModel(info.id);
  }

  return (
    <Section
      title="Model"
      description="Every request goes to your own OpenRouter account, so these prices are what you pay, with no markup from us."
    >
      <Picker selected={model} custom={custom} onPreset={pickPreset} onModel={pickModel} />

      {withdrawn && (
        <div role="alert" className="alert alert-warning alert-soft text-sm">
          {withdrawn} — pick another model before the next reply.
        </div>
      )}
    </Section>
  );
}
