import { storage } from '#imports';

/**
 * Video descriptions the content script has already scraped, keyed by video id.
 *
 * A description does not change between the comments of one video, so scraping
 * it once per video and reusing it has two benefits: no repeated DOM work per
 * reply, and — the one that matters — a prompt prefix that is byte-identical
 * across every comment on that video, which is what prompt caching keys on (#8).
 *
 * The cache also covers a gap in scraping: after an in-page navigation the full
 * description is no longer in the DOM, and only the truncated snippet is. If any
 * tab loaded that video properly, the full text is already here.
 *
 * `session` rather than `local`: this is derived data with no value across
 * browser restarts, and it never touches disk. Note that `session` is readable
 * from the service worker and extension pages only — a content script gets an
 * error — so every access to it lives in the background.
 */
const descriptions = storage.defineItem<Record<string, string>>('session:video.descriptions', {
  fallback: {},
});

/**
 * Videos kept before the oldest is dropped.
 *
 * Descriptions are capped at ~1.2 kB by the scraper, so this sits around 25 kB
 * — nothing against the 10 MB session quota, but the cache has no natural end
 * otherwise: a long browsing session would grow it forever.
 */
const MAX_ENTRIES = 20;

export async function rememberDescription(videoId: string, description: string): Promise<void> {
  const current = (await descriptions.getValue()) ?? {};

  // Re-inserting moves the key to the end, so the plain insertion order of the
  // object doubles as the recency order the trim below relies on.
  delete current[videoId];
  current[videoId] = description;

  const keys = Object.keys(current);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    delete current[stale];
  }

  await descriptions.setValue(current);
}

export async function recallDescription(videoId: string): Promise<string | null> {
  const current = (await descriptions.getValue()) ?? {};
  return current[videoId] ?? null;
}
