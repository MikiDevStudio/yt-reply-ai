# Reply AI — brand book

Style source: [caveman.so](https://caveman.so/). The values below were lifted from
their production CSS (Tailwind + shadcn, dark theme) and from the landing markup —
not eyeballed. This document is the single standard for every surface we ship: the
popover injected into YouTube, the settings page, the popup, and the button in
Studio's comment inbox.

The idea in one line: **a near-black ground, hairlines instead of shadows, sharp
corners, one orange accent, and typography as the carrier of hierarchy.** No
decoration — contrast, emptiness and opacity do the work.

Two things separate us from the source and shape everything that follows:

1. **We render inside someone else's page.** The popover sits over YouTube's own
   comment thread, so it must read as ours without shouting over the host, and it
   must never be mistaken for a YouTube control.
2. **We ship two themes.** YouTube's dark mode is a site setting, not an OS setting,
   so `prefers-color-scheme` is the wrong signal — we follow the `dark` attribute on
   `<html>` (`entrypoints/content/theme.ts`). The source style is dark-only; the light
   palette here is the same system with the ink ladder inverted.

---

## 1. Colour

Every token below has a dark and a light value. Component rules are written once,
against the token — never against a literal.

### Surfaces

| Token | Dark | Light | Where |
|---|---|---|---|
| `--bg` | `#050505` | `#FFFFFF` | page ground of our own pages, lowest layer |
| `--surface` | `#08090B` | `#FAFAFA` | card, panel, block hover |
| `--surface-hi` | `#0E0F10` | `#F4F4F5` | sidebar, quoted comment, inner panel |
| `--overlay` | `#161718` | `#FFFFFF` | the popover, dropdowns, menus |

The steps between layers are deliberately tiny (3–9 units of brightness in dark). Layers
are separated by a **border**, not by a fill.

`--overlay` is the one layer that must clear the host page: YouTube's dark ground is
`#0F0F0F`, so the popover sits a hair above it, and on light YouTube it stays pure white
against `#FFFFFF` and is defined by its border and shadow alone.

### Borders

Always a single 1px line, white with low alpha on dark, black with low alpha on light:

| Token | Dark | Light | Where |
|---|---|---|---|
| `--line` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.10)` | base line: dividers, card frames |
| `--line-soft` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.07)` | inner divisions, secondary |
| `--line-hi` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.16)` | active/hover element, focused field |
| `--line-input` | `#2D3034` | `#D4D4D8` | input border at rest |

### Text — the opacity ladder

Text colour is set **by alpha over the base ink, not by separate colours**. This is the
key move: the whole hierarchy runs on one scale, which is also why it survives the theme
flip unchanged.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--ink` | `#FFFFFF` | `#0B0B0B` | headings, key numbers |
| `--ink-92` | `.92` | `.88` | body text inside a card |
| `--ink-70` | `.70` | `.72` | menu items, active links |
| `--ink-55` | `.55` | `.58` | second half of a heading, navigation |
| `--ink-45` | `.45` | `.50` | descriptions, subtitles |
| `--ink-40` | `.40` | `.45` | `font-mono` micro-labels |
| `--ink-28` | `.28` | `.34` | disabled, footnotes, "empty" |
| `--ink-22` | `.22` | `.28` | quietest layer, watermarks |

Light alphas run slightly heavier because black on white reads lighter than white on
black at the same value.

Heading trick: first part `--ink`, second `--ink-55`. Example: **AI reply** _in your
voice._ One sentence, two weights of attention, no second colour.

### Accents

| Token | Dark | Light | Role |
|---|---|---|---|
| `--accent` | `#FF8A3D` | `#B0590C` | the accent: section numbers, active step, success, "done" |
| `--accent-line` | `rgba(255,138,61,0.65)` | `rgba(176,89,12,0.55)` | marker outlines, selected chip frame |
| `--accent-soft` | `rgba(255,138,61,0.10)` | `rgba(176,89,12,0.08)` | active-state backing, selection fill |
| `--accent-bright` | `#FF7A18` | `#8F4708` | focus ring, the "generating" dot |
| `--violet` | `#9D9BEA` | `#5A4FCF` | second accent: model ids, prompts, everything machine-side |
| `--warning` | `#F2C94C` | `#A16207` | warning, "low credits", not connected |
| `--danger` | `#EB5656` | `#B91C1C` | error, destructive action |
| `--solid` | `#E9E9EC` | `#171717` | fill of the one primary button |
| `--solid-ink` | `#0B0B0B` | `#FAFAFA` | text on `--solid` |
| `--connected` | `#5FD39A` | `#15803D` | **the one exception below:** a live connection |

