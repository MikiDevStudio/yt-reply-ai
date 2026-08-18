# The Worker

Two things, and nothing else: it issues a capped OpenRouter key to a new install
so the first run does not end at "go and create an account somewhere else"
(#38), and it turns a purchase into a signed licence (#39).

It is touched **once per install**, and once more if that person buys. Every
generation goes from the extension straight to `openrouter.ai` with the key
issued here — no comment text ever passes through this service, and an outage
here cannot break an install that already has its key or its licence.

| Route | Who calls it | What it does |
|---|---|---|
| `POST /trial` | the extension | Mints a capped OpenRouter key for one install |
| `POST /licence/bmc` | Buy Me a Coffee | Built, **not wired up** — see below |
| `POST /licence/issue` | a person, with `curl` | Mint a code by hand. The only route in use |
| `POST /licence/activate` | the extension | Spend one activation, return a signed entitlement |
| `GET /health` | anyone | Today's trial count and how many licences exist |

## The trial

```
extension                     this Worker                   OpenRouter
    │ POST /trial { installId }  │                              │
    │ ──────────────────────────▶│ POST /api/v1/keys            │
    │                            │ { name, limit }              │
    │                            │ ────────────────────────────▶│
    │ ◀─────── key ──────────────│ ◀──────── key ───────────────│
    │ ══ every generation from here goes straight there ═══════▶│
```

`POST /trial` takes `{ "installId": "<uuid>" }` and answers:

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ key, limit }` | A key of this install's own. The plaintext is returned once and is never recoverable. |
| 400 | `{ error: "bad_request" }` | Not a UUID. Our bug if a real install ever sees it. |
| 409 | `{ error: "already_issued" }` | This install has had its trial. |
| 429 | `{ error: "rate_limited" }` | Too many requests from this address this minute. |
| 503 | `{ error: "ceiling" }` | The day's ceiling is spent. A refusal, not a fault. |
| 502 | `{ error: "upstream" }` | OpenRouter refused or did not answer. |

`GET /health` reports how much of today's ceiling has gone.

## What it stores

An install id — a random UUID the extension generates for itself — a key hash,
and timestamps, in a single Durable Object. No IP address, no request body;
there is no request body worth keeping and that has to stay true.

The per-address rate limit is a counter that expires on its own, not a stored
quota. That distinction is the reason it is allowed to exist at all.

## Numbers

Set in `wrangler.jsonc` under `vars`, so changing one is a deploy and not an
edit to the code:

| Var | Value | Why |
|---|---|---|
| `TRIAL_LIMIT_USD` | `0.04` | About 30 replies. Measured at $0.00125 a reply on `google/gemini-3.6-flash` with reasoning at `low`, which is what the extension sends — run `npm run measure` in `extension/` to re-check. |
| `TRIAL_DAILY_CEILING` | `200` | Caps a bad day at $8. Every key minted counts, retries included — see below. |
| `TRIAL_MAX_ATTEMPTS` | `3` | Retries after a dropped response, each one deleting the unused key it replaces. |

OpenRouter reports a key's usage five to thirteen seconds late, measured. Inside
that window a retry cannot be told from someone spending a trial and asking for
another, so the ceiling counts every key minted rather than every install
served. The day's worst case is then `TRIAL_DAILY_CEILING × TRIAL_LIMIT_USD`
however anyone behaves — $8 — and the race is worth nothing to win.

Keys are minted with no `limit_reset`, so an allowance never refills. An
exhausted key is left in place rather than deleted: it is what turns into the
"connect your own account" moment (#15, #35).

## The licence (#39)

```
  a person                 this Worker                 whoever it is for
    │ POST /licence/issue      │                            │
    │ ────────────────────────▶│ mint a code, store it      │
    │ ◀──── RA-XXXX-… ─────────│                            │
    │ ═══ handed over by whatever means ═══════════════════▶│
                               │                            │
  the extension                │                            │
    │ POST /licence/activate   │                            │
    │ { code } ───────────────▶│ spend one activation,      │
    │ ◀──── entitlement ───────│ sign it                    │
    │ ═══ never contacts us about the licence again ════════│
