import { useCallback, useRef, useState } from 'react';
import type { FailureFacts } from '@/lib/failure';
import { failureOf, sendRequest } from '@/lib/messaging';
import type { ModelCatalogue, ModelInfo } from '@/lib/openrouter/types';
import { MODEL_PRESETS } from '@/lib/models';

/** Our three, in the order the picker lists them. */
export const PRESETS = [
  { id: MODEL_PRESETS.balanced, label: 'Balanced' },
  { id: MODEL_PRESETS.cheap, label: 'Cheaper' },
  { id: MODEL_PRESETS.free, label: 'Free' },
] as const;

export const PRESET_IDS: readonly string[] = PRESETS.map((preset) => preset.id);

export function presetLabel(id: string): string | null {
  return PRESETS.find((preset) => preset.id === id)?.label ?? null;
}

/**
 * One reply, in tokens: an L0 prompt as the README measures it, and a reply
 * measured with reasoning held to minimal.
 *
 * Stated rather than hidden, because everything built on it is arithmetic over
 * someone else's price list and not a measurement of anything.
 *
 * Every row is priced through this one profile — presets included. The hand-
 * written labels the presets used to carry ("~3000 replies per $1") were
 * measured under conditions that differed from row to row and no longer
 * reconciled with the catalogue or with each other (#27).
 */
const REPLY_PROFILE = { promptTokens: 300, completionTokens: 33 };

/**
 * Replies per dollar, or null when no honest number exists.
 *
 * A per-token price says nothing on its own once a model thinks before it
 * answers: the same reply measured 33 completion tokens with reasoning held to
 * minimal and 396 with it left alone. A model that will not take the setting
 * cannot be quoted a per-reply price at all.
 */
export function repliesPerDollar(info: ModelInfo): number | null {
  if (info.isFree || !info.acceptsReasoning) return null;

  const perReply =
    REPLY_PROFILE.promptTokens * info.promptPrice +
    REPLY_PROFILE.completionTokens * info.completionPrice;

  return perReply > 0 ? Math.round(1 / perReply) : null;
}

/** The right-hand column of a row in the list. Fits on one line or is dropped. */
export function priceHint(info: ModelInfo): string {
  // "Infinite replies per $1" is a joke, not a figure. The cap is the real
  // limit on a free variant, so quote that instead. The per-minute one is the
  // only figure that holds for every account — the daily cap is 50 or 1,000
  // depending on whether credits were ever bought.
  if (info.isFree) return 'free · 20 req/min';

  const perDollar = repliesPerDollar(info);
  if (perDollar !== null) return `≈${perDollar.toLocaleString('en-US')} replies per $1`;

  return `$${perMillion(info.promptPrice)} / $${perMillion(info.completionPrice)} per M`;
}

/** What the catalogue says about the model in use, and what it cannot say. */
export function describe(info: ModelInfo): string {
  const context = `${contextLabel(info.contextLength)} context`;

  if (info.isFree) {
    return (
      `${context} · free variant — 20 requests a minute, and 50 a day until the account has ` +
      'bought $10 of credits, 1,000 after that.'
    );
  }

  const prices = `$${perMillion(info.promptPrice)} / $${perMillion(info.completionPrice)} per M tokens`;

  if (!info.acceptsReasoning) {
    return (
      `${context} · ${prices}. No per-reply estimate: this model does not take a reasoning ` +
      'setting, so it thinks for as long as it likes — measured elsewhere at 396 completion ' +
      'tokens against 33.'
    );
  }

  const perDollar = repliesPerDollar(info)?.toLocaleString('en-US') ?? '—';

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

export interface Catalogue {
  snapshot: ModelCatalogue | null;
  loading: boolean;
  /** Why the last fetch failed, in the shape `FailureNotice` renders. */
  failure: FailureFacts | null;
  /** Fetch once, the first time the list is opened. Later calls do nothing. */
  load: () => void;
  /** Go and ask again, on the user's say-so. */
  refresh: () => void;
}

/**
 * The model catalogue, fetched lazily.
 *
 * Nothing is requested while the picker is closed: the settings page is opened
 * to change a soul profile far more often than to change a model, and the list
 * is 400+ entries. The background worker holds the cache, so opening the picker
 * a second time costs nothing at all.
 */
export function useCatalogue(): Catalogue {
  const [snapshot, setSnapshot] = useState<ModelCatalogue | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<FailureFacts | null>(null);
  const asked = useRef(false);

  const fetchList = useCallback(async (refresh: boolean) => {
    asked.current = true;
    setLoading(true);
    setFailure(null);

    const result = await sendRequest<ModelCatalogue>({ type: 'models:list', refresh });

    setLoading(false);
    if (result.ok) setSnapshot(result.data);
    else setFailure(failureOf(result));
  }, []);

  const load = useCallback(() => {
    if (asked.current) return;
    void fetchList(false);
  }, [fetchList]);

  const refresh = useCallback(() => void fetchList(true), [fetchList]);

  return { snapshot, loading, failure, load, refresh };
}

/** "16 Aug", the way a person writes a date they only need to recognise. */
export function fetchedLabel(fetchedAt: number): string {
  return new Date(fetchedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