`--connected` is the single green in the interface, and it exists for one thing:
the popup's connection status. It is deliberately not the same signal as "done" —
"done" is about a reply we just produced and stays the accent, while this is about
a link to someone else's service being up, which every other tool in the world
draws green. The values are the categorical green already in the chart ramp, so
this adds a use, not a colour.

`--accent-bright` is the more insistent version of the accent: brighter on dark, deeper
on light. Same role either way.

`--accent-mark` (`#E2670F`, one value in both themes) is the exception that proves how
the other two work. Every colour above is written per theme because we know the ground
it will land on. The mark does not get that: one PNG has to hold up on the Web Store's
white card, on a light Chrome toolbar and on a dark one, and neither accent value spans
that — `#FF8A3D` is 2.35:1 on white, `#B0590C` is 2.92:1 on Chrome's dark toolbar. Each
fails the ground the other was not written for. `#E2670F` sits between them and clears
3:1 on all of them, so the icon needs no tile of its own and reads as a shape rather
than a dark square. It is used **only** for the mark — nothing in the interface borrows
it, the same way nothing borrows the Buy Me a Coffee yellow. See `brand/README.md`.

Rule: **orange is never poured over large areas.** It lives in 1px lines, 6px dots, 10px
text and outlines. The only large fill in the interface is the `--solid` button.

Contrast on the ground it sits on: accent 8.6:1 dark / 4.9:1 light, `--accent-bright`
7.7:1 dark, warning and danger above 4.5:1 in both themes. The 10px mono micro-label is
the smallest type we set in accent, and it clears AA at these values.

### Living next to YouTube

YouTube's own accent is red. Two rules keep us out of its way:

- The accent is **never** used on a filled pill, badge or button that could be mistaken
  for a YouTube control. Outline and text only.
- The button we inject into a comment toolbar takes its **box** from YouTube: background
  and label come from that site's own CSS custom properties
  (`--yt-spec-badge-chip-background`, `--yt-spec-text-primary`), which pierce the shadow
  root and track the user's theme for free. It is YouTube's furniture; everything that
  opens from it is ours.

  The single exception is the spark, which is `--accent`. Sitting in a row of YouTube's
  own controls in YouTube's own colours, the button was invisible — a month can pass
  before someone notices they installed anything. A 16px mark is the largest claim the
  accent may make here; the fill stays the host's, because a filled orange pill in
  someone else's toolbar reads as an advert rather than a tool.

### Someone else's furniture

The rule the injected button follows generalises, and it is the only way a colour from
outside this document may appear: **a third party's own mark keeps that party's colours.**
The Buy Me a Coffee cup is yellow because it is theirs — not because we have taken a
third accent. It is never restyled to fit us, and the yellow never leaves the mark or the
button that mark belongs to: nothing else in the interface may borrow it.

The one thing we do adjust is legibility: their asset outlines the cup in white, which is
invisible on our light theme, so the light copy takes that flat white to `--ink`. The
brand colour itself is untouched. Two files, swapped by `theme-dark:` / `theme-light:`.

The same rule now covers their whole **button** — `#FFDD00`, black outline, black label,
the cup in white — which is the one filled, rounded, coloured control in this interface
and the only place any surface of ours asks for money. It is drawn from their published
parameters rather than loaded from their CDN: MV3's CSP forbids remote code, and their
script also pulls a display face from a font host, which is a request we do not make
anywhere. Everything but that face is reproduced (`components/CoffeeButton.tsx`); the
words are theirs to configure and currently read *Buy me a coffee*.

The rule also settles where their yellow **stops**. The popover's action row carries a
small glowing coffee button (`components/CoffeeGlow.tsx`) that is deliberately *not* in
their colours: it is a 100px control in a row of ours, and dressing it in someone else's
brand would read as a badge bolted to our panel. It carries our accents over a near-black
ground, our own drawing of a cup, and the word *Coffee* — an ordinary outbound link to
their site rather than a copy of their button. Their button, undisguised and in their
yellow, still appears in the popup and in About, which is where the mark belongs.

