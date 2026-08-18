# The trial Worker

Issues a capped OpenRouter key to a new install, so the first run does not end
at "go and create an account somewhere else" (#38).

It is touched **once per install**. Every generation goes from the extension
straight to `openrouter.ai` with the key issued here — no comment text ever
passes through this service, and an outage here cannot break an install that
already has its key.

## What it does

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

## Deploying

Once, per machine:

```sh
npm install
npx wrangler login                  # interactive; opens a browser
```

Once, per Cloudflare account:

```sh
npx wrangler secret put OPENROUTER_MANAGEMENT_API_KEY
```

Paste the provisioning key — the kind that creates other keys, made in
OpenRouter's dashboard under Provisioning API Keys. It never enters this
repository. `wrangler dev` reads the same value from `worker/.dev.vars`, which
is gitignored.

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
