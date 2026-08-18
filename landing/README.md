# The website

Astro 7 + Tailwind 4, static output, no client framework. Five pages:

| Path | Source | Why it exists |
|---|---|---|
| `/` | `src/pages/index.astro` | The landing page: what the extension is, what the panel does, what it costs |
| `/pro` | `src/pages/pro.astro` | The waitlist and the feature vote (#32). The only place an address is typed |
| `/privacy` | `src/pages/privacy.astro` | Required by the Web Store listing (#17), because the extension stores an API key |
| `/feedback` | `src/pages/feedback.astro` | Where the thank-you card's two answers land. Reads `?rating=`, records nothing |
| 404 | `src/pages/404.astro` | Served by nginx once it is told to (`error_page 404 /404.html`) |

## Build output is committed

```
landing/     source — edit here
site/        build output — committed, and what the host serves
```

`npm run build` writes into `../site` and **empties it first**. The output is
committed on purpose: Coolify's static build pack is pointed at `/site` on
branch `main`, so a deploy is a pull with no Node on the host and no build
step to go wrong at three in the morning. The cost is a diff of generated HTML
in every commit that touches the site, which is the cheaper half of that trade.

Anything hand-written that has to survive a build belongs in `public/` — it is
copied into the output verbatim. That is where `robots.txt`, `sitemap.txt`, the
favicon and the "this directory is generated" notice live.

```bash
cd landing
npm install
npm run dev      # localhost:4321, hot reload
npm run build    # writes ../site
npm run check    # astro check — types and template errors
```

## Deploying

Live at **https://reply-ai.mikidev.app**. Coolify project `Reply AI`, app
`reply-ai-site`, build pack `static`, base directory `/site`, branch `main`.
There is no GitHub webhook — the host is told to pull.

One deployment lesson worth keeping, because the failure is misleading: the DNS
record has to bypass Cloudflare's proxy. The zone has a proxied wildcard, and
behind the orange cloud the certificate challenge cannot complete — that state
answers `525`, which reads like a broken site rather than a missing one.

URLs are directories (`build.format: 'directory'`), so `/pro` and `/privacy`
resolve without a trailing slash and without rewrite rules. That matters: those
two URLs are shipped inside installed copies of the extension.

## No third-party anything

The privacy policy served from this same site promises no cookies and no
third-party scripts, so the pages carry none: no CDN, no font host, no
analytics vendor, no remote images. Consequences worth knowing before adding
something:

- **Fonts are bundled**, latin only, from `@fontsource-variable/*` — declared by
  hand in `src/styles/global.css` rather than imported, because the package's
  own stylesheet pulls in every subset it ships and each one would land in
  `site/` as a committed file nothing asks for.
- **Buy Me a Coffee's button is redrawn locally** (`src/components/CoffeeButton.astro`).
  Their embed is a remote script that also loads a display face from a font
  host. Their colours are kept exactly; only the face is ours.
- **The only outbound calls are the two n8n webhooks on `/pro`**, and both are
  the user pressing a button. Their CORS origin is the production host, so the
  tally quietly does nothing when the page is opened from localhost — that is
  the endpoint refusing an unknown origin, not a bug on this side.

If analytics is ever added it has to be self-hosted and cookieless, and the
privacy page has to gain a sentence about it in the same change — a policy that
is missing something is worse than one that never claimed it.

## Design

`docs/brand.md` is the standard, and `src/styles/global.css` is its half of the
site: the same tokens, the same names, the same values as the extension. Two
deliberate departures, both documented in that file:

- **Dark only.** The extension ships two themes because it renders inside
  YouTube, whose dark mode is a site setting. This site follows nobody, and the
  animated background has no honest light-theme equivalent.
- **A moving background** (`src/components/Backdrop.astro`) — three blurred
  fields on the accent and the violet, under 22% opacity, drifting over half a
  minute, plus grain to stop them banding on an 8-bit panel. It is the only
  decoration in the system and it stops entirely under
  `prefers-reduced-motion`.

The product panel in the hero (`src/components/PopoverMock.astro`) is HTML, not
a screenshot: it is built from the same tokens as the real one, so it cannot go
stale in the way an image does, and it costs a few hundred bytes instead of a
few hundred kilobytes.

## When the name changes

Everything that names the product is plain text: the `<title>` on each page, the
wordmark in `src/components/Masthead.astro`, the footer, and the extension's own
`waitlistUrl` in `extension/lib/pro.ts` if the host moves with it. The store
links and the "is it published yet" flag are all in `src/lib/links.ts` — flip
`IN_STORE` the day the listing goes live and every install button on the site
changes with it.
