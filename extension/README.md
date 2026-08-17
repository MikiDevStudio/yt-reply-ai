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

## Daily quota

The free tier covers 50 replies a day (`lib/quota.ts`). The unit is a comment,
not a button press: the first generation against a comment spends one, every
regeneration of that same comment is free. Comments are identified by
`commentKey` — FNV-1a over author plus text — which the background derives
itself from what the content script sent, so the two cannot disagree about what
is being charged.

A comment is charged after its reply arrives, never before it is asked for: a
request that failed, timed out or came back empty produced nothing to charge
for. The cap refuses before the network, so a blocked reply does not spend the
user's own OpenRouter credit either.

The record is `{ date, comments[] }` in `storage.sync`, where the list's length
*is* the count. `sync` rides the Chrome profile, so the counter survives a
reinstall and follows the user to a second machine, and degrades to local
storage by itself when sync is off. The stored local date is what resets it —
not a timer — so a service worker that slept through midnight, or a flight that
moves the date either way, can only ever ignore a stale count, never resurrect
one.

Anyone with devtools can reset it. That is accepted, not overlooked: nothing
shipped to the user's machine can be protected, and the cap exists to measure
demand rather than to enforce anything. See the project decision log, which is
kept outside this repository.

## Failure states

Every failure carries a message written for the user and at least one thing to
press. The rule is enforced by shape rather than by review: `lib/failure.ts`
maps each kind to its copy through a `Record<FailureKind, Failure>`, so a new
kind does not compile until someone decides what it says and what it offers.

The split is deliberate. The background worker sends facts — the kind, whatever
OpenRouter said, whether a key was stored, which rate limit applies — and the UI
turns them into words, so the popover, the popup and the settings page cannot
drift apart on the same 402. `components/FailureNotice.tsx` renders them all.

One state is ours rather than OpenRouter's: `quota`, the daily cap above. It is
also the only place a Pro line appears, because lifting our own cap is the only
thing Pro would actually do about a limit — the OpenRouter 429 belongs to the
user's own key and carries no upsell at all.

Pro is unbuilt, so every entry point opens a waitlist page instead (`lib/pro.ts`).
The URL is the whole contract with that page:

| Parameter | Meaning |
|---|---|
| `from=settings` | Curiosity — the popup link or the Pro section |
| `from=limit` | Someone stopped mid-work by the daily cap |
| `want=cap,scanner,bulk,presets` | Features ticked in the Pro section, by `PRO_FEATURES` id |

The ballot is filled in here and carried there, so the page arrives pre-ticked
and only an email is left to type. Nothing is posted from the extension: the
user presses a link, the choices are visible in the address bar, and the
manifest stays free of any host but openrouter.ai.

Two facts only the worker can supply, both gathered when the failure happens
rather than in advance: whether the model in use is a free variant, and whether
the account has ever bought credits (`is_free_tier` from `GET /key`). Together
they decide which of OpenRouter's caps to name — 20 requests a minute always,
plus 50 a day below $10 of lifetime credit and 1,000 at or above it.
