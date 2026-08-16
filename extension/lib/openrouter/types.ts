export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Tokens served from the provider's prompt cache, when reported. */
  cachedTokens?: number;
  /** Cost in credits, as calculated by OpenRouter. */
  cost?: number;
}

export interface CompletionResult {
  text: string;
  usage?: TokenUsage;
  /** Normalised: 'stop', 'length', 'content_filter', 'error', ... */
  finishReason?: string;
  /** OpenRouter's id for this generation, usable to query stats later. */
  generationId?: string;
}

/** Subset of `GET /api/v1/key` that we actually use. */
export interface KeyInfo {
  label?: string;
  /** Credits spent by this key, all time. */
  usage: number;
  /** Credits left before the key's own cap. Null means uncapped. */
  limitRemaining: number | null;
  /** True when the account has never bought credits — implies free-tier limits. */
  isFreeTier: boolean;
}

/** The catalogue as the picker sees it: the models, and when they were fetched. */
export interface ModelCatalogue {
  models: ModelInfo[];
  /** Epoch ms. Shown to the user; never used to expire anything. */
  fetchedAt: number;
}

/** Subset of `GET /api/v1/models` and `GET /api/v1/model/{id}`, which agree. */
export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  /** Price per prompt token, in credits. `0` for `:free` variants. */
  promptPrice: number;
  completionPrice: number;
  /** Free variants carry a 20/min, 50/day cap — the UI has to say so. */
  isFree: boolean;
  /**
   * Whether `supported_parameters` lists `reasoning`.
   *
   * Decides whether a cost estimate means anything: the same reply measured 33
   * completion tokens with thinking held to minimal and 396 with it left alone.
   * A model that will not take the setting cannot be quoted a per-reply price.
   */
  acceptsReasoning: boolean;
}
