# Chrome Web Store Listing — Reply AI

> Last updated: 2026-08-18 · first submission, version 1.0.0

Everything the Web Store dashboard asks for, written out so the submission is a
copy-and-paste rather than a writing session. Two rules govern edits:

1. **Every claim here has to be true of the built extension.** "Does not provide
   the functionality described" is a rejection, and so is a feature named here
   that is still on the roadmap.
2. **This file and `/privacy` have to agree field by field.** The data
   disclosure below is the same set of facts as the privacy policy, in the
   dashboard's vocabulary. A policy that says less than the form is the classic
   rejection.

---

## Store Listing

**Extension Name** [REQUIRED] — 42 chars, limit 75

```
Reply AI — AI replies for YouTube comments
```

Google's YouTube branding guidelines: *"You must never use the YouTube name or
any abbreviation, acronym, or variant of the word YouTube... in conjunction with
the overall name of your application"*, while *"a great app for YouTube"* is the
phrasing they allow for describing the relationship. The `for YouTube` form is
deliberate, and the same string is in `extension/wxt.config.ts`.

**Short Description** [REQUIRED] — 103 chars, limit 132

```
Draft replies to YouTube comments in your own voice. Free trial included, then your own OpenRouter key.
```

Matches `manifest.description` exactly.

**Detailed Description** [REQUIRED] — plain text, the store strips markdown

```
Reply AI drafts replies to the comments under your videos, in your own voice, and leaves the Reply button to you.

Open a comment on YouTube or in YouTube Studio, press the button in its toolbar, and a draft appears in a panel under the comment. Keep it, regenerate it, tell it what to change, or edit it by hand. Nothing is ever sent for you — the extension fills the reply box and stops there.

WHAT IT DOES
• Writes in your voice — you describe your channel and how you talk once, and every reply is written from that description
• Tones you control — friendly, humorous, engaging, brief, or your own, saved and renamed as you like
• Replies as the channel owner or as a viewer, depending on whose comments you are under
• Knows what it is answering — the comment, the thread it sits in, the video's title and channel, and its description when you want that much context
• Regenerate with a note — "shorter", "answer the question about pricing", anything — and the previous attempts are taken into account
• Any model on OpenRouter, from the cheapest to the newest, chosen in settings
• How far a reply may stray from the comment is a dial in the panel, not a setting you have to go and find
• Works in YouTube Studio and on watch pages, in light and dark themes

GETTING STARTED
1. Install, then open any video's comments on YouTube or in YouTube Studio
2. Press Try it free — you get a small trial allowance, about twenty replies, with no account and no card
3. Write a short description of your channel and your voice on the settings page
4. Press the reply button under a comment and edit the draft it gives you
5. When the trial runs out, connect your own OpenRouter account — replies then cost you roughly a fifth of a cent each, paid to OpenRouter, and there is no limit from us

PRICING
The extension is free and has no cap. Generation is billed by OpenRouter on your own key, at whatever the model you picked charges. The trial is ours, given once per install, and buys you around twenty replies so you can judge the tool before you sign up anywhere.

PRIVACY
No account, no analytics, no tracking. Your key, your channel description and your settings stay on your own machine. When you press generate, the comment you are replying to goes straight from your browser to OpenRouter on your key — it never passes through a server of ours, and no copy is kept anywhere. The full policy is at https://reply-ai.mikidev.app/privacy

PERMISSIONS
• YouTube and YouTube Studio pages — the button and the panel are drawn there, and reading the comment is how it reaches the panel
• openrouter.ai — where replies are generated, on your key
• api.mikidev.app — ours, contacted at most twice in the life of an install and only if you ask: once for the free trial key, once to turn a supporter code into a licence. Replies never go through it

SUPPORT
Bugs and ideas: https://github.com/MikiDevStudio/yt-reply-ai/issues
Email: privacy@mikidev.app

Version 1.0.0 — first public release.
```

**Category** [REQUIRED]

