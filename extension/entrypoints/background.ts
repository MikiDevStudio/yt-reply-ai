import type { Browser } from '#imports';
import { commentKey } from '@/lib/comment-key';
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
import { licensed } from '@/lib/licence';
import { angleFor, buildReplyPrompt, buildSoulPrompt, creativityPreset } from '@/lib/prompt';
import { countReply, takeNudge, takeReview } from '@/lib/replies';
import * as settings from '@/lib/settings';
import type { SoulProfile } from '@/lib/soul';
import {
  claimed as trialClaimed,
  claimTrial,
  keyIsOurs as trialKeyIsOurs,
  spent as trialSpent,
} from '@/lib/trial';
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

/**
 * How long one generation may run before it is called off.
 *
 * A reply is one to three sentences; the presets answer in one to five seconds.
 * Past this the attempt has already lost to typing the reply by hand, and
 * waiting longer only spends more of the user's credit — measured at 73 to 102
 * seconds and up to 24,000 reasoning tokens when a small model wanders at the
 * top of the creativity scale. The ceiling is deliberately several times the
 * normal case, so a slow but working answer is never cut off.
 */
const GENERATION_TIMEOUT_MS = 45_000;

/**
 * The most one reply may cost in output tokens, thinking included.
 *
 * Reasoning is billed as output and is unbounded by default, which is how a
 * three-sentence reply reached 24,209 reasoning tokens.
 *
 * Set from measurement rather than taste, and deliberately loose. A short
 * comment takes 150 to 850 tokens to answer, but a comment that asks something
 * specific took 1,300 on the paid preset — at 1,500 the ceiling started cutting
 * genuine replies short, which is the failure this is not allowed to cause.
 * 2,500 leaves that case a wide margin and still stops the runaway one at a
 * tenth of where it went. A reply cut off by it arrives with `truncated` set,
 * and the popover says so rather than passing off half a sentence as finished.
 */
const REPLY_TOKEN_CEILING = 2_500;

/**
 * The same ceiling for a soul profile, which is a page rather than a sentence.
 *
 * A profile that comes back cut in half is worse than one that costs a little
 * more to produce, and this runs once when the user presses a button rather
 * than on every reply.
 */
const PROFILE_TOKEN_CEILING = 4_000;

