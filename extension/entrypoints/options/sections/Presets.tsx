import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { FIELD, GHOST, ICON, MICRO, SECONDARY } from '@/components/ui';
import {
  AUTO,
  BUILT_IN,
  clamp,
  LIMITS,
  type Preset,
  type PresetOverlay,
  newPresetId,
  readPresets,
} from '@/lib/presets';
import { presets as presetsSetting } from '@/lib/settings';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';

/**
 * The editor for the tone row above the reply box (#6).
 *
 * ## Why the copy on this page works as hard as the controls
 *
 * A free text box next to the words "reply preset" is an invitation to write a
 * second soul profile into it — "I'm a woodworker, be friendly, mention my
 * Etsy" — and then two parts of the prompt describe the same thing and the
 * model follows whichever sits lower. So the description says what a preset is
 * *for*, the placeholder is a tone instruction rather than an empty box, and
 * the cap is small enough that a profile does not fit. See `lib/presets.ts` for
 * the measurements behind each of those.
 *
 * ## Writes are committed on blur, not on keystroke
 *
 * The row lives in `chrome.storage.sync`, which allows 120 writes a minute and
 * 1,800 an hour. A controlled input that saved as you typed would spend those
 * on a single sentence and start failing silently. Each field therefore edits a
 * local draft and commits when it loses focus; structural changes — hide,
 * reorder, add, delete — are one action each and save immediately.
 */