Confirm the exact wording in the dashboard dropdown — Google has renamed these
twice. The one to pick is the workflow/productivity one (currently *Workflow &
Planning*); the fallback if that is gone is *Social Networking*. Not *Fun*, not
*Developer Tools*.

**Single Purpose** [REQUIRED]

```
Drafts a reply to a YouTube comment in the channel owner's own voice and inserts it into YouTube's reply box for the user to review and send.
```

**Primary Language** [REQUIRED] — English

The extension's interface is English only (i18n is #16, not shipped). A listing
in a language the product does not speak is a complaint waiting to happen.

## Graphics & Assets

Everything drawn for the listing lives in `docs/store/`, which is exempt from
the repository's image rules because every file in it is published on the
listing anyway. The screenshots and the recording are the exception: they stay
on disk in `public/Screenshots/` and out of git, because they are large, they
are remade rather than edited, and the store publishes them for us.

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `extension/public/icon/128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `public/Screenshots/1.png` — the panel open under a real comment, with the settings beside it |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | `public/Screenshots/2.png` — the three steps: pick a comment, generate, insert |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | `public/Screenshots/3.png` — the soul profile and the tone presets |
| Screenshot 4 | 1280×800 | ✅ Ready | `public/Screenshots/4.png` — the trial key, and connecting an account of your own |
| Screenshot 5 | 1280×800 | — | Four is enough; the store shows five at most and the first is the one that matters |
| Demo video | YouTube URL | 🟡 Recorded, not uploaded | `public/Screenshots/Generate and insert comment.mp4`, 10s. The dashboard field takes a YouTube link, not a file, so it has to go on a channel first |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `docs/store/promo-tile-440x280.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | Only used if Google features the item; skipped on purpose |

Not a Store asset but the same job elsewhere: the site's link preview,
`landing/public/og.png` at 1200×630, declared in `landing/src/layouts/Base.astro`.

### Screenshot Notes

Order matters — the first one is what appears in search. What each should show:

1. **The panel open under a real comment**, with a finished reply in it. This is
   the product; everything else is support material.
2. **The tone row**, mid-choice, so the "in your own voice" claim has a picture.
3. **The soul profile on the settings page**, filled in with real text — it
   answers "how does it know my voice" before anyone asks.
4. **Regenerate with a note**, showing the instruction and the new draft.
5. **The model list in settings**, which makes "any model on OpenRouter" concrete.

Two constraints from policy: no fabricated ratings, install counts or "featured"
badges in the images, and no other company's branding beyond YouTube's own UI as
it appears in a normal screenshot. The shipped set keeps to the first; the one
place to watch on the second is the red YouTube mark used as a chip icon on
screenshot 1 — inside the browser mock it is a screenshot of their interface,
in a badge of ours it is their logo in our promotional material.

## Permissions Justification

Pasted one per field in the dashboard. Each one names the user-facing feature —
"required for functionality" is rejected.

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores the user's OpenRouter API key, the description of their channel and voice that replies are written from, and their settings (model, tone, context depth, creativity). All of it is written by the user and read only by this extension. The reply counter also lives here, so a milestone card is not shown twice on two machines. |
| `identity` | permissions | Used for one thing: the "Connect OpenRouter" button opens OpenRouter's own consent page through the browser's identity API and receives the API key it issues. The user's OpenRouter password is typed on OpenRouter's site and never reaches the extension. Without it the only way to get a key into the extension is copying and pasting one by hand. |
| `https://openrouter.ai/*` | host_permissions | Where every reply is generated. The extension sends the comment being replied to and the user's settings to OpenRouter's chat completions endpoint, on the user's own API key, when the user presses the button. It also reads OpenRouter's public model catalogue so the settings page can list the models the user may pick. |
| `https://api.mikidev.app/*` | host_permissions | Our own service, contacted at most twice in the life of an install and only when the user presses something. Once to issue the free trial key, if the user takes the trial: a random identifier the extension generated for itself is sent, and an OpenRouter key with a few cents on it comes back. Once to turn a supporter code into a licence, if the user has one. No comment text and no personal data are ever sent there, and generation never passes through it. |
| `*://www.youtube.com/*`, `*://studio.youtube.com/*` | content scripts | The two pages the interface is drawn on. The extension adds a button to a comment's toolbar and opens a panel under it, reads the comment being replied to (and the video's title, channel and description) so the model has something to answer, and writes the finished draft into YouTube's reply box. Nothing is read until the user opens a comment's panel, and nothing is ever submitted — pressing Reply stays with the user. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes — two categories, both listed
below. Nothing is collected by us in the ordinary sense of the word: the data
below leaves the device only towards OpenRouter, on the user's own key, at the
user's press. The form has no square for that distinction, so both are declared.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | — | — | — |
| Health info | No | — | — | — |
| Financial info | No | — | — | — |
| **Authentication info** | **Yes** | Yes — to openrouter.ai only | The user's OpenRouter API key, stored locally and sent as the authorisation header on their own generation requests | No |
| Personal communications | No | — | — | — |
| Location | No | — | — | — |
| Web history | No | — | — | — |
| User activity | No | — | — | — |
| **Website content** | **Yes** | Yes — to openrouter.ai only | The text of the comment being replied to and its author's public display name, the thread's opening comment, and the video's title, channel and (at the deepest context setting) description — sent so the model can write a relevant reply, at the moment the user presses the button | No |