async function generate(
  port: Browser.runtime.Port,
  request: Extract<GenerateClientMessage, { type: 'start' }>,
  signal: AbortSignal,
) {
  const keepalive = setInterval(() => post(port, { type: 'thinking' }), KEEPALIVE_MS);

  // A deadline of our own, chained to the caller's cancellation. Both end the
  // request the same way, so the flag is what tells them apart afterwards: one
  // is the user's decision and stays silent, the other is a failure to report.
  const deadline = new AbortController();
  const relay = () => deadline.abort();
  signal.addEventListener('abort', relay);
  if (signal.aborted) deadline.abort();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    deadline.abort();
  }, GENERATION_TIMEOUT_MS);

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
      post(port, { type: 'error', ...(await noKey('No OpenRouter key is stored')) });
      return;
    }

    // Which comment this is, derived here rather than sent over the port. The
    // content script and the worker then cannot disagree about what is being
    // counted, and any other surface that generates — the soul preview
    // `use-generation.ts` was written for — falls under the same rule without
    // having to carry a field of its own.
    //
    // Nothing is checked against it. This used to be the gate for a daily cap
    // of 50; the cap is gone and the key is now only the unit the counter
    // de-duplicates by, so regenerating one comment stays one reply.
    const comment = commentKey(request.context.commentAuthor, request.context.commentText);

    const level = request.contextLevel ?? savedLevel;
    const attempt = Math.max(1, request.attempt ?? 1);

    // Every retry is a statement that the previous answer missed, so each one
    // gets a step more room than the last. The stored level is left where the
    // user put it — the bump belongs to this attempt, not to the setting.
    const preset = creativityPreset((request.creativity ?? savedCreativity) + attempt - 1);
    const temperature = await temperatureFor(preset.temperature, model);
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

    const stream = streamCompletion({
      apiKey: key,
      model,
      messages,
      signal: deadline.signal,
      temperature,
      maxTokens: REPLY_TOKEN_CEILING,
      reasoningEffort: await reasoningFor(attempt, model),
    });

    let next = await stream.next();
    while (!next.done) {
      post(port, { type: 'delta', text: next.value });
      next = await stream.next();
    }

    // Counted before `done` is posted rather than after it, which is where
    // this used to sit. The order matters now that the milestone travels with
    // that message: the card is shown by the popover the moment the reply
    // lands, and it cannot be told about a count that has not been written yet.
    // The cost is one storage write — single-digit milliseconds — between the
    // last token and the message that says the text is final.
    //
    // Only for a reply that arrived. A request that failed, timed out or came
    // back empty produced nothing to count, and every further attempt at this
    // comment finds it already counted and is free.
    await countReply(comment);

    // Claimed here, in the one process that is a single writer for it. Both
    // gates are read first so that someone who will not be shown a card never
    // burns a milestone on one.
    //
    // The licence is the gate that matters and it is checked rather than
    // mirrored into the local flag: an entitlement arrives through
    // `chrome.storage.sync`, so on a second machine it is there before anything
    // local has been written, and a card shown to somebody who has paid is the
    // worst version of this feature.
    const quiet = (await licensed()) || !(await settings.supportNudges.getValue());
    const nudge = quiet ? null : await takeNudge();

    // The review block is not what a licence buys. A coffee silences the coffee
    // card, and deliberately nothing else: this block is dismissed for free
    // with its own button, and a review that had to be paid off to stop being
    // asked for is a review nobody should want. `nudge` is passed so the two
    // never land on the same reply — see `takeReview`.
    const review = await takeReview(nudge !== null);

    post(port, {
      type: 'done',
      text: next.value.text,
      usage: next.value.usage,
      // A provider default can still cut a long answer short. Saying so beats
      // handing over a sentence that ends mid-word as if it were finished.
      truncated: next.value.finishReason === 'length',
      ...(nudge !== null ? { nudge } : {}),
      ...(review ? { review: true } : {}),
    });
  } catch (error) {
    if (asOpenRouterError(error).kind === 'aborted') {
      // Our deadline and the user's cancel button arrive here identically.
      // Cancelling is a choice and says nothing; the deadline is a failure the
      // user has been staring at a spinner for.
      if (timedOut) {
        post(port, {
          type: 'error',
          kind: 'timeout',
          message: `No reply after ${GENERATION_TIMEOUT_MS / 1000} seconds`,
        });
      }
      return;
    }

    // Everything is inside the try, including reading settings and building the
    // prompt. It used to start above it, so a failure there threw into nothing:
    // no message was ever sent, the popover sat on its spinner until Chrome
    // retired the worker, and the user was told the extension had stopped
    // responding — for what was really a bug on this side.
    console.warn('[reply-ai] generate failed', error);
    post(port, { type: 'error', ...(await describeFor(error, model)) });
  } finally {
    clearInterval(keepalive);
    clearTimeout(timer);
    signal.removeEventListener('abort', relay);
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
      await storeKey(key, { ours: false });
      return { ok: true, data: { connected: true } };
    }

    case 'auth:setKey': {
      // Validate before storing, so a typo surfaces immediately rather than at
      // the first generation attempt.
      await fetchKeyInfo(request.apiKey);
      await storeKey(request.apiKey, { ours: false });
      return { ok: true, data: { connected: true } };
    }

    case 'auth:disconnect': {
      await Promise.all([
        settings.apiKey.removeValue(),
        trialKeyIsOurs.setValue(false),
        trialSpent.setValue(false),
      ]);
      return { ok: true, data: { connected: false } };
    }

    case 'trial:claim': {
      // A stored key is never overwritten, whatever the button that got here
      // said. Someone who has connected their own account has nothing to gain
      // from a two-cent trial and everything to lose from us replacing it.
      if (await settings.apiKey.getValue()) {
        return { ok: true, data: { status: 'connected' } };
      }

      const { outcome, key } = await claimTrial();
      // The trial key goes exactly where an OAuth key goes: generation cannot tell
      // the two apart and must not try. The flag is only ever read at the end, when
      // the key runs out and the message depends on whose it was.
      if (key) await storeKey(key, { ours: true });
      // `unavailable` means "not this minute" — the offer stands. The other two
      // are final for this install.
      if (outcome.status !== 'unavailable') await trialClaimed.setValue(true);

      return { ok: true, data: outcome };
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
      if (!key) return { ok: false, ...(await noKey('No key stored')) };
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
      if (!key) return { ok: false, ...(await noKey('No key stored')) };

      // Streamed and then assembled: one editor-sized answer has nothing to
      // show progressively, but the streaming path is the one that handles
      // mid-response provider errors properly.
      //
      // Reasoning is left alone here, unlike a reply: rewriting someone's voice
      // is the one place thinking earns its cost, and this runs once per press.
      const stream = streamCompletion({
        apiKey: key,
        model,
        messages: buildSoulPrompt(request.markdown, request.mode),
        maxTokens: PROFILE_TOKEN_CEILING,
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

/**
 * Store a key, and record whose it is, in the same breath.
 *
 * The two are written together because they are one fact. An `apiKey.setValue`
 * that forgot the flag would leave someone's own key wearing the trial's label,
 * and the copy at the end would then tell them a trial they never took had run
 * out — so there is one door, and it takes both.
 */
async function storeKey(key: string, { ours }: { ours: boolean }): Promise<void> {
  await Promise.all([
    settings.apiKey.setValue(key),
    trialKeyIsOurs.setValue(ours),
    // Whatever the last key ran out of is not this key's business.
    trialSpent.setValue(false),
  ]);
}

/**
 * The failure for "there is no key", said once for every surface that can hit it.
 *
 * Two facts the UI cannot work out for itself, and both change what it says.
 * `hadKey: false` separates never having connected from a key OpenRouter has
 * since rejected. `trialAvailable` decides whether the card offers a free
 * trial or a form — the whole of #35, and it has to be answered the same way
 * under a YouTube comment, in the popup and on the settings page.
 */
async function noKey(message: string): Promise<FailurePayload> {
  return {
    kind: 'unauthorized',
    message,
    hadKey: false,
    trialAvailable: !(await trialClaimed.getValue()),
  };
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

  // Whose key just ran out. The UI has no way to know — the key never reaches
  // it — and the answer decides between two messages with nothing in common.
  if (failure.kind === 'key_exhausted') {
    payload.keyIsOurs = await trialKeyIsOurs.getValue();
    // This refusal is the only trustworthy notice that the trial is over, so it
    // is written down here rather than re-derived later from what the API says
    // is left on the key. See `spent` in lib/trial.ts.
    if (payload.keyIsOurs) await trialSpent.setValue(true);
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

/**
 * The hottest a free variant is allowed to run.
 *
 * The creativity table tops out at 1.3, which the third attempt always reaches.
 * A capable model handles it: gemini-3.6-flash answered in 115 characters and
 * 1.3 seconds. The free preset did not — at 1.3 it produced 68,000 and 12,700
 * characters of its own deliberation in two runs, taking a minute and a half
 * each, while at 1.1 the same prompt came back in under 200 characters. That is
 * the difference between a bold reply and a model that has lost the thread, and
 * it is the third attempt that people were watching hang.
 *
 * Capping by `isFree` is a proxy for "small", and an imperfect one — a 550B
 * free variant is held back for nothing. The cost of being wrong that way is
 * one notch of boldness; the cost of the other way is a minute of spinner and
 * an answer nobody can use.
 */
const FREE_MODEL_MAX_TEMPERATURE = 1.1;

async function temperatureFor(wanted: number, model: string): Promise<number> {
  return (await isFreeModel(model)) ? Math.min(wanted, FREE_MODEL_MAX_TEMPERATURE) : wanted;
}

/**
 * How hard the model may think, per attempt.
 *
 * The first reply is the one that decides whether any of this is worth using,
 * so it gets room to think rather than the cheapest setting that works.
 * `minimal` used to be first, on the argument that speed matters most; it does
 * not — a fast reply that misses the comment is a reason to uninstall, and
 * nobody who sees one presses regenerate to find out whether the second is
 * better. Retries step up again, because by then the obvious answer has already
 * been turned down.
 *
 * Free variants stay at `low` throughout, for the same reason their temperature
 * is capped: the extra thinking does not come back as a better reply. At
 * `medium` the free preset hit the token ceiling and spilled its own
 * deliberation into the answer; at `low` the same comment came back finished
 * every time, in three to seven seconds.
 */
async function reasoningFor(attempt: number, model: string): Promise<'low' | 'medium'> {
  if (attempt === 1) return 'low';
  return (await isFreeModel(model)) ? 'low' : 'medium';
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
