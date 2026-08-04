import type { Browser } from '#imports';
import {
  GENERATE_PORT,
  type GenerateClientMessage,
  type GenerateServerMessage,
  type GenerationContext,
  type Request,
  type Response,
} from '@/lib/messaging';
import { connectWithOAuth } from '@/lib/openrouter/auth';
import { fetchKeyInfo, fetchModels, streamCompletion } from '@/lib/openrouter/client';
import { OpenRouterError } from '@/lib/openrouter/errors';
import { buildReplyPrompt, buildSoulPrompt } from '@/lib/prompt';
import * as settings from '@/lib/settings';
import { recallDescription, rememberDescription } from '@/lib/video-cache';

/**
 * The background service worker owns everything that touches the network.
 *
 * Two reasons, both hard requirements rather than preferences:
 * - A content script's `fetch` follows YouTube's CORS rules and cannot reach
 *   openrouter.ai. From here, `host_permissions` makes it work.
 * - The API key must never be readable from a page we do not control.
 *
 * Listeners are registered synchronously at the top level. Chrome replays
 * events to a restarted worker, but only for listeners registered this way.
 */
export default defineBackground(() => {
  browser.runtime.onConnect.addListener(handleConnect);
  browser.runtime.onMessage.addListener(handleMessage);
});

/** Generation runs over a port so tokens can stream back as they arrive. */
function handleConnect(port: Browser.runtime.Port) {
  if (port.name !== GENERATE_PORT) return;

  const controller = new AbortController();

  // The user closing the popover, navigating away, or the tab going away all
  // land here. Aborting stops billing at providers that support it.
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener((message: GenerateClientMessage) => {
    if (message.type === 'cancel') {
      controller.abort();
      return;
    }
    if (message.type === 'start') {
      void generate(port, message, controller.signal);
    }
  });
}

async function generate(
  port: Browser.runtime.Port,
  request: Extract<GenerateClientMessage, { type: 'start' }>,
  signal: AbortSignal,
) {
  // Read state on every invocation. The worker is restarted freely, so nothing
  // may be cached in module scope.
  const [key, model, soul, savedStyle, savedLevel] = await Promise.all([
    settings.apiKey.getValue(),
    settings.model.getValue(),
    settings.soul.getValue(),
    settings.style.getValue(),
    settings.contextLevel.getValue(),
  ]);

  if (!key) {
    post(port, {
      type: 'error',
      kind: 'unauthorized',
      message: 'Connect your OpenRouter account first',
    });
    return;
  }

  const level = request.contextLevel ?? savedLevel;

  const messages = buildReplyPrompt({
    context: level >= 2 ? await withCachedDescription(request.context) : request.context,
    soul,
    style: request.style ?? savedStyle,
    level,
  });

  try {
    // No token cap: see CompletionOptions.maxTokens. The reply length is set by
    // the prompt and the soul profile, not by cutting the model off mid-word.
    const stream = streamCompletion({
      apiKey: key,
      model,
      messages,
      signal,
      reasoningEffort: 'minimal',
    });

    let next = await stream.next();
    while (!next.done) {
      post(port, { type: 'delta', text: next.value });
      next = await stream.next();
    }

    post(port, {
      type: 'done',
      text: next.value.text,
      usage: next.value.usage,
      // A provider default can still cut a long answer short. Saying so beats
      // handing over a sentence that ends mid-word as if it were finished.
      truncated: next.value.finishReason === 'length',
    });
  } catch (error) {
    const failure = asOpenRouterError(error);
    // A cancelled generation is a choice, not a failure. The port is usually
    // already gone by this point anyway.
    if (failure.kind === 'aborted') return;

    post(port, {
      type: 'error',
      kind: failure.kind,
      message: failure.message,
      retryAfterSeconds: failure.retryAfterSeconds,
    });
  }
}

