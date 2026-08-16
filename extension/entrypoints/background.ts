import type { Browser } from '#imports';
import {
  type FailurePayload,
  GENERATE_PORT,
  type GenerateClientMessage,
  type GenerateServerMessage,
  type GenerationContext,
  type Request,
  type Response,
} from '@/lib/messaging';
import { connectWithOAuth } from '@/lib/openrouter/auth';
import { fetchKeyInfo, fetchModel, fetchModels, streamCompletion } from '@/lib/openrouter/client';
import { OpenRouterError } from '@/lib/openrouter/errors';
import { angleFor, buildReplyPrompt, buildSoulPrompt, creativityPreset } from '@/lib/prompt';
import * as settings from '@/lib/settings';
import type { SoulProfile } from '@/lib/soul';
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

/**
 * How often to send a sign of life while a generation is running.
 *
 * Chrome stops an idle service worker after 30 seconds, and a reasoning model
 * can spend longer than that thinking before it emits its first visible token —
 * from the outside the worker looks idle the whole time. Traffic on the port is
 * activity, so a tick well inside the window keeps the worker alive; without it
 * the popover was told the extension had stopped responding while the answer
 * was still being written.
 */
const KEEPALIVE_MS = 15_000;

async function generate(
  port: Browser.runtime.Port,
  request: Extract<GenerateClientMessage, { type: 'start' }>,
  signal: AbortSignal,
) {
  const keepalive = setInterval(() => post(port, { type: 'thinking' }), KEEPALIVE_MS);
  // Read in the try below, reported in the catch: which model failed decides
  // what the rate-limit message is allowed to claim.
  let model: string | undefined;

  try {
    // Read state on every invocation. The worker is restarted freely, so nothing
    // may be cached in module scope.
    const [key, chosen, soul, profile, savedStyle, savedLevel, savedCreativity, savedAudience] =
      await Promise.all([
        settings.apiKey.getValue(),
        settings.model.getValue(),
        settings.soul.getValue(),
        settings.soulProfile.getValue(),
        settings.style.getValue(),
        settings.contextLevel.getValue(),
        settings.creativity.getValue(),
        settings.replyAs.getValue(),
      ]);

    model = chosen;

    if (!key) {
      post(port, {
        type: 'error',
        kind: 'unauthorized',
        message: 'No OpenRouter key is stored',
        // Never connected, as opposed to a key OpenRouter has since rejected.
        // The two need different words, and only this side can tell them apart.
        hadKey: false,
      });
      return;
    }

    const level = request.contextLevel ?? savedLevel;
    const attempt = Math.max(1, request.attempt ?? 1);

    // Every retry is a statement that the previous answer missed, so each one
    // gets a step more room than the last. The stored level is left where the
    // user put it — the bump belongs to this attempt, not to the setting.
    const preset = creativityPreset((request.creativity ?? savedCreativity) + attempt - 1);
    const { language, isGuess } = resolveLanguage(request, profile);

    const messages = buildReplyPrompt({
      context: level >= 2 ? await withCachedDescription(request.context) : request.context,
      soul,
      style: request.style ?? savedStyle,
      level,
      audience: request.audience ?? savedAudience,
      note: request.note,
      creativity: preset.level,
      angle: angleFor(attempt),
      previous: request.previous,
      language,
      languageIsGuess: isGuess,
    });

    // No token cap: see CompletionOptions.maxTokens. The reply length is set by
    // the prompt and the soul profile, not by cutting the model off mid-word.
    const stream = streamCompletion({
      apiKey: key,
      model,
      messages,
      signal,
      temperature: preset.temperature,
      // The first reply is the one that decides whether any of this is worth
      // using, so it gets room to think rather than the cheapest setting that
      // works. `minimal` used to be first, on the argument that speed matters
      // most; it does not — a fast reply that misses the comment is a reason to
      // uninstall, and the person who sees it will not press regenerate to find
      // out whether the second one is better. Retries step up again, because by
      // then the obvious answer has already been turned down.
      reasoningEffort: attempt === 1 ? 'low' : 'medium',
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
    // A cancelled generation is a choice, not a failure. The port is usually
    // already gone by this point anyway.
    if (asOpenRouterError(error).kind === 'aborted') return;

    // Everything is inside the try, including reading settings and building the
    // prompt. It used to start above it, so a failure there threw into nothing:
    // no message was ever sent, the popover sat on its spinner until Chrome
    // retired the worker, and the user was told the extension had stopped
    // responding — for what was really a bug on this side.
    console.warn('[reply-ai] generate failed', error);
    post(port, { type: 'error', ...(await describeFor(error, model)) });
  } finally {
    clearInterval(keepalive);
  }
}

/**
 * Decide which language the reply is written in.
 *
 * Precedence, strongest first: what the user typed in the popover, the language
 * pinned in the soul profile, then what was detected from the comment itself.
 *
 * The last case is marked as a guess when the profile was written by hand
 * (`soulProfile` is `null`), because a hand-written profile can pin a language in
 * prose that we cannot read. Detection then becomes a suggestion the profile may
 * override rather than an order that silently beats it.
 */
function resolveLanguage(
  request: Extract<GenerateClientMessage, { type: 'start' }>,
  profile: SoulProfile | null,
): { language?: string; isGuess: boolean } {
  const typed = request.language?.trim();
  if (typed) return { language: typed, isGuess: false };
  if (profile?.language) return { language: profile.language, isGuess: false };

  const detected = request.detectedLanguage?.trim();
  if (!detected) return { isGuess: false };

  return { language: detected, isGuess: profile === null };
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
    .catch(async (error) => {
      // Logged as well as returned: the message that reaches the UI is written
      // for a user, and this console is the only place a stack survives when
      // something fails on a machine we cannot open a devtools window on.
      console.warn('[reply-ai]', request.type, 'failed', error);

      sendResponse({ ok: false, ...(await describeFor(error)) });
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

    case 'models:list': {
      const cached = await settings.modelCatalogue.getValue();
      if (cached && !request.refresh) return { ok: true, data: cached };

      const catalogue = { models: await fetchModels(), fetchedAt: Date.now() };
      await settings.modelCatalogue.setValue(catalogue);
      return { ok: true, data: catalogue };
    }

    case 'models:validate':
      // Same bargain as `auth:setKey` above: check it now, in the settings page
      // where the id was typed, rather than letting it surface as a failed reply
      // under a comment with no hint that the id was the problem.
      return { ok: true, data: await fetchModel(request.id) };

    case 'usage:get': {
      const key = await settings.apiKey.getValue();
      if (!key) {
        return { ok: false, kind: 'unauthorized', message: 'No key stored', hadKey: false };
      }
      return { ok: true, data: await fetchKeyInfo(key) };
    }

    case 'ui:openOptions': {
      // `openOptionsPage` would do, but a tab keyed to a section does not, and
      // every caller here wants to land on a particular one.
      const url = browser.runtime.getURL(`/options.html#${request.section}`);
      await browser.tabs.create({ url });
      return { ok: true, data: null };
    }

    case 'ui:openUrl': {
      await browser.tabs.create({ url: request.url });
      return { ok: true, data: null };
    }

    case 'soul:improve': {
      const [key, model] = await Promise.all([
        settings.apiKey.getValue(),
        settings.model.getValue(),
      ]);
      if (!key) {
        return { ok: false, kind: 'unauthorized', message: 'No key stored', hadKey: false };
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

/**
 * Gather the facts about a failure that only this side knows.
 *
 * The wording is not decided here — that is `lib/failure.ts`, on the UI side.
 * What the UI cannot work out for itself is whether a key was ever stored, and
 * which of OpenRouter's rate limits applies, which takes both the model's price
 * and the account's paying history.
 */
async function describeFor(error: unknown, model?: string): Promise<FailurePayload> {
  const failure = asOpenRouterError(error);
  const payload: FailurePayload = {
    kind: failure.kind,
    message: failure.message,
    retryAfterSeconds: failure.retryAfterSeconds,
  };

  if (failure.kind === 'unauthorized') {
    payload.hadKey = Boolean(await settings.apiKey.getValue());
  }

  if (failure.kind === 'rate_limited') {
    const source = failure.limitSource ?? 'unknown';
    payload.rateLimit = {
      modelIsFree: await isFreeModel(model ?? (await settings.model.getValue())),
      // Which daily cap applies is only worth a request when the daily cap is
      // what refused. Asking on a per-minute or an upstream limit would spend a
      // round trip to print a number that has nothing to do with the failure.
      hasPaid: source === 'per-day' || source === 'unknown' ? await hasEverPaid() : null,
      source,
    };
  }

  return payload;
}

/** Free variants are the ones OpenRouter's per-day cap applies to. */
async function isFreeModel(id: string): Promise<boolean> {
  const [custom, catalogue] = await Promise.all([
    settings.customModel.getValue(),
    settings.modelCatalogue.getValue(),
  ]);

  const known = custom?.id === id ? custom : catalogue?.models.find((entry) => entry.id === id);
  // `:free` is OpenRouter's own naming for those variants, and is the best
  // available answer when the catalogue has never been fetched.
  return known ? known.isFree : id.endsWith(':free');
}

/**
 * Whether the account has ever bought credits — the fact that decides between
 * the 50 and the 1000 request daily cap.
 *
 * One extra request, made only after a 429 has already happened, so it costs
 * nothing on the path that works. `null` when it cannot be answered: the
 * message then names both caps rather than asserting the wrong one.
 */
async function hasEverPaid(): Promise<boolean | null> {
  const key = await settings.apiKey.getValue();
  if (!key) return null;

  try {
    const info = await fetchKeyInfo(key);
    return !info.isFreeTier;
  } catch {
    return null;
  }
}
