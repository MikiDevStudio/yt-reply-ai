import { OpenRouterError } from './errors';
import type { ChatMessage, CompletionResult, KeyInfo, ModelInfo, TokenUsage } from './types';

export const API_BASE = 'https://openrouter.ai/api/v1';

/**
 * What we call ourselves to OpenRouter.
 *
 * Used in two places that must agree: the request headers below and the label
 * on the key minted by the OAuth flow. Left unset, that label reads "An app" on
 * the consent screen and in the user's key list, which tells them nothing about
 * what they are approving.
 */
export const APP_NAME = 'Reply AI for YouTube';

/**
 * App identity, sent on every request.
 *
 * Besides being polite, these headers list the extension in OpenRouter's public
 * app directory — free distribution we would otherwise have to buy.
 */
const APP_HEADERS = {
  'HTTP-Referer': 'https://github.com/MikiDevStudio/yt-reply-ai',
  'X-Title': APP_NAME,
};

export interface CompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /**
   * The ceiling on everything the model produces, thinking included — that is
   * what makes it worth setting, since reasoning tokens are billed as output
   * and are otherwise unbounded.
   *
   * It has to be set generously rather than tightly. A cap counts thinking
   * first, so a low one truncates the answer mid-word long before the answer is
   * long: measured at 396 completion tokens, 380 of them reasoning, and 62
   * characters of visible text. The prompt asks for one to three sentences, and
   * that is what decides the length in the normal case; this only catches the
   * run that has stopped being normal. Callers set it — see `background.ts`.
   */
  maxTokens?: number;
  temperature?: number;
  /**
   * How hard the model may think before answering.
   *
   * The setting is worth real money and real seconds: on gemini-3.6-flash the
   * same reply came to 536 tokens, $0.0041 and 4.7s with reasoning left alone,
   * against 33 tokens, $0.0003 and 1.7s at `minimal`. That measurement once
   * argued for `minimal` everywhere; it no longer decides the matter, because
   * the reply people judge the product on is the first one they see. What the
   * caller picks is in `background.ts`.
   *
   * Not every model accepts it, so the request retries without it once if the
   * API rejects the parameter.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
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
  const body = {
    model: options.model,
    messages: options.messages,
    stream: true,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    // Ask for token counts and cost in the final chunk, so callers can show
    // spend without a second round trip.
    usage: { include: true },
  };

  const response = await postWithReasoning(options, body);

  const result: CompletionResult = { text: '' };
  // Length at which the answer is next examined for having gone in circles.
  let nextSanityCheck = DEGENERATE_MIN_LENGTH;

  for await (const chunk of readSse(response, options.signal)) {
    // A failure after the first byte arrives as a chunk, not an HTTP status —
    // the headers already said 200. Without this branch the stream would just
    // end early and look like a successful short answer.
    if (chunk.error) {
      throw OpenRouterError.fromStreamError(chunk.error);
    }

    result.generationId ??= chunk.id;

    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) result.finishReason = choice.finish_reason;

    const delta = choice?.delta?.content;
    if (delta) {
      result.text += delta;
      yield delta;

      // Two ways an answer stops being an answer, both caught while it streams
      // rather than at the end, because the tokens are billed as they arrive.
      // Measured, not imagined: one free variant replied to a three-sentence
      // prompt with 32,829 tokens of `<pad>`, and another wrote 80,000
      // characters of its own deliberation — on the default paid model those
      // are a quarter of a dollar and most of a dollar respectively, for
      // nothing. Checked every 500 characters, so a normal reply is examined
      // once and a runaway one within a second of going wrong.
      if (result.text.length >= nextSanityCheck) {
        if (result.text.length > MAX_REPLY_CHARS) {
          throw new OpenRouterError('runaway', 'The model wrote far past the length of a reply');
        }
        if (isDegenerate(result.text)) {
          throw new OpenRouterError('empty', 'The model repeated itself instead of answering');
        }
        nextSanityCheck = result.text.length + DEGENERATE_MIN_LENGTH;
      }
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

/**
 * Below this length nothing is judged: a reply is one to three sentences, and
 * anything shorter than this cannot be long enough to have gone in circles.
 */
const DEGENERATE_MIN_LENGTH = 500;

/**
 * Past this, whatever is arriving is not a comment reply.
 *
 * Roughly six hundred words — several times the longest reply a soul profile
 * would ask for, so a verbose but genuine answer is never touched. What it
 * catches is the model that starts narrating its own reasoning into the answer
 * and does not stop.
 */
const MAX_REPLY_CHARS = 4_000;

/** A run of special tokens — `<pad>`, `<unk>`, `<|endoftext|>` — and nothing else. */
const SPECIAL_TOKEN_RUN = /^(?:<[^<>\s]{1,24}>\s*){20,}$/;

/**
 * Whether the model stopped writing and started repeating.
 *
 * Two failure modes, both observed rather than imagined: a model leaking its
 * own padding token instead of text, and a model looping over a handful of
 * words until it runs out of room. Neither is an answer, and both would
 * otherwise arrive in the reply box looking like one.
 *
 * The measure is the share of distinct words, not their count: "thank you so
 * much" repeated sixty times has four distinct words and is plainly broken,
 * while a fixed ceiling low enough to catch it would be arbitrary. Below one
 * word in seven being new, over at least fifty words, is nothing a person
 * wrote — and the margin matters, because a false positive here throws away
 * an answer the user paid for.
 */