/**
 * Settle on one description per video and keep using it.
 *
 * The first scrape wins, because a later one can be worse: after an in-page
 * navigation the content script only sees the truncated snippet. Holding the
 * first copy also keeps the prompt prefix byte-identical between comments,
 * which is the precondition for provider-side caching (#8).
 */
async function withCachedDescription(context: GenerationContext): Promise<GenerationContext> {
  if (!context.video) return context;

  const { videoId, description } = context.video;
  const cached = await recallDescription(videoId);

  if (cached) {
    return { ...context, video: { ...context.video, description: cached } };
  }

  if (description) {
    await rememberDescription(videoId, description);
  }

  return context;
}

/** Posting to a closed port throws; the disconnect is not worth reporting. */
function post(port: Browser.runtime.Port, message: GenerateServerMessage) {
  try {
    port.postMessage(message);
  } catch {
    // Receiver is gone.
  }
}

/**
 * One-shot requests.
 *
 * Returning `true` keeps the message channel open for the async reply — without
 * it Chrome closes the channel as soon as this function returns and the caller
 * receives `undefined`.
 */
function handleMessage(
  request: Request,
  _sender: Browser.runtime.MessageSender,
  sendResponse: (response: Response<unknown>) => void,
): boolean {
  respond(request)
    .then(sendResponse)
    .catch((error) => {
      // Logged as well as returned: the message that reaches the UI is written
      // for a user, and this console is the only place a stack survives when
      // something fails on a machine we cannot open a devtools window on.
      console.warn('[reply-ai]', request.type, 'failed', error);

      const failure = asOpenRouterError(error);
      sendResponse({ ok: false, kind: failure.kind, message: failure.message });
    });
  return true;
}

async function respond(request: Request): Promise<Response<unknown>> {
  switch (request.type) {
    case 'auth:status': {
      const key = await settings.apiKey.getValue();
      return { ok: true, data: { connected: Boolean(key) } };
    }

    case 'auth:connect': {
      const key = await connectWithOAuth();
      await settings.apiKey.setValue(key);
      return { ok: true, data: { connected: true } };
    }

    case 'auth:setKey': {
      // Validate before storing, so a typo surfaces immediately rather than at
      // the first generation attempt.
      await fetchKeyInfo(request.apiKey);
      await settings.apiKey.setValue(request.apiKey);
      return { ok: true, data: { connected: true } };
    }

    case 'auth:disconnect': {
      await settings.apiKey.removeValue();
      return { ok: true, data: { connected: false } };
    }

    case 'models:list':
      return { ok: true, data: await fetchModels() };

    case 'usage:get': {
      const key = await settings.apiKey.getValue();
      if (!key) return { ok: false, kind: 'unauthorized', message: 'Not connected' };
      return { ok: true, data: await fetchKeyInfo(key) };
    }

    case 'soul:improve': {
      const [key, model] = await Promise.all([
        settings.apiKey.getValue(),
        settings.model.getValue(),
      ]);
      if (!key) {
        return { ok: false, kind: 'unauthorized', message: 'Connect your OpenRouter account first' };
      }

      // Streamed and then assembled: one editor-sized answer has nothing to
      // show progressively, but the streaming path is the one that handles
      // mid-response provider errors properly.
      //
      // Uncapped for the same reason as a reply — a profile cut off halfway is
      // worse than a long one — but reasoning stays available here, since
      // rewriting someone's voice is the one place thinking earns its cost.
      const stream = streamCompletion({
        apiKey: key,
        model,
        messages: buildSoulPrompt(request.markdown, request.mode),
      });

      let next = await stream.next();
      while (!next.done) next = await stream.next();

      const text = next.value.text.trim();
      if (!text) {
        return { ok: false, kind: 'empty', message: 'The model returned nothing' };
      }

      return { ok: true, data: text };
    }
  }
}

function asOpenRouterError(error: unknown): OpenRouterError {
  if (error instanceof OpenRouterError) return error;
  return new OpenRouterError(
    'upstream',
    error instanceof Error ? error.message : 'Unexpected failure',
  );
}
