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

/** Subset of `GET /api/v1/models`. */
export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  /** Price per prompt token, in credits. `0` for `:free` variants. */
  promptPrice: number;
  completionPrice: number;
  /** Free variants carry a 20/min, 50/day cap — the UI has to say so. */
  isFree: boolean;
}