export function Presets() {
  const [overlay, setOverlay] = useSetting(presetsSetting);
  const rows = readPresets(overlay);

  /**
   * Text being typed, by preset id, until the field is left.
   *
   * An entry exists only while a field is dirty; everything else reads through
   * to storage, so a change made on another machine still lands on this page
   * rather than being held off by a stale copy.
   */
  const [draft, setDraft] = useState<Record<string, { name: string; text: string }>>({});

  /** Write an overlay, collapsing an untouched one back to `null`. */
  function save(next: PresetOverlay) {
    const pruned: PresetOverlay = {};
    if (next.order?.length) pruned.order = next.order;
    if (next.hidden?.length) pruned.hidden = next.hidden;
    if (next.edits && Object.keys(next.edits).length > 0) pruned.edits = next.edits;
    if (next.custom?.length) pruned.custom = next.custom;

    setOverlay(Object.keys(pruned).length > 0 ? pruned : null);
  }

  /**
   * Store what a field was left holding.
   *
   * A built-in keeps only the halves that differ from the original, so
   * restoring is deleting a key and a preset edited back to its shipped wording
   * stops counting as edited. A blank name reverts rather than saving: a chip
   * with no label is a chip nobody can press.
   */
  function commit(preset: Preset, edited: { name: string; text: string }) {
    setDraft(({ [preset.id]: _dropped, ...rest }) => rest);

    const name = clamp(edited.name, LIMITS.name) || preset.name;
    const text = clamp(edited.text, LIMITS.text);
    if (name === preset.name && text === preset.text) return;

    if (!preset.builtIn) {
      const custom = (overlay?.custom ?? []).map((entry) =>
        entry.id === preset.id ? { ...entry, name, text } : entry,
      );
      save({ ...overlay, custom });
      return;
    }

    const original = BUILT_IN.find((entry) => entry.id === preset.id);
    const changed: { name?: string; text?: string } = {};
    if (name !== original?.name) changed.name = name;
    if (text !== original?.text) changed.text = text;

    const edits = { ...overlay?.edits };
    if (Object.keys(changed).length > 0) edits[preset.id] = changed;
    else delete edits[preset.id];

    save({ ...overlay, edits });
  }

  /** Put a built-in back to the wording it shipped with. */
  function restore(id: string) {
    setDraft(({ [id]: _dropped, ...rest }) => rest);
    const edits = { ...overlay?.edits };
    delete edits[id];
    save({ ...overlay, edits });
  }

  /** Hiding is also what deleting a built-in means — see #6. */
  function toggleHidden(id: string) {
    const hidden = overlay?.hidden ?? [];
    save({
      ...overlay,
      hidden: hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id],
    });
  }

  function add() {
    save({
      ...overlay,
      custom: [...(overlay?.custom ?? []), { id: newPresetId(), name: 'new', text: '' }],
    });
  }

  /** Only a custom preset actually leaves; its traces go with it. */
  function remove(id: string) {
    save({
      ...overlay,
      custom: (overlay?.custom ?? []).filter((entry) => entry.id !== id),
      hidden: (overlay?.hidden ?? []).filter((entry) => entry !== id),
      order: (overlay?.order ?? []).filter((entry) => entry !== id),
    });
  }

  /**
   * Move one preset a place up or down.
   *
   * The whole visible order is written out rather than a delta, because the
   * order stored before this may have been partial — `sortByOrder` puts unnamed
   * ids after the named ones, and swapping two of those needs both to be named.
   */
  function move(index: number, by: -1 | 1) {
    const next = [...rows];
    const moved = next[index];
    const displaced = next[index + by];
    if (!moved || !displaced) return;

    next[index] = displaced;
    next[index + by] = moved;
    save({ ...overlay, order: next.map((preset) => preset.id) });
  }

  return (
    <Section
      n={1}
      title="Reply presets"
      description="The row above the reply box. A preset says how loud to be on one reply; the soul profile says who you are — keep instructions here to tone, or the two will contradict each other and the model will follow whichever it read last."
    >
      <div className="flex flex-col">
        {rows.map((preset, index) => {
          const value = draft[preset.id] ?? { name: preset.name, text: preset.text };
          const locked = preset.id === AUTO;

          return (
            <div
              key={preset.id}
              className={`flex items-start gap-2 border-b border-line py-3 first:pt-0 last:border-b-0 ${
                preset.hidden ? 'opacity-45' : ''
              }`}
            >
              {/* Reorder. Buttons rather than dragging: same result, works from
                  the keyboard, and costs no library. */}
              <div className="flex flex-col">
                <button
                  type="button"
                  className={`${ICON} size-5`}
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={`${ICON} size-5`}
                  title="Move down"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {locked ? (
                  // `auto` is the row's off switch, not a preset. It has no text
                  // and must never be given any: the line it used to send said
                  // to match the tone of the comment, which is what the model
                  // does when nothing is said at all.
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium">{preset.name}</span>
                    <span className="text-[12px] text-base-content/50">
                      Adds nothing to the prompt. This is the row&apos;s off switch, so it cannot be
                      edited or hidden.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        className={`${FIELD} max-w-[180px]`}
                        value={value.name}
                        maxLength={LIMITS.name}
                        aria-label="Preset name"
                        onChange={(event) =>
                          setDraft({ ...draft, [preset.id]: { ...value, name: event.target.value } })
                        }
                        onBlur={() => commit(preset, value)}
                      />
                      {preset.edited && (
                        <button
                          type="button"
                          className={GHOST}
                          title="Put this preset back to the wording it shipped with"
                          onClick={() => restore(preset.id)}
                        >
                          <RotateCcw className="size-3.5" />
                          Restore
                        </button>
                      )}
                    </div>

                    <textarea
                      className={`${FIELD} min-h-[52px] resize-none`}
                      value={value.text}
                      maxLength={LIMITS.text}
                      placeholder="Be warm and welcoming."
                      aria-label="Tone instruction"
                      onChange={(event) =>
                        setDraft({ ...draft, [preset.id]: { ...value, text: event.target.value } })
                      }
                      onBlur={() => commit(preset, value)}
                    />

                    {/* The count is not decoration: this sentence is sent, and
                        billed, on every reply the preset is used for. */}
                    <span className={`${MICRO} self-end`}>
                      {value.text.length}/{LIMITS.text}
                    </span>
                  </>
                )}
              </div>

              {!locked && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    className={`${ICON} size-6`}
                    title={preset.hidden ? 'Show in the row' : 'Hide from the row'}
                    onClick={() => toggleHidden(preset.id)}
                  >
                    {preset.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  {!preset.builtIn && (
                    <button
                      type="button"
                      className={`${ICON} size-6`}
                      title="Delete this preset"
                      onClick={() => remove(preset.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={SECONDARY}
          disabled={rows.length >= LIMITS.presets}
          onClick={add}
        >
          <Plus className="size-3.5" />
          Add a preset
        </button>
        <span className={MICRO}>
          {rows.length}/{LIMITS.presets}
        </span>
      </div>

      {/* Measured, not guessed: every rule added during the prompt work was
          followed to the point of distorting something else — "speak from
          yourself" produced first-person in 89% of replies against 31% for real
          creators. A preset is obeyed the same way. */}
      <p className="text-[12px] leading-[1.6] text-base-content/50">
        Whatever a preset says, the model does — every time, to the letter. &ldquo;Be funny&rdquo;
        makes every reply a joke, including the ones answering a complaint. One short sentence
        moves the output more reliably than a paragraph, and costs less to send.
      </p>

      {/* Built-ins are hidden rather than deleted, so the five can always come
          back and the row can never be emptied down to nothing. */}
      <p className="text-[12px] leading-[1.6] text-base-content/50">
        Hidden presets stay here and keep their wording — hiding is how a built-in is removed from
        the row. The row travels with your Chrome profile to your other machines.
      </p>
    </Section>
  );
}
