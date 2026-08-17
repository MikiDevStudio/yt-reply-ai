/**
 * Where the "buy me a coffee" links lead.
 *
 * A plain outbound link, and deliberately nothing more: no id, no campaign
 * parameter, no per-surface tag. The Pro links carry a `from` because the whole
 * point of that page is to measure which entry point produced the interest
 * (see `lib/pro.ts`); this one measures nothing, so it says nothing.
 */
export const SUPPORT_URL = 'https://buymeacoffee.com/mikipirson';
