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
   */
  balanced: 'google/gemini-3.6-flash',
  /** $0.25 in / $1.50 out, no reasoning — measured at $0.00005 per reply. */
  cheap: 'google/gemini-3.1-flash-lite',
  /**
   * Offered when a paid call fails for lack of credits, so a new account is
   * never dead-ended. Free variants are capped at 20 requests/minute and
   * 50/day by OpenRouter.
   */
  free: 'google/gemma-4-31b-it:free',
} as const;
