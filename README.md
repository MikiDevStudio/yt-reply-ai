# Reply AI — YouTube Comment Assistant

Chrome MV3 extension that generates replies to YouTube comments in the author's own voice.

Primary audience: **channel owners** answering their comment section. A viewer-facing
mode (write/improve a comment under a video) is planned for phase 2.

## Repository layout

```
extension/          the Chrome extension (WXT + React + TypeScript + Tailwind)
docs/               design notes and decisions
```

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

**`host_permissions` is scoped to `https://openrouter.ai/*`.** Never `<all_urls>`.

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

The video-level context is fetched once per `videoId`, cached in `storage.session`, and
reused across every comment on that video. With OpenRouter's prompt-caching pass-through
the shared prefix is billed at 0.1–0.25× on repeat calls. Note the provider minimum of
1024 tokens (4096 for Gemini 2.5 Pro) — caching only engages at L2.

Video metadata is scraped from the page, not fetched from the YouTube Data API: no extra
key, no quota.

## Monetisation

| Tier | What | Backend needed |
|---|---|---|
| Free | OpenRouter OAuth, `:free` models (50 req/day) | none |
| BYOK | same OAuth, paid models, user pays OpenRouter directly | none |
| Pro | provisioned OpenRouter key with a spend limit, profile sync, bulk mode | minimal |

v1 ships the first two tiers with **no server at all**. Pro uses OpenRouter's
provisioning API (`POST /api/v1/keys` with `limit`) so quota enforcement happens
upstream — our backend only turns a payment into a capped key.

Chrome Web Store's built-in payments are discontinued; billing must be external.

## Development

```bash
cd extension
npm install
npm run dev       # launches Chrome with the extension loaded
npm run build
npm run compile   # typecheck
```

Test video: <https://www.youtube.com/watch?v=5ViTG9HrtFk>
