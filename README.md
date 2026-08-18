# Reply AI — YouTube Comment Assistant

Chrome MV3 extension that generates replies to YouTube comments in the author's own voice.

Primary audience: **channel owners** answering their comment section. The popover can
already answer as a viewer instead — same voice, no speaking for the channel — but the
viewer's own entry point, a button in the "Add a comment" box, is still phase 2 (#19).

## Repository layout

```
extension/          the Chrome extension (WXT + React + TypeScript + Tailwind)
worker/             the trial Worker (Cloudflare) — issues the free trial key
landing/            the website's source (Astro + Tailwind) — edit here
site/               the website, built from landing/ and committed — do not edit
docs/               design notes and decisions
```

`site/` is build output. `npm run build` in `landing/` empties and rewrites it,
and it is committed so that deploying is a `git pull` with no Node on the host.
See `landing/README.md`.

Two earlier prototypes sit next to this repo on disk and are **git-ignored** — they are
kept as reference only:

- `yt-reply-extension/` — previous WXT extension. Source of the toolbar-anchoring
  technique that still works a year later. Its UI is being replaced wholesale.
- `Reply-AI-YT/` — standalone web app that ran on Railway. Superseded.

## Stack and why

| Choice | Reason |
|---|---|
| **WXT 0.21** | File-based entrypoints, HMR for content scripts, shadow-root UI helpers, MV3 by default. |
| **React 19 + TypeScript** | The settings page is a real multi-screen app, not a form. |
| **Tailwind v4 + daisyUI 5** | Class-only component library — no JS, so nothing renders into a portal (see below). Semantic colour names mean one theme definition instead of `dark:` on every element. |
| **Shadow DOM** for all injected UI | YouTube's styles cannot reach us, ours cannot reach YouTube. The previous prototype needed 7 KB of defensive CSS without it. |
| **OpenRouter** as the only provider | One OpenAI-compatible API for every model, OAuth PKCE onboarding, per-key usage endpoint, free-tier models, prompt caching pass-through, no inference markup. |

## Architecture rules

**All network calls happen in the background service worker.** Content scripts inherit
the page's CORS rules, so a `fetch` from the YouTube page cannot reach OpenRouter — and
putting an API key in a content script exposes it to the page. The content script only
sends messages; the worker owns the key and the network.

**`host_permissions` is scoped to `https://openrouter.ai/*` and
`https://api.mikidev.app/*`.** Never `<all_urls>`. The second is our trial Worker,
touched once per install; every generation goes straight to OpenRouter.

**Secrets live in `chrome.storage.local`, never `sync`.** `storage.sync` uploads to
Google's servers and caps at 8 KB per item / 100 KB total — a soul profile alone can
exceed that. Only small UI preferences go in `sync`.

**No API key is ever bundled.** `OPENROUTER_API_KEY` in `.env` is for local smoke tests
only; extension source must not reference it. A `.crx` is trivially unpackable.

**Nothing is posted automatically.** Generated text is inserted into the reply box and
the user presses YouTube's own button. This is both honest and the safe side of Chrome
Web Store policy on automated engagement.

**All YouTube DOM knowledge lives in `extension/entrypoints/content/youtube-dom.ts`.**
Anchors are custom element tag names and framework ids, never CSS classes.

**No portal-based component library in the content script.** Radix — and so
shadcn/ui — renders overlays into a portal appended to `document.body`. From a
content script that portal escapes the shadow root, lands in YouTube's DOM and
loses every style we set. daisyUI is CSS classes only, so this cannot happen.

**Injected CSS is converted from `rem` to `px` at build time.** `rem` resolves
against the host document's root, which a shadow root cannot shield us from, and
YouTube sets `html { font-size: 62.5% }` — so anything sized in `rem` renders at
62.5% scale. Theme overrides only reach our own utilities; daisyUI hardcodes
`rem` inside its component rules. `build/rem-to-px.ts` rewrites the generated
content-script stylesheet and leaves extension pages alone, since `rem` behaves
correctly there and lets those pages respect the user's font size.

**Themes are attached to an element inside the shadow root, not the host.**
daisyUI emits `:root` and `[data-theme="…"]`; a stylesheet inside a shadow root
can match neither the document root nor its own host. The plugin's `root` option
looks like the fix but silently ignores anything other than a plain selector.
The theme follows YouTube's `dark` attribute on `<html>` rather than
`prefers-color-scheme`, because YouTube's dark mode is a site setting.

## Token budget

Context is tiered and user-controlled:

| Level | Sent to the model | Rough cost |
|---|---|---|
| L0 (default) | comment text + soul profile | ~300 tokens |
| L1 | + video title, channel, parent comment | ~500 tokens |
| L2 | + video description / summary | first call only |