```

**Codes are gifts, and that is load-bearing.** They go out in giveaways under
promo videos and by hand. They are never sold and never promised in exchange for
money — the moment one is, the Buy Me a Coffee button stops being a donation and
becomes a supply for consideration, which brings VAT, a Trader declaration on the
Store listing and a statutory right of withdrawal with it.

**The entitlement is verified locally, forever.** It is signed with ECDSA P-256;
the public half ships in `extension/lib/entitlement.ts` and the private half is
a secret here. Nothing re-checks, nothing is revoked, and there is no endpoint
that could be built later to take one back — so **shutting this Worker down
cannot break a licence anybody has already activated.** That is a promise on the
pricing page, not an implementation detail.

**Nothing here can say who bought what.** The ledger holds codes, activation
counts and the shop's own event ids. No email, no name, no payment id: the shop
knows who paid, this knows what was issued, and the two cannot be joined from
this side. It is also why a refund cannot be traced back to a code here — see
the note on revocation in `src/licences.ts`.

**Only `src/bmc.ts` knows what shop this is.** `POST /licence/issue` takes a
`kind` and a note and nothing else, so moving the money to a merchant of record
later — the option #39 left open, because Buy Me a Coffee explicitly does not
collect or remit VAT on a creator's behalf — is a second file beside that one
and no change to the extension at all.

### Issuing a code

The only route in use. For a giveaway (#40), a gift, or anything gone wrong:

```sh
curl -X POST https://api.mikidev.app/licence/issue   -H "Authorization: Bearer $LICENCE_ISSUE_TOKEN"   -H 'Content-Type: application/json'   -d '{"kind":"promo","note":"video with so-and-so"}'
```

`kind` is `supporter` (never expires, three activations) or `promo` (`PROMO_DAYS`,
one activation). The caller cannot set either number: they are `vars` in
`wrangler.jsonc`, so a leaked token cannot mint a licence with a thousand
activations on it.

### The signing pair

```sh
node scripts/generate-licence-key.mjs
npx wrangler secret put LICENCE_SIGNING_KEY < .licence-signing-key
echo "LICENCE_SIGNING_KEY=$(cat .licence-signing-key)" >> .dev.vars
rm .licence-signing-key
```

The script prints the public half; it goes into `extension/lib/entitlement.ts`.
**Run it once, ever.** A new pair invalidates every licence already sold, and
there is no path back — which is why the script refuses to overwrite the file.

### The shop, which is deliberately not connected

`src/bmc.ts` and `POST /licence/bmc` turn a Buy Me a Coffee purchase into a code
and email it. They are finished and tested, and **no webhook exists in the Buy Me
a Coffee dashboard, on purpose.** Creating one is exactly what would turn a
donation into a sale; the code is kept for the day that is set up properly, and
`BMC_WEBHOOK_SECRET` and `RESEND_API_KEY` are not needed until then.

When that day comes: Buy Me a Coffee → **Integrations → New webhook**, endpoint
`https://api.mikidev.app/licence/bmc`, event `donation.created`, and the signing
secret it shows goes into `BMC_WEBHOOK_SECRET`. It would also need a merchant of
record — Buy Me a Coffee is explicitly not one and does not remit VAT for a
creator.

Two things to know before trusting it. Their retry behaviour is why the ledger
writes down event ids: a webhook that does not answer 2xx is retried up to five
times, and ten consecutive failures disable it. A retry finds the code the first
attempt minted rather than making a second one. And **the payload shape was never
verified against a live event** — the envelope is documented, the field carrying
the buyer's address is `supporter_email` in both the current and the older shape,
but the OpenAPI file that would settle it sits behind their developer login.
`src/bmc.ts` looks in four places and, finding none, emails the code and the whole
event to `SUPPORT_EMAIL` rather than dropping somebody who paid.

## Deploying

Once, per machine:

```sh
npm install
npx wrangler login                  # interactive; opens a browser
```

Once, per Cloudflare account:

```sh
npx wrangler secret put OPENROUTER_MANAGEMENT_API_KEY   # creates other keys
npx wrangler secret put LICENCE_SIGNING_KEY             # see "The signing pair"
npx wrangler secret put LICENCE_ISSUE_TOKEN             # anything long and random
```

Two more exist in the code and are not needed while the shop is unwired:
`BMC_WEBHOOK_SECRET` and `RESEND_API_KEY`. Without them `POST /licence/bmc`
refuses every request at the signature check, which is the correct behaviour for
an endpoint nothing is supposed to be calling.

The first is the provisioning key — the kind that creates other keys, made in
OpenRouter's dashboard under Provisioning API Keys. None of these enters this
repository. `wrangler dev` reads the same values from `worker/.dev.vars`, which
is gitignored and is the copy that gets forgotten when one is rotated.

Then:

```sh
npm run deploy
```

The custom domain in `wrangler.jsonc` (`api.mikidev.app`) is created by the
deploy, given that the zone is already on this Cloudflare account. One level of
subdomain on purpose: Universal SSL covers `*.mikidev.app` and not a second
level.

**The address is in the extension's `host_permissions`.** Changing it after the
extension is in the Store means a manifest change and another review.

## Watching it

```sh
npm run tail                        # live logs
curl https://api.mikidev.app/health
```

One line per request: install id, status, and — when OpenRouter refuses — what
it said. Never a request body.

A licence line carries only the first group of the code (`RA-4KQ9…`). A code is
a bearer secret and the whole of one never goes into a log; twenty bits is
worthless to guess with and enough to match a log against a code somebody quotes
in an email.
