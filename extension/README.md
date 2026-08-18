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

## The reply counter

**There is no cap.** There was one — 50 replies a day — and it was removed in
full: it stopped people in the middle of a comment section, which is the one
moment the tool is worth having, and what it measured was how many of them gave
up. `lib/replies.ts` is what is left, and it refuses nothing.

The unit is still a comment, not a button press: the first generation against a
comment counts, every regeneration of that same comment is free. Comments are
identified by `commentKey` — FNV-1a over author plus text — which the background
derives itself from what the content script sent, so the two cannot disagree
about what is being counted. A comment counts after its reply arrives, never
before it is asked for.

The record is `{ date, comments[], today, total, nudgedAt, reviewedAt, reviewDone }`
in `storage.sync`.
`comments` is a bounded window of the last 200 keys — with no cap to bound it
the list would otherwise grow past what a `sync` item may hold — so `today` and
`total` are counters of their own rather than a list length. `sync` rides the
Chrome profile, so the count survives a reinstall and follows the user to a
second machine, and degrades to local storage by itself when sync is off. The
stored local date is what resets the daily figure — not a timer — so a service
worker that slept through midnight can only ignore a stale count, never
resurrect one.

The last three fields are the whole of the counter's remaining job, and they
drive two separate asks (#45).

**The coffee card**, every `NUDGE_EVERY` (50) replies. The worker claims a
milestone with `takeNudge()` and sends it on the `done` message; `ReplyPopover`
renders `components/SupportCard.tsx` **at the foot of the popover**, under the
finished reply and under the action row. It used to be a modal at every
twentieth reply with the page dimmed behind it, which was right while the card
was also the thing a licence switched off — the interruption was the price of a
free, uncapped tool. #39 ended that: a coffee buys nothing, so the interruption
bought nothing either. Rare *and* out of the way, because rare and modal is
still modal.

**The review block**, every `REVIEW_EVERY` (40) replies until it is answered.
`takeReview()` claims it the same way and the `done` message carries `review:
true`. `components/ReviewAsk.tsx` draws five stars and both roads out — the
Store listing (a GitHub star until `IN_STORE` flips in `lib/feedback.ts`) and a
bug report. The stars only decide which road is emphasised: routing four stars
to the Store and two to a support form is review gating, which Play and the App
Store ban outright and the Web Store's rating-manipulation policy reaches, and
the cost of getting it wrong is the listing. Its two buttons — "I left one" and
"not interested" — both set `reviewDone` and end it for good. That is
self-reported and unverifiable on purpose: the Chrome Web Store exposes no
signal for whether a review was left, unlike Play and the App Store, so
"ask again only if they have not reviewed" cannot be built.

`takeReview()` is passed whether a card is already going up, so the two never
land on the same reply — with 40 and 50 they collide only at 200 anyway.

Claiming happens in the worker because that is the only single writer — both
functions ask and claim in one call, so two tabs finishing together cannot both
raise one, and counting runs *before* `done` is posted so the message can carry
the result. `settings.supportNudges` is the flag a paid plan flips, read by the
worker so a user who has it off never burns a milestone; it governs the coffee
card alone, and a licence deliberately does **not** silence the review block —
a review attached to a gift is not one worth having. Every route out of either
block is an ordinary link the user presses. Nothing is counted, no star is
stored, and nothing is sent.

## Failure states

Every failure carries a message written for the user and at least one thing to
press. The rule is enforced by shape rather than by review: `lib/failure.ts`
maps each kind to its copy through a `Record<FailureKind, Failure>`, so a new
kind does not compile until someone decides what it says and what it offers.

The split is deliberate. The background worker sends facts — the kind, whatever
OpenRouter said, whether a key was stored, which rate limit applies — and the UI
turns them into words, so the popover, the popup and the settings page cannot
drift apart on the same 402. `components/FailureNotice.tsx` renders them all.

Every state is OpenRouter's or the browser's. There used to be one of our own —
`quota`, for the daily cap — and it was the only place a Pro line appeared;
both went with the cap. No failure in this extension now advertises anything.

Pro is unbuilt, so every entry point opens a waitlist page instead (`lib/pro.ts`).
The URL is the whole contract with that page:

| Parameter | Meaning |
|---|---|
| `from=settings` | The ballot on the Pro section, cast after reading it |
| `from=popup` | The one-line link in the toolbar popup, clicked in passing |
| `from=nudge` | A click from the coffee card, once in fifty replies — the rarest of the three, and so the strongest |
| `want=managed,scanner,bulk,presets` | Features ticked in the Pro section, by `PRO_FEATURES` id |

The ballot is filled in here and carried there, so the page arrives pre-ticked
and only an email is left to type. Nothing is posted from the extension: the
user presses a link, the choices are visible in the address bar, and the
manifest stays free of any host but openrouter.ai.

Two facts only the worker can supply, both gathered when the failure happens
rather than in advance: whether the model in use is a free variant, and whether
the account has ever bought credits (`is_free_tier` from `GET /key`). Together
they decide which of OpenRouter's caps to name — 20 requests a minute always,
plus 50 a day below $10 of lifetime credit and 1,000 at or above it.
