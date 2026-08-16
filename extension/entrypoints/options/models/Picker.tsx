import { Check, ChevronDown, RotateCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sendRequest } from '@/lib/messaging';
import type { ModelInfo } from '@/lib/openrouter/types';
import {
  describe,
  fetchedLabel,
  PRESET_IDS,
  PRESETS,
  presetLabel,
  priceHint,
  useCatalogue,
} from './catalogue';

/**
 * How many catalogue rows reach the DOM before the list asks for a search.
 *
 * The catalogue is 400+ entries and gets scrolled maybe three times in the life
 * of an install. Rendering all of it — or pulling in a virtualiser to avoid
 * rendering all of it — buys nothing the search box does not already buy.
 */
const RENDER_CAP = 50;

interface PresetRow {
  kind: 'preset';
  id: string;
  label: string;
  /** Null until the catalogue arrives: presets are priced from it like the rest. */
  info: ModelInfo | null;
}

interface ModelRow {
  kind: 'model';
  info: ModelInfo;
}

/** An id the catalogue does not list — a private or preview model. */
interface UseAnywayRow {
  kind: 'use-anyway';
  id: string;
}

type Row = PresetRow | ModelRow | UseAnywayRow;

interface PickerProps {
  /** The id in use, or null until settings load. */
  selected: string | null;
  /** What the catalogue said about it, when it is not one of ours. */
  custom: ModelInfo | null;
  onPreset: (id: string) => void;
  onModel: (info: ModelInfo) => void;
}

