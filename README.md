# Reply AI — YouTube Comment Assistant

Chrome MV3 extension that generates replies to YouTube comments in the author's own voice.

Primary audience: **channel owners** answering their comment section. The popover can
already answer as a viewer instead — same voice, no speaking for the channel — but the
viewer's own entry point, a button in the "Add a comment" box, is still phase 2 (#19).

## Repository layout

```
extension/          the Chrome extension (WXT + React + TypeScript + Tailwind)
worker/             the Worker (Cloudflare) — trial keys, and licences
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
`https://api.mikidev.app/*`.** Never `<all_urls>`. The second is our Worker,
touched once per install for the trial and once more if that person buys a
licence; every generation goes straight to OpenRouter.

**Secrets live in `chrome.storage.local`, never `sync`.** `storage.sync` uploads to
Google's servers and caps at 8 KB per item / 100 KB total — a soul profile alone can
exceed that. Only small UI preferences go in `sync` — and the licence, which is
the one thing that is *supposed* to travel between a person's machines and names
nobody. No API key ever goes there, the trial's included.

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

A retry is not free. `reasoningFor` in `background.ts` sends `low` on the first attempt
and `medium` on every attempt after it — pressing the button again says the obvious
answer missed, and finding a different one is the work thinking pays for. Free models
stay at `low` throughout, since their cost is a request quota rather than tokens.

**A reply costs about $0.002** on `gemini-3.6-flash`, measured at the effort the first
attempt actually sends: `npm run measure` re-runs it over four comments and prints the
mean. That is the number to quote wherever a price per reply is quoted — the trial's
$0.04 limit is thirty of them, and the landing page and the onboarding copy say the same
figure. The older $0.0003 in `lib/models.ts` was measured at `minimal`, which the product
does not send; a retry at `medium` costs several times the first reply and has not been
re-measured since the tier changed.

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
capped at $0.04, which is about twenty replies. What leaves the machine is one
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
| Trial | our own capped key, ~20 replies, no account | the Worker |
| Free | OpenRouter OAuth, `:free` models (OpenRouter's own 50/day) | none |
| BYOK | same OAuth, paid models, user pays OpenRouter directly | none |
| Licence | a gift code: the coffee card never appears again. Not for sale | the Worker, once |
| Pro | provisioned OpenRouter key with a spend limit, profile sync, bulk mode | minimal |

**We impose no limit of our own.** A daily cap of 50 replies shipped and was
removed: the only thing it measured was how many people it stopped. What is
left is a counter (`extension/lib/replies.ts`) that gates nothing and drives
two asks at the foot of the reply popover, both of them out of the way of the
reply itself: every fifty replies a card saying thank you with a Buy Me a Coffee
button, and every forty a block asking how it is going — which anybody ends for
good with its own button, whether or not they have paid anything. The popover's
action row carries a small standing coffee button, which is what lets the card
be rare. That is the whole of the ask, and Supporter is the whole of what is for
sale.

**Nothing is sold, and that is a design decision rather than a stage.** A coffee
buys nothing: it unlocks no tier, silences no card and changes nothing about the
extension for the person who pressed it. The moment it did any of those, it would
stop being a donation and become a supply for consideration — with VAT, a Trader
declaration on the Store listing and a statutory right of withdrawal attached to
it. Three shapes that would have crossed that line were designed and dropped: a
$12 tier, "any coffee returns a code", and "a coffee stops the card appearing".

**Licence codes exist, and they are gifts.** They go out in giveaways under promo
videos and by hand, at nobody's entitlement; a code switches the coffee card off
and stops that button glowing, and later unlocks multiple soul profiles
(#12) and profile export (#33). It deliberately does not silence the review
block: a review attached to a gift is not one worth having. The
three conditions that keep this a gift rather than a sale: it is offered nowhere,
it is never guaranteed in exchange for money, and the extension behaves
identically for everyone who has not been given one.

The mechanism is in `worker/README.md`, and the two things worth knowing here are
that **an activated licence never contacts us again** — it is verified against a
public key that ships in the extension, so shutting the Worker down cannot take
one back — and that **nothing on our side can say who has one**. See
`extension/lib/licence.ts` and `worker/src/licences.ts`.

`worker/src/bmc.ts` turns a Buy Me a Coffee purchase into a code automatically.
**It is finished, tested and deliberately not wired up** — no webhook exists in
their dashboard — because wiring it is precisely what would make a coffee a
purchase. It is kept for the day selling is set up properly, and that day needs a
merchant of record: Buy Me a Coffee is explicitly not one.

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