A retry is not free. The first attempt runs with reasoning held to `minimal`; every
attempt after it gets `low`, because pressing the button again says the obvious answer
missed and finding a different one is the work thinking pays for. Measured on
`gemini-3.6-flash`: $0.0005 for the first reply, ~$0.0055 for each retry. Holding every
attempt at `minimal` costs ~$0.0008 and still varies — the angle deck does most of that
work — but the replies are noticeably flatter.

The video-level context is fetched once per `videoId`, cached in `storage.session`, and
reused across every comment on that video. With OpenRouter's prompt-caching pass-through
the shared prefix is billed at 0.1–0.25× on repeat calls. Note the provider minimum of
1024 tokens (4096 for Gemini 2.5 Pro) — caching only engages at L2.

Video metadata is scraped from the page, not fetched from the YouTube Data API: no extra
key, no quota.

## The first run

A new install is one press from a reply, not one account away from one. Pressing
**Try it free** — in the popover under a comment, in the toolbar popup, or on the
settings page — asks `worker/` for a real OpenRouter key of this install's own,
capped at $0.04, which is about thirty replies. What leaves the machine is one
random UUID; see `worker/README.md`.

When that key runs out OpenRouter answers 403 with `Key limit exceeded`, which is
the same status a revoked key gets. `local:trial.keyIsOurs` is what tells the two
apart, and it is written by the one call in the background worker that stores a
key, so it cannot drift from the key it describes. Ours reads as the trial
finishing as designed; anyone else's as a cap set on openrouter.ai.

Neither card is a fault, and neither is drawn as one — `Failure.tone` in
`extension/lib/failure.ts` puts the offer and the ending in the accent frame
rather than the error one.

## Monetisation

| Tier | What | Backend needed |
|---|---|---|
| Trial | our own capped key, ~30 replies, no account | the trial Worker |
| Free | OpenRouter OAuth, `:free` models (OpenRouter's own 50/day) | none |
| BYOK | same OAuth, paid models, user pays OpenRouter directly | none |
| Pro | provisioned OpenRouter key with a spend limit, profile sync, bulk mode | minimal |

**We impose no limit of our own.** A daily cap of 50 replies shipped and was
removed: the only thing it measured was how many people it stopped. What is
left is a counter (`extension/lib/replies.ts`) that gates nothing and, every
twenty replies, offers a card saying thank you with a Buy Me a Coffee button and
two feedback links. Donations and the Pro waitlist are the whole of the ask.

The only server is the trial Worker, and it exists so a first run can end in a
reply. It is not a proxy and must not become one: no comment text passes through
it, and an outage there cannot stop an install that already has a key. Pro uses
the same OpenRouter provisioning API (`POST /api/v1/keys` with `limit`) so quota
enforcement happens upstream — a backend that turns a payment into a capped key
and nothing more.

Chrome Web Store's built-in payments are discontinued; billing must be external.

## Development

```bash
cd extension
npm install
npm run dev       # launches Chrome with the extension loaded
npm run build
npm run compile   # typecheck
npm run smoke     # exercise the OpenRouter client against the live API
npm run measure   # what one reply actually costs, per model and reasoning level
```

The Worker has its own workspace:

```bash
cd worker
npx wrangler dev
npx wrangler deploy
node scripts/trial-key.mjs list      # the trial keys this account has issued
node scripts/trial-key.mjs exhaust   # drop the newest below its spend, to see the end
node scripts/trial-key.mjs restore   # put its limit back to $0.04
```

`npm run smoke` reads `OPENROUTER_API_KEY` from the repo-root `.env`. It checks
the client against the API rather than against the documentation — streaming,
usage accounting, error mapping and cancellation — and prints the free models
that currently exist, which is how default model ids get chosen.

The extension ID is pinned to `lbldodejinpgfnoaficdhaglkbhnkmlb`, because the
OAuth redirect URL embeds it. Do not regenerate the key in `.keys/`.

### Loading a build by hand

```
chrome://extensions → Developer mode → Load unpacked → extension/.output/chrome-mv3
```

Then open a video with comments and press **AI reply**. The card offers the free
trial; the settings page also takes an OpenRouter account or a pasted key.

To take the trial again on an install that has had one, clear its record in the
service worker console — `trial.claimed` is what hides the button, and the
options tab has to be reloaded because it reads that once, on mount:

```js
await chrome.storage.local.remove(['openrouter.apiKey','trial.installId','trial.claimed','trial.keyIsOurs','trial.spent']);
```

Test video: <https://www.youtube.com/watch?v=5ViTG9HrtFk>
