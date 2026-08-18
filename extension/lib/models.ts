/**
 * The models we recommend, by id.
 *
 * Kept out of `settings.ts` so the smoke script can check these ids against the
 * live catalogue: `settings.ts` imports WXT's `#imports`, which only resolves
 * inside a build, and `npm run smoke` runs under plain tsx.
 *
 * The picker fetches the whole catalogue — these are only the defaults and the
 * one-click alternatives, and every id here was checked against that catalogue
 * rather than remembered. Prices are per million tokens, as of the last check.
 */
export const MODEL_PRESETS = {
  /**
   * Default. $1.50 in / $7.50 out, and it thinks before answering: measured at
   * $0.0003 per reply with reasoning held to `minimal`, $0.0041 without.
   *
   * What it costs in practice is neither of those. `reasoningFor` sends `low`
   * on the reply people actually see, and that measured at $0.00125 until the
   * reply prompt grew the rules that keep a reply from reading as generated
   * (see `lib/prompt.ts`); re-measured after them it comes to $0.0017.
   *
   * **Quote ~$0.002.** Rounded up on purpose, and the number to use wherever a
   * price per reply appears — the trial's spend limit, the landing page, the
   * onboarding copy. The mean moves with how much the model decides to think:
   * across four comments the same run spans $0.0010 to $0.0031, so a figure
   * quoted to the last digit would be precision the measurement does not have,
   * and one quoted low is a promise the next reply can break. `npm run measure`
   * re-runs it, and `npm run eval` is what says whether a prompt change that
   * moved the price bought anything.
   */
  balanced: 'google/gemini-3.6-flash',
  /** $0.25 in / $1.50 out, no reasoning — measured at $0.00005 per reply. */
  cheap: 'google/gemini-3.1-flash-lite',
  /**
   * Offered when a paid call fails for lack of credits, so a new account is
   * never dead-ended. Free variants are capped at 20 requests a minute, and per
   * day at 50 or 1,000 depending on the account's lifetime credit.
   *
   * Availability is the deciding property here, not quality: free variants run
   * on a pool shared by every OpenRouter user, and a popular one answers a
   * request with `upstream_provider_shared_pool` instead of an answer.
   * `google/gemma-4-31b-it:free` held this slot until it started refusing every
   * request outright — measured, not guessed, along with the replacement:
   * 1–2 seconds against 8–16 for the alternatives, on both an English and a
   * Russian comment. `npm run smoke` generates through this id for that reason.
   */
  free: 'nvidia/nemotron-3-nano-30b-a3b:free',
} as const;
