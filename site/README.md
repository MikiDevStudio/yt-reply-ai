# The website

Three static pages, no build step, no dependencies, no external request of any
kind. Copy the directory to any host and it works.

| Path | File | Why it exists |
|---|---|---|
| `/` | `index.html` | A holding page. The real landing — walkthrough, install button — is #34 |
| `/pro` | `pro/index.html` | The waitlist and the feature vote (#32). The only place an address is typed |
| `/privacy` | `privacy/index.html` | Required by the Web Store listing (#17), because the extension stores an API key |

`/pro` and `/privacy` are directories with an `index.html`, not `pro.html`. That
is deliberate: the URL shipped inside the extension is `…/pro` with no extension,
and a directory resolves under any static server without rewrite rules.

## Serving it

Live at **https://reply-ai.mikidev.app**, served by nginx with no build command:
document root is this directory, the branch is `main`, and a push does not
redeploy on its own — the host is told to pull.

One deployment lesson worth keeping, because the failure is misleading: the DNS
record has to bypass Cloudflare's proxy. The zone has a proxied wildcard, and
behind the orange cloud the certificate challenge cannot complete — that state
answers `525`, which reads like a broken site rather than a missing one.

`/pro` and `/privacy` resolve without a trailing slash, and an unknown path
returns nginx's 404 — verified against the live host, not assumed.

## The one hardcoded pair

`pro/index.html` names two webhooks at the top of its script, one to submit the
form and one to read the public tally. Both have to be live, and their CORS
origin has to match the host this page is served from. Until then the form shows
its retry message, which is the correct behaviour but a poor first impression —
so the page should not be linked publicly before the automation behind it runs.

## No third-party anything

The privacy policy served from this same directory promises no cookies and no
third-party scripts, so the pages carry none: no CDN, no font host, no analytics
vendor, no remote images. The tick in a checkbox is drawn with two borders rather
than fetched.

If analytics is added later it has to be self-hosted and cookieless, and the
privacy page has to gain a sentence about it in the same change — a policy that
is missing something is worse than one that never claimed it.

## When the name changes

Everything that names the product is plain text in these files. A rename touches
the `<title>` and the wordmark on all three pages, plus the extension's own
`waitlistUrl` in `extension/lib/pro.ts` if the host moves with it.