Notes that belong in the dashboard's free-text box if it offers one, and in this
file either way:

- The trial sends **a random identifier the extension generates for itself** to
  `api.mikidev.app`, once per install, only if the user presses "Try it free".
  It is not derived from anything about the person or the machine, it is stored
  in local storage, and it identifies nothing outside the trial ledger. No
  comment text ever reaches that service.
- `chrome.storage.sync` carries exactly two items — the reply counter and the
  supporter licence — which means Google's sync servers see them. Neither
  contains comment text, an email address or a key. Declared here because
  "remember that `chrome.storage.sync` transmits data to Google's servers" is a
  documented mismatch trap.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

```
https://reply-ai.mikidev.app/privacy
```

Public, no login wall, and written to be checkable line by line against the
source. Source of the page: `landing/src/pages/privacy.astro`.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED] — the name on the developer account (confirm in the dashboard)

**Contact Email** [REQUIRED] — `privacy@mikidev.app`

Displayed publicly on the listing, the same address as on the privacy policy.
It has to actually deliver before submission: a dead contact link is grounds for
rejection on its own.

**Support URL** [RECOMMENDED] — `https://github.com/MikiDevStudio/yt-reply-ai/issues`

**Homepage URL** [RECOMMENDED] — `https://reply-ai.mikidev.app`

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-08-18 | First submission | Draft |

## Review Notes

### Known Issues / Limitations

- **Nothing posts automatically.** The last thing the extension does is fill
  YouTube's reply box; pressing Reply is the user's. This is the single largest
  rejection risk for a tool in this category (automated engagement). The
  description says it twice on purpose — the dashboard has no free-form note to
  the reviewer, so the listing copy is the only place to say it.
- **No remote code.** Everything executable ships in the package. Model output
  is displayed and inserted as text and is never evaluated. No CDN scripts — the
  Buy Me a Coffee button is redrawn locally for exactly this reason.
- **The review prompt does not gate.** Every 40 replies the extension asks how
  it is going and offers both a review link and a bug report. The stars pressed
  change which road is emphasised and nothing else; four stars are not routed to
  the Store and two to a support form. That pattern is rating manipulation and
  the cost of it is the listing.
- **Nothing is offered in exchange for a review.** Supporter codes go out for
  videos, posts and mentions, never for ratings.
- **The trial is capped by us at a few cents per install**, so an install cannot
  cost more than that even if the key is abused.
- **The store-assigned ID is not known until the first upload.** Production
  builds ship without a `key` in the manifest on purpose. After the item is
  created, the assigned ID goes into `extension/lib/feedback.ts` and
  `landing/src/lib/links.ts`, both `IN_STORE` flags flip to `true`, and that
  goes out as the next version.

### Rejection History

None yet.
