import { OpenRouterError } from './errors';
import type { ChatMessage, CompletionResult, KeyInfo, ModelInfo, TokenUsage } from './types';

export const API_BASE = 'https://openrouter.ai/api/v1';

/**
 * App identity, sent on every request.
 *
 * Besides being polite, these headers list the extension in OpenRouter's public
 * app directory — free distribution we would otherwise have to buy.
 */
const APP_HEADERS = {
  'HTTP-Referer': 'https://github.com/MikiDevStudio/yt-reply-ai',
  'X-Title': 'Reply AI for YouTube',
};

export interface CompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Stream a completion, yielding text deltas and returning the assembled result.
 *
 * Lives in the background service worker: a content script's `fetch` follows the
 * host page's CORS rules and would never reach OpenRouter, and the API key must
 * not be readable from a page we do not control.
 *
 * The worker's 30-second idle timer is not a problem here — an in-flight fetch
 * plus the port traffic carrying deltas back both count as activity.
 */
export async function* streamCompletion(
  options: CompletionOptions,
): AsyncGenerator<string, CompletionResult> {
  const response = await post('/chat/completions', options.apiKey, options.signal, {
    model: options.model,
    messages: options.messages,
    stream: true,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    // Ask for token counts and cost in the final chunk, so callers can show
    // spend without a second round trip.
    usage: { include: true },
  });

  const result: CompletionResult = { text: '' };

  for await (const chunk of readSse(response, options.signal)) {
    // A failure after the first byte arrives as a chunk, not an HTTP status —
    // the headers already said 200. Without this branch the stream would just
    // end early and look like a successful short answer.
    if (chunk.error) {
      throw new OpenRouterError(
        'upstream',
        chunk.error.message ?? 'The model provider failed mid-response',
      );
    }

    result.generationId ??= chunk.id;

    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) result.finishReason = choice.finish_reason;

    const delta = choice?.delta?.content;
    if (delta) {
      result.text += delta;
      yield delta;
    }

    if (chunk.usage) result.usage = normaliseUsage(chunk.usage);
  }

  if (result.text.trim().length === 0) {
    throw new OpenRouterError(
      'empty',
      result.finishReason === 'content_filter'
        ? 'The model refused to answer this comment'
        : 'The model returned nothing',
    );
  }

  return result;
}

/** Read the key's own usage and remaining allowance. */
export async function fetchKeyInfo(apiKey: string, signal?: AbortSignal): Promise<KeyInfo> {
  const response = await get('/key', apiKey, signal);
  const { data } = await response.json();
  return {
    label: data?.label,
    usage: data?.usage ?? 0,
    limitRemaining: data?.limit_remaining ?? null,
    isFreeTier: Boolean(data?.is_free_tier),
  };
}

/**
 * List available models.
 *
 * Always fetched, never hardcoded: model ids churn constantly, and a baked-in
 * list is guaranteed to rot. Unauthenticated — this endpoint takes no key.
 */
export async function fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  const response = await fetch(`${API_BASE}/models`, { headers: APP_HEADERS, signal });
  if (!response.ok) {
    throw OpenRouterError.fromResponse(response.status, await response.text());
  }

  const { data } = await response.json();
  return (data ?? []).map((model: any): ModelInfo => {
    const promptPrice = Number(model.pricing?.prompt ?? 0);
    const completionPrice = Number(model.pricing?.completion ?? 0);
    return {
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length ?? 0,
      promptPrice,
      completionPrice,
      isFree: promptPrice === 0 && completionPrice === 0,
    };
  });
}

function normaliseUsage(usage: any): TokenUsage {
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens,
    cost: usage.cost,
  };
}

async function post(
  path: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  body: unknown,
): Promise<Response> {
  return request(path, apiKey, signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function get(path: string, apiKey: string, signal?: AbortSignal): Promise<Response> {
  return request(path, apiKey, signal, { method: 'GET' });
}

async function request(
  path: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal,
      headers: {
        ...init.headers,
        ...APP_HEADERS,
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    if (isAbort(error)) throw new OpenRouterError('aborted', 'Cancelled');
    throw new OpenRouterError('network', 'Could not reach OpenRouter');
  }

  if (!response.ok) {
    throw OpenRouterError.fromResponse(
      response.status,
      await response.text(),
      response.headers.get('retry-after') ?? undefined,
    );
  }

  return response;
}

/**
 * Parse a Server-Sent Events body into JSON chunks.
 *
 * Two details the SSE format forces on us:
 * - OpenRouter injects `: OPENROUTER PROCESSING` comment lines to keep the
 *   connection from timing out. They are not JSON and must be skipped.
 * - The stream ends with the literal `data: [DONE]`, which is also not JSON.
 */
async function* readSse(response: Response, signal?: AbortSignal): AsyncGenerator<any> {
  if (!response.body) {
    throw new OpenRouterError('network', 'OpenRouter returned an empty response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line, but a single read can land
      // mid-event, so only complete lines are consumed and the tail is kept.
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length === 0 || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;

        const payload = line.slice('data:'.length).trim();
        if (payload === '[DONE]') return;

        try {
          yield JSON.parse(payload);
        } catch {
          // A malformed chunk is not worth killing a good stream over.
        }
      }
    }
  } catch (error) {
    if (isAbort(error) || signal?.aborted) throw new OpenRouterError('aborted', 'Cancelled');
    throw new OpenRouterError('network', 'The connection dropped mid-response');
  } finally {
    reader.cancel().catch(() => {
      // Already closed; nothing to release.
    });
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
