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