That button keeps its own colours in both themes, exactly as their yellow one does — one
object recognisable at that size, not two that have to be learned separately. See §5 for
the loop and what stops it.

### Data and charts

Dark: `#FF8A3D` → `#9D9BEA` → `#0BC2DA` → `#5FD39A` → `#9097A2`

Light: `#B0590C` → `#5A4FCF` → `#0E7490` → `#15803D` → `#52525B`

Green survives here as a categorical hue only — it carries no meaning outside a chart.

---

## 2. Typography

### Families

| Role | Our own pages | Injected UI |
|---|---|---|
| Interface, headings | **Roboto** (local `woff2`) | **Roboto** (YouTube's own) |
| Micro-labels, numbers, statuses, model ids | **JetBrains Mono** | system mono (`ui-monospace`, Menlo, Consolas) |

One interface face across all three surfaces. This used to be a split — Inter for our
pages, Roboto only where YouTube already paid for it — and the split was the wrong call
for a product whose main surface is a panel inside YouTube: two grotesks that near-match
read as a mistake rather than a distinction, and the popover is what people look at most.
Same face everywhere, and the settings page is recognisably the same product as the panel.

Injected UI still costs no font bytes: YouTube loads Roboto itself, and an `@font-face`
declared in the host document reaches into our shadow root, so the popover inherits it and
never flashes.

Bundling a font into the content script is the thing we avoid: MV3's CSP blocks remote
fonts, so a bundled `woff2` would need `web_accessible_resources` and an absolute
`chrome-extension://` URL, because injected CSS text resolves relative `url()` against
the host page. That plumbing buys nothing here — the face is already on the page.

Our own pages have no such donor, so they carry the face themselves: Roboto and JetBrains
Mono as local `woff2`, latin and cyrillic subsets each, declared in `assets/fonts.css` and
imported by the popup and the settings page only. Cyrillic because the UI is localised
EN + RU — Geist, which the source uses, has no Cyrillic at all. (In caveman.so's CSS the
Geist variables are aliased to Inter and JetBrains Mono; the names are template leftovers.)

Both are the **variable** cuts. The scale below asks for 600 three times and static Roboto
ships 500 and 700 with nothing between, so every heading on our own pages would have been
rounded to the wrong weight or synthesised by the browser. One file per subset covers
100–900 instead. Four files, 119 kB in the package, and they load on two pages that open
by intent — not on every YouTube page.

Mono is not just for code. It carries the engineering register: section numbers, labels,
statuses, attempt counters, model ids, token costs.

### Scale

| Level | Size | Weight | Line height | Tracking |
|---|---|---|---|---|
| Settings page title | 24–28px | 600 | 1.1 | −0.02em |
| Section heading | 18–20px | 600 | 1.2 | −0.015em |
| Popover title | 16px | 600 | 1.2 | −0.01em |
| Block heading | 15px | 500 | 1.3 | 0 |
| Body | 15px (pages) / 14px (popover) | 400 | 1.6 | 0 |
| Secondary | 13px | 400 | 1.55 | 0 |
| **Micro-label** | **10px** | **500, `mono`, UPPERCASE** | **1** | **0.14–0.2em** |

The larger the text, the tighter the tracking; the smaller, the wider (up to +0.2em).
That contrast is what separates a heading from a service label.

The popover runs a step below our own pages and level with its host: 14px is exactly what
YouTube sets its own comment text at. It used to run a step below that too, on the
argument that a tool panel should defer to what the user is reading. Tried on a real
comment thread, the result was a panel of fine print sitting beside comfortably sized
comments — the deference read as an eye test. Matching the host is the better reading of
the same principle, and the popover widened from 420px to 460px to pay for it.

**Sizes inside the content script are written in px, never rem.** `rem` resolves against
the host document root and YouTube sets `html { font-size: 62.5% }`. The build step
(`build/rem-to-px.ts`) converts the generated content-script stylesheet, but an arbitrary
value written in markup (`w-[26rem]`) is emitted verbatim — write `w-[460px]`.

### The micro-label — our signature element

```html
<span class="font-mono text-[10px] font-medium tracking-[0.2em] text-accent">01</span>
<span aria-hidden class="h-px w-10 bg-accent"></span>
<span class="font-mono text-[10px] uppercase tracking-[0.14em] text-base-content/40">soul profile</span>
```

Two-digit number in orange + a 40px hairline + an uppercase label. It marks settings
sections, the groups inside them, and the blocks of the popover.

---

## 3. Form and space

### Radii

| Token | Value | Where |
|---|---|---|
| `--radius-block` | `0` (sharp) | cards, panels, buttons, inputs, the popover |
| `--radius-control` | `8px` | menu items, dropdowns, chips, the quoted-comment block |
| `--radius-pill` | `9999px` | toggles, status dots, avatars, rating dots |

Sharp by default. Rounding appears only where an element floats above a layer (menu,
dropdown) or where the control is natively round (toggle, radio, dot).

### Grid and spacing

4px step. Working values: 2 / 2.5 / 3 / 4 / 5 / 6 / 7 in Tailwind terms.

- Popover: `p-3`, `gap-3` between blocks, `gap-2` inside a row. Tight end of the scale.
- Settings card: `p-4` … `p-5`, `gap-6` between cards.
- Popup: `p-4`, `gap-4`, fixed `w-80`.
- **Card grids use `gap-px` over a `bg-line` backing**: cards sit flush and a hairline
  remains between them. That is the signature layout — use it for the model list.

### Shadows

Almost none. Exactly one is allowed, and only for things that float over a page we do
not own — the popover and dropdowns:

```
--shadow-elevated (dark):  0 1px 0 0 rgba(255,255,255,0.05), 0 2px 4px 0 rgba(0,0,0,0.4);
--shadow-elevated (light): 0 1px 0 0 rgba(0,0,0,0.04), 0 4px 16px 0 rgba(0,0,0,0.12);
```

Everywhere else depth comes from lines and opacity, not blur. The light shadow is wider
and softer because on white a tight dark shadow reads as dirt.

---

## 4. Components

### Buttons

| Variant | Style |
|---|---|
| **Primary** | `bg:--solid` · `text:--solid-ink` · 12–13px/500 · `px-4 py-2` · sharp · hover → full white / full black |
| **Secondary** | transparent · `border:--line-hi` · `text:--ink-70` · hover → `bg: rgba(ink,0.04)`, `text:--ink` |
| **Ghost** | text only `--ink-55` · hover → `--ink` |
| **Accent** | transparent · `border:--accent-line` · `text:--accent` · hover → `bg:--accent-soft` |
| **Danger** | text `--danger` · `border:` danger at 0.4 alpha |

**One solid button per surface.** In the popover that is *Generate* before the first
attempt, and *Insert* once a reply exists — the primary fill always marks the single
action the user came for. Retry, stop, copy and close are ghost icon buttons.

Focus: `outline: 1px solid --accent-bright; outline-offset: 2px`.

### Inputs

Background `--bg`, border `--line-input`, text 13–15px, placeholder `--ink-28`, sharp
corners, `px-3 py-2.5`. Focused border → `--accent-line`.

### Segmented control (reply audience, status filters)

A row of buttons sitting flush, divided by `--line`, wrapped in a `--line` frame. Active
segment: `bg:--accent-soft`, `text:--accent`, top border `--accent`. Label `font-mono`,
11px, uppercase.

Used for **Channel / Viewer** in the popover — the choice that decides whether we speak
for the channel, so it has to be readable at a glance.

### Chips (tone and angle)

Sharp, `px-2.5 py-1`, 12px. At rest: transparent, `border:--line`, `text:--ink-70`.
Selected: `border:--accent-line`, `text:--accent`, `bg:--accent-soft`. Never a filled
orange chip.

### Card

Background `--surface`, border `--line`, sharp, `p-4`. Hover: background step up one
layer, transition `background-color 150ms ease-out`. A micro-label sits at the top of the
card (number + rule + name). A card that folds away keeps the same frame when closed, so
a put-away control never reads as a missing one.

### The two asks

There is no modal in this system. There was one — the support card, raised over the
popover every twentieth reply with the page dimmed to `black/55` behind it — and #45
removed it. That shape was right while the card was also the thing a licence switched off:
the interruption was the price of a free, uncapped tool. It stopped being that, and rare
and modal is still modal.

Both asks are now **inner panels at the foot of the popover**, below the action row, after
everything the user came for: `bg:--surface-hi`, border `--line`, `p-3`, `gap-3`, entering
at 200ms rather than the popover's 120ms — they arrive unbidden, and something that
appears out of nowhere in 120ms reads as a glitch. No backdrop, no dimming, nothing
covered; the popover simply grows downwards.

**The coffee card** (`components/SupportCard.tsx`), every 50 replies: the signature label
carrying the count, a heading that states the number, one paragraph, their yellow button,
and a footer with the cadence and the line that turns it off. No question, no rating, no
"don't show again" — it is the only place any surface of ours asks for money, and the one
thing that removes it is a licence.

**The review block** (`components/ReviewAsk.tsx`), every 40 replies until it is answered:
five stars, one sentence that changes with the answer, and then *both* roads out — the
Store listing and a bug report — always in the same order, with only the weight changing
between outlined and plain. Its own two text buttons end it for good. A licence must never
silence this one, and the stars must never decide who sees the review link: see §4 Rating.

Neither holds anything. The reply is finished above them, every route out is an outbound
link, and nothing about a star is recorded — here or anywhere.

### The popover

Ground `--overlay`, border `--line-hi`, `--shadow-elevated`, sharp, `460px` wide,
`max-width: 90vw`. Blocks top to bottom, `gap-3`:

1. **Header** — title, language field, reset, close. Title `--ink`, everything else ghost.
2. **Quoted comment** — `bg:--surface-hi`, `--radius-control`, `text:--ink-55`, clamped to
   two lines. Author name at `--ink-70`, 500.
3. **Audience** — segmented control, plus the auto-generate toggle pushed to the right.
4. **Tone** — chip row.
5. **Note** — textarea, 2 rows, grows to 4 max.
6. **Result** — bordered box `--line`, min-height 80px, max 224px, then scrolls.
7. **Actions** — attempt pager on the left, action buttons on the right.

The result box never collapses between states. An empty box with a prompt in `--ink-45`,
a streaming box, and a finished box are the same rectangle — the popover must not resize
under the cursor while a reply streams in.

### Result states

| State | Result box | Actions |
|---|---|---|
| idle | `--ink-45`: "Pick a tone, then press Generate." | *Generate* solid |
| streaming | text streaming in at `--ink-92`, three pulsing dots in `--accent-bright` | *Stop* ghost |
| done | text `--ink-92` | *Insert* solid, retry + copy ghost |
| error | alert, `--danger`, with the one action that fixes it | *Retry* secondary |
| stopped | whatever arrived, `--ink-70` | *Generate* solid |

### Attempt pager

`‹ 2/3 ›` — mono, 12px, `--ink-55`, chevrons ghost. It appears only from the second
attempt on. Retries cost real money, so the count is stated, never hidden.

### Statuses

A 6px dot + a `font-mono` 10px uppercase label:

| Status | Dot | Label |
|---|---|---|
| empty | `--line-hi` | `EMPTY` |
| queued | `--warning` | `QUEUED` |
| generating | `--accent-bright`, pulsing | `WRITING` |
| done | `--accent` | `DONE` |
| failed | `--danger` | `FAILED` |
| not connected | `--warning` | `NO KEY` |

### Rating

Five 8px dots, `--radius-pill`. Filled `--accent`, empty `--line-hi`. No stars — a star is
a rating widget from another product; a dot is ours. Creativity is the only rating in the
interface that follows this.

**One exception, and only one:** the review block draws real stars, filled `--accent` and
empty at `--ink-28`. The other product is the entire point there — what is being asked for
*is* a star on a store page, and drawing it as a dot would hide what the ask is.

That block also carries a rule with a price on it. **The stars decide nothing.** Both
roads — the review and the bug report — render whatever the answer, and the rating only
changes which of the two is outlined and which is plain. Sending four stars to the Store
and two to a support form is review gating: Google Play and the App Store ban it outright,
and the Chrome Web Store's rating-manipulation policy reaches it. The cost of getting it
wrong is the listing. `/feedback` on the site draws its two columns the same way and for
the same reason.

### Settings page

Sidebar 224px: `bg:--surface`, right border `--line`, product name in `--ink` with
`YouTube comment assistant` under it at `--ink-45`. Nav items `--ink-70`, active item
`--accent` with an `--accent` left rule 2px and `bg:--accent-soft`.

Content column `max-width: 42rem`, `p-8`, cards stacked at `gap-6`. Each card opens with
its micro-label, and the label is the card's title — there is no second, larger heading
repeating the same words underneath it.

The numbers count the cards down the column and restart on each section, because a
section is rarely one card: Soul reads `01 SOUL PROFILE`, `02 CONFIGURE IN DETAIL`,
`03 WHAT ACTUALLY GETS SENT`. Numbering by nav item instead would print `02` three times
on that page and leave the eye nothing to follow.

### Popup

`w-80`, `p-4`, ground `--bg`. Name + connection status on one line; the status is a
6px dot and a mono label, not a filled badge. Facts are a `dt`/`dd` list: label at
`--ink-55`, value at `--ink` — model id and credits in mono, because they are numbers and
machine names.

### Section dividers

`border-top: 1px solid --line` plus `pt-6`. Never a coloured slab to group things — a
line only.

---

## 5. Motion

| What | Value |
|---|---|
| Popover open | `opacity 0→1`, `translateY 4px→0`, `120ms cubic-bezier(.23,1,.32,1)` |
| Ask panel open | `opacity 0→1`, `translateY 8px→0`, `200ms cubic-bezier(.23,1,.32,1)` |
| Settings card enter | `fade-up`: `opacity 0→1`, `translateY 16px→0`, `400ms cubic-bezier(.23,1,.32,1)` |
| Cascade | delays `40ms`, `80ms`, `120ms` in element order |
| Hover, colour | `150ms ease-out` |
| Hover, layout | not animated — nothing moves or scales |
| Streaming dots | 1.2s pulse loop, opacity only |
| Coffee button, popover action row | 7s loop of twelve blurred circles behind a mask; `1400ms` on hover |

The source's 700ms entrance is landing-page motion. A tool that opens over a comment the
user is already reading has to be there immediately — the popover animation exists only
to say *this appeared*, and 120ms is enough to say it.

Everything is under `motion-safe:`; `prefers-reduced-motion` turns the animations off.

The coffee button in the popover's action row is the one loop that never stops — it is in
view for as long as the popover is open, which is the point of it: #45 made the card five
times rarer, and a rare card is only affordable if something quiet is always there. It
reads the OS setting in CSS rather than through `motion-safe:`, and reduced motion holds
every circle exactly where it starts and cancels the hover speed-up too, because a change
of pace is motion.

It costs nothing while nothing is open: the popover is mounted on demand and torn down on
close, so twelve blurred circles are only ever repainting while somebody is looking at a
reply. A licence turns the button back into the flat mark — an accent is exactly what
someone who has already given something should stop being shown.

---

## 6. Tokens

Brand tokens, in `assets/theme.css` alongside the daisyUI themes:

```css
@theme {
  /* layers daisyUI has no slot for */
  --color-overlay: #161718;
  --color-line: rgb(255 255 255 / 0.08);
  --color-line-soft: rgb(255 255 255 / 0.06);
  --color-line-hi: rgb(255 255 255 / 0.12);
  --color-line-input: #2d3034;

  /* accent, beyond the daisyUI primary slot */
  --color-accent-line: rgb(255 138 61 / 0.65);
  --color-accent-soft: rgb(255 138 61 / 0.1);
  --color-accent-bright: #ff7a18;

  /* form */
  --radius-block: 0px;
  --radius-control: 8px;
  --shadow-elevated: 0 1px 0 0 rgb(255 255 255 / 0.05), 0 2px 4px 0 rgb(0 0 0 / 0.4);
}
```

The light values of the same tokens are redefined under `[data-theme='replyai-light']`,
which is the attribute `syncTheme` writes.

### How this lands in daisyUI

The ink ladder maps straight onto daisyUI's opacity utilities — `--ink-70` is
`text-base-content/70` — so the ladder needs no tokens of its own. The surfaces and
accents map onto theme slots:

| daisyUI slot | Ours | Dark | Light |
|---|---|---|---|
| `--color-base-100` | `--bg` | `oklch(11.5% 0 0)` | `oklch(100% 0 0)` |
| `--color-base-200` | `--surface` | `oklch(14% 0.005 262)` | `oklch(96.5% 0.001 285)` |
| `--color-base-300` | `--line` as a solid | `oklch(23% 0.004 266)` | `oklch(91% 0.003 285)` |
| `--color-base-content` | `--ink` | `oklch(100% 0 0)` | `oklch(15% 0 0)` |
| `--color-primary` | `--accent` | `oklch(75% 0.167 50)` | `oklch(56% 0.137 53)` |
| `--color-primary-content` | on-accent ink | `oklch(15% 0 0)` | `oklch(100% 0 0)` |
| `--color-secondary` / `--color-info` | `--violet` | `oklch(72% 0.114 284)` | `oklch(51% 0.19 281)` |
| `--color-neutral` | `--solid` | `oklch(94% 0.004 285)` | `oklch(20.5% 0 0)` |
| `--color-neutral-content` | `--solid-ink` | `oklch(15% 0 0)` | `oklch(98% 0 0)` |
| `--color-success` | `--accent` | `oklch(75% 0.167 50)` | `oklch(56% 0.137 53)` |
| `--color-warning` | `--warning` | `oklch(85% 0.147 90)` | `oklch(55% 0.121 66)` |
| `--color-error` | `--danger` | `oklch(65% 0.185 24)` | `oklch(50.5% 0.19 27.5)` |
| `--radius-box` / `--radius-field` | `--radius-block` | `0` | `0` |
| `--radius-selector` | `--radius-pill` | `2rem` | `2rem` |
| `--border` | hairline | `1px` | `1px` |
| `--depth` / `--noise` | — | `0` | `0` |

Three consequences worth stating, because they are what the migration actually costs:

- **Success is orange, not green.** "Done" is the accent — that is what the accent means.
  The one green is `--connected`, and it is spent on the popup's connection status; see
  §1. Nothing else in the interface is green outside a chart.
- **`--radius-box: 0` also flattens dropdowns**, which daisyUI draws from the same slot.
  Menus and the quoted-comment block get `--radius-control` explicitly.
- **`base-100` is the page and `base-200` the card**, which is the reverse of what the
  current markup assumes (`bg-base-200` on the settings shell, `bg-base-100` on cards).
  That flip is a one-line change per surface and must land in the same commit as the
  theme, or every card inverts.

---

## 7. Prompt block for mockup tools

Paste as the style half of any mockup prompt — verbatim, identical across variants, or
the screens cannot be compared to each other.

```
Visual style: dark, near-black interface (#050505 page background, #08090B cards,
#161718 floating panels). No large colour fills and almost no shadows — separation
comes from 1px hairline borders in rgba(255,255,255,0.08). Sharp corners everywhere
(radius 0); only dropdowns, chips and quoted blocks use 8px rounding, and toggles
and status dots are fully round. Text hierarchy is built from white opacity levels:
pure white for headings, 55% for secondary halves of a heading, 45% for
descriptions, 28% for disabled. A single orange accent #FF8A3D used only in thin
lines, 6px dots, small labels and selection outlines — never as a filled button or
badge; a lavender #9D9BEA marks model ids and prompt text. Exactly one solid button
per screen, light #E9E9EC with near-black #0B0B0B text; every other button is
outlined or text-only. Typography: Roboto for UI and headings with tight negative
letter spacing, JetBrains Mono for micro-labels, numbers, model ids and statuses —
10px, uppercase, wide 0.16em letter spacing, 40% white. Every section starts
with a two-digit orange number, a 40px hairline rule and an uppercase mono label.
Card grids sit flush together separated by 1px hairlines. Calm, compact and
technical: this is a tool panel over someone else's page, not a landing page.
```

---

## 8. Never

- Round cards or buttons past 1px, or round anything that is not floating or natively round.
- Fill large areas with orange, or use it for a button fill or a solid badge.
- Put more than one solid button on a surface.
- Use red as an accent, or style anything so it reads as a YouTube control.
- Separate blocks with coloured slabs instead of lines.
- Put shadows on anything that is not floating over the host page.
- Add a third accent beyond `--violet` and the service colours `--warning` / `--danger`.
- Colour text "grey" instead of ink with alpha.
- Write `rem` inside the content script.
- Ship a colour literal in a component. Tokens only — a literal is a theme that only
  works in one of the two.
