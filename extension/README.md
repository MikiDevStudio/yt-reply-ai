# Reply AI — YouTube Comment Assistant

Chrome extension (WXT + React) that drafts replies to YouTube comments in the
channel owner's voice. Generation runs through the user's own OpenRouter
account; the extension never posts anything — it fills YouTube's reply box and
leaves the send button to the user.

## Development

```sh
npm run dev       # load .output/chrome-mv3-dev as an unpacked extension
npm run build     # production build
npm run compile   # typecheck
npm run smoke     # end-to-end call against OpenRouter, needs a stored key
```

## Context levels

How much goes into each prompt is the user's choice, set on the options page.
Token counts are rough: a comment and a soul profile of ordinary length.

| Level | Adds | Prompt size |
|---|---|---|
| L0 | comment + soul profile | ~300 tokens |
| L1 | video title, channel, and the thread's opening comment | ~500 tokens |
| L2 | video description | ~800 tokens |

The description is scraped once per video and cached in `session` storage, so
every comment on that video reuses the same text — which also keeps the prompt
prefix stable for provider-side caching.

Everything is scraped from the rendered page. There is no YouTube Data API key
and no quota to run out of; the cost is that `entrypoints/content/youtube-dom.ts`
depends on YouTube's DOM, which is why every selector lives in that one file.

## Failure states

Every failure carries a message written for the user and at least one thing to
press. The rule is enforced by shape rather than by review: `lib/failure.ts`
maps each kind to its copy through a `Record<FailureKind, Failure>`, so a new
kind does not compile until someone decides what it says and what it offers.

The split is deliberate. The background worker sends facts — the kind, whatever
OpenRouter said, whether a key was stored, which rate limit applies — and the UI
turns them into words, so the popover, the popup and the settings page cannot
drift apart on the same 402. `components/FailureNotice.tsx` renders them all.

Two facts only the worker can supply, both gathered when the failure happens
rather than in advance: whether the model in use is a free variant, and whether
the account has ever bought credits (`is_free_tier` from `GET /key`). Together
they decide which of OpenRouter's caps to name — 20 requests a minute always,
plus 50 a day below $10 of lifetime credit and 1,000 at or above it.