export function Picker({ selected, custom, onPreset, onModel }: PickerProps) {
  const { snapshot, loading, error, load, refresh } = useCatalogue();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  /** An id being checked against the catalogue, from the `use-anyway` row. */
  const [checking, setChecking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const models = snapshot?.models ?? [];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (id: string, name: string) =>
      needle.length === 0 ||
      id.toLowerCase().includes(needle) ||
      name.toLowerCase().includes(needle);

    const known = new Map(models.map((model) => [model.id, model]));

    const presets = PRESETS.filter((preset) => matches(preset.id, preset.label)).map(
      (preset): PresetRow => ({
        kind: 'preset',
        id: preset.id,
        label: preset.label,
        // Priced from the live catalogue like every other row, or not priced at
        // all until it arrives.
        info: known.get(preset.id) ?? null,
      }),
    );

    const rest = models
      .filter((model) => !PRESET_IDS.includes(model.id) && matches(model.id, model.name))
      .map((model): ModelRow => ({ kind: 'model', info: model }));

    return { presets, rest };
  }, [models, query]);

  const shown = rows.rest.slice(0, RENDER_CAP);
  const hidden = rows.rest.length - shown.length;

  // A slash means an id was pasted rather than a name typed. Nothing matching it
  // means the catalogue does not list it — which private and preview models are
  // not, and which is the case the hand-typed field used to exist for.
  const typedId = query.trim();
  const useAnyway =
    rows.rest.length === 0 && rows.presets.length === 0 && typedId.includes('/') ? typedId : null;

  const options: Row[] = [
    ...rows.presets,
    ...shown,
    ...(useAnyway ? [{ kind: 'use-anyway' as const, id: useAnyway }] : []),
  ];

  // Reopening on a stale highlight would select whatever the last search left
  // under the cursor.
  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keyboard navigation is useless if the highlighted row is off-screen.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  function close() {
    setOpen(false);
    setQuery('');
    setPickError(null);
  }

  async function choose(row: Row) {
    setPickError(null);

    if (row.kind === 'preset') {
      onPreset(row.id);
      close();
      return;
    }

    if (row.kind === 'model') {
      onModel(row.info);
      close();
      return;
    }

    // The catalogue's id, not the typed one: an alias resolves to whatever the
    // request will actually be routed to.
    setChecking(true);
    const result = await sendRequest<ModelInfo>({ type: 'models:validate', id: row.id });
    setChecking(false);

    if (!result.ok) {
      setPickError(result.message);
      return;
    }

    onModel(result.data);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => (current + step + options.length) % options.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const row = options[highlight];
      if (row) void choose(row);
    }
  }

  const label = selected === null ? 'Loading…' : (presetLabel(selected) ?? custom?.name ?? selected);

  const selectedInfo =
    custom && custom.id === selected ? custom : models.find((model) => model.id === selected);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        className="btn btn-block justify-start font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={selected === null}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="font-medium">{label}</span>
        <span className="truncate text-base-content/50">{selected}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-base-content/50">
          {selectedInfo && priceHint(selectedInfo)}
          <ChevronDown className="size-4" />
        </span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg">
          <label className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
            <Search className="size-4 shrink-0 text-base-content/50" />
            <input
              ref={search}
              type="text"
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search by name, or paste a model id"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </label>

          <div ref={list} role="listbox" className="max-h-80 overflow-y-auto">
            {rows.presets.length > 0 && (
              <>
                <Heading>Recommended</Heading>
                {rows.presets.map((row, index) => (
                  <Option
                    key={row.id}
                    index={index}
                    highlighted={highlight === index}
                    selected={row.id === selected}
                    onPick={() => void choose(row)}
                    onHover={() => setHighlight(index)}
                  >
                    <span className="font-medium">{row.label}</span>
                    <span className="truncate text-base-content/50">{row.id}</span>
                    <span className="ml-auto shrink-0 text-xs text-base-content/50">
                      {row.info && priceHint(row.info)}
                    </span>
                  </Option>
                ))}
              </>
            )}

            <Heading>
              All models
              {snapshot && (
                <span className="ml-auto flex items-center gap-2 font-normal normal-case">
                  <span>from {fetchedLabel(snapshot.fetchedAt)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={loading}
                    onClick={() => refresh()}
                  >
                    <RotateCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </span>
              )}
            </Heading>

            {loading && !snapshot && (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-base-content/50">
                <span className="loading loading-dots loading-xs" />
                Fetching the catalogue…
              </p>
            )}

            {error && !snapshot && (
              <div className="px-3 py-3">
                <div role="alert" className="alert alert-error alert-soft text-sm">
                  <span>{error}</span>
                  <button type="button" className="btn btn-xs" onClick={() => refresh()}>
                    Retry
                  </button>
                </div>
                <p className="pt-2 text-xs text-base-content/50">
                  The models above still work — they need no catalogue.
                </p>
              </div>
            )}

            {shown.map((row, offset) => {
              const index = rows.presets.length + offset;

              return (
                <Option
                  key={row.info.id}
                  index={index}
                  highlighted={highlight === index}
                  selected={row.info.id === selected}
                  onPick={() => void choose(row)}
                  onHover={() => setHighlight(index)}
                >
                  <span className="truncate">{row.info.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-base-content/50">
                    {priceHint(row.info)}
                  </span>
                </Option>
              );
            })}

            {hidden > 0 && (
              <p className="px-3 py-2 text-xs text-base-content/50">
                +{hidden.toLocaleString('en-US')} more — type to search
              </p>
            )}

            {useAnyway && (
              <Option
                index={options.length - 1}
                highlighted={highlight === options.length - 1}
                selected={false}
                onPick={() => void choose({ kind: 'use-anyway', id: useAnyway })}
                onHover={() => setHighlight(options.length - 1)}
              >
                <span>
                  Use anyway: <span className="font-mono">{useAnyway}</span>
                </span>
                {checking && <span className="loading loading-dots loading-xs ml-auto" />}
              </Option>
            )}

            {snapshot && !useAnyway && options.length === 0 && (
              <p className="px-3 py-4 text-sm text-base-content/50">
                Nothing matches “{query.trim()}”.
              </p>
            )}
          </div>

          {pickError && (
            <p role="alert" className="border-t border-base-300 px-3 py-2 text-sm text-error">
              {pickError}
            </p>
          )}
        </div>
      )}

      {selectedInfo && <p className="pt-2 text-xs text-base-content/50">{describe(selectedInfo)}</p>}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-base-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">
      {children}
    </div>
  );
}

interface OptionProps {
  index: number;
  highlighted: boolean;
  selected: boolean;
  onPick: () => void;
  onHover: () => void;
  children: React.ReactNode;
}

function Option({ index, highlighted, selected, onPick, onHover, children }: OptionProps) {
  return (
    <button
      type="button"
      data-index={index}
      role="option"
      aria-selected={selected}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
        highlighted ? 'bg-base-200' : ''
      }`}
      onClick={onPick}
      onMouseMove={onHover}
    >
      <Check className={`size-4 shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`} />
      {children}
    </button>
  );
}