export function isDegenerate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < DEGENERATE_MIN_LENGTH) return false;

  if (SPECIAL_TOKEN_RUN.test(trimmed)) return true;

  const words = trimmed.split(/\s+/);
  if (words.length < 50) return false;

  return new Set(words).size / words.length < 0.15;
}

/**
 * Send the request, dropping `reasoning` if this model will not take it.
 *
 * Models disagree about the parameter in both directions: some ignore it, some
 * reject the request outright — `google/gemini-3.6-flash` refuses
 * `enabled: false` with "Reasoning is mandatory for this endpoint" while
 * happily accepting `effort: minimal`. Retrying once without it costs one round
 * trip on the models that object and nothing on the ones that do not, which
 * beats maintaining a compatibility list that would rot within a month.
 */
async function postWithReasoning(
  options: CompletionOptions,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!options.reasoningEffort) {
    return post('/chat/completions', options.apiKey, options.signal, body);
  }

  try {
    return await post('/chat/completions', options.apiKey, options.signal, {
      ...body,
      reasoning: { effort: options.reasoningEffort },
    });
  } catch (error) {
    const rejected =
      error instanceof OpenRouterError &&
      error.kind === 'invalid_request' &&
      /reasoning/i.test(error.message);

    if (!rejected) throw error;

    return post('/chat/completions', options.apiKey, options.signal, body);
  }
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
 * list is guaranteed to rot.
 */
export async function fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  // `most-popular` decides what the picker shows before anything is typed. The
  // catalogue runs past 400 entries and its default order buries the models
  // people recognise under ones they have never heard of.
  //
  // The limit is the endpoint's maximum. Its default of 500 is already close
  // enough to the catalogue's size to start silently truncating it.
  const { data } = await getPublic('/models?sort=most-popular&limit=1000', signal);
  return (data ?? []).filter(writesText).map(toModelInfo);
}

/**
 * Embedding and image-only models sit in the same catalogue and cannot write a
 * reply. Offering them buys nothing but a failed generation.
 */
function writesText(model: any): boolean {
  const modalities = model.architecture?.output_modalities;
  // Absent means the catalogue did not say. Text is the safe assumption: it is
  // what almost every entry does, and a wrong guess here only shows one extra row.
  return !Array.isArray(modalities) || modalities.includes('text');
}

/** `author/slug`, with the optional `:free` or `:batch` style variant suffix. */
const MODEL_ID = /^[\w.-]+\/[\w.-]+(?::[\w.-]+)?$/;

/**
 * Look up a single model.
 *
 * `GET /model/{author}/{slug}` rather than a search through the list: 1.4 KB
 * against 656 KB, the variant suffix survives in the path, and an id nobody
 * offers comes back as a 404 carrying OpenRouter's own wording — better than
 * anything we would invent about someone else's catalogue.
 *
 * The shape is checked before the request so `gpt-4` or a pasted URL fails
 * without a round trip, and so nothing unexamined is interpolated into a path.
 */
export async function fetchModel(id: string, signal?: AbortSignal): Promise<ModelInfo> {
  if (!MODEL_ID.test(id)) {
    throw new OpenRouterError(
      'invalid_request',
      'A model id looks like anthropic/claude-sonnet-5 — the author, a slash, the model.',
    );
  }

  const { data } = await getPublic(`/model/${id}`, signal);
  return toModelInfo(data);
}

function toModelInfo(model: any): ModelInfo {
  const promptPrice = Number(model.pricing?.prompt ?? 0);
  const completionPrice = Number(model.pricing?.completion ?? 0);
  return {
    id: model.id,
    name: model.name ?? model.id,
    contextLength: model.context_length ?? 0,
    promptPrice,
    completionPrice,
    isFree: promptPrice === 0 && completionPrice === 0,
    acceptsReasoning: (model.supported_parameters ?? []).includes('reasoning'),
  };
}

/**
 * A GET that carries no key.
 *
 * Both catalogue endpoints are public. That was checked against the live API
 * rather than remembered, because the API reference marks both as requiring a
 * bearer token and neither does.
 */
async function getPublic(path: string, signal?: AbortSignal): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers: APP_HEADERS, signal });
  } catch (error) {
    if (isAbort(error)) throw new OpenRouterError('aborted', 'Cancelled');
    throw connectionFailure('Could not reach OpenRouter');
  }

  if (!response.ok) {
    throw OpenRouterError.fromResponse(response.status, await response.text(), response.headers);
  }

  return response.json();
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
    throw connectionFailure('Could not reach OpenRouter');
  }

  if (!response.ok) {
    throw OpenRouterError.fromResponse(response.status, await response.text(), response.headers);
  }

  return response;
}

/**
 * Tell "this machine has no network" apart from "OpenRouter did not answer".
 *
 * `navigator.onLine` is only trustworthy in one direction: `true` means there is
 * a network interface, not that anything is reachable, but `false` means the
 * browser knows there is nothing to reach. Only that direction is used.
 */
export function connectionFailure(message: string): OpenRouterError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new OpenRouterError('offline', 'No internet connection');
  }
  return new OpenRouterError('network', message);
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
    throw connectionFailure('The connection dropped mid-response');
  } finally {
    reader.cancel().catch(() => {
      // Already closed; nothing to release.
    });
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
