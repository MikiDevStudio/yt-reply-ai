import { storage } from '#imports';

/**
 * The free tier's daily allowance, and the only thing that measures demand.
 *
 * With Pro unbuilt, the cap is what turns curiosity into a number: the people
 * who reach it are the ones answering comments as work, which is the audience
 * Pro would be sold to. See #31 and the project decision log, which is kept
 * outside this repository.
 *
 * It is trivially resettable by anyone who opens devtools, and that is
 * accepted — nothing shipped to the user's machine can be protected, and the
 * deterrents that work are price and auto-updates, not obfuscation.
 */
export const DAILY_REPLY_LIMIT = 50;

/**
 * What a comment costs, and when it costs nothing.
 *
 * The unit is a comment, not a button press: the first generation against a
 * given comment spends one, and every regeneration of that same comment is
 * free. If Regenerate ate quota people would learn not to press it, and
 * pressing it is the point of the variability work in #6.
 */
interface QuotaRecord {
  /** The local date this count belongs to, `YYYY-MM-DD`. */
  date: string;
  /**
   * Comment keys already charged today, so its length *is* the count.
   *
   * One field rather than a counter plus a set: two fields could disagree, and
   * the list is bounded by the cap itself — 50 keys of seven characters, a few
   * hundred bytes against the 8 KB an item is allowed.
   */
  comments: string[];
}

/**
 * `sync`, unlike every setting in `lib/settings.ts`.
 *
 * The counter rides the Chrome profile, so it survives a reinstall and follows
 * the user to a second machine — free hardening at no cost in complexity, since
 * the API is the same one. Every `sync` constraint is far away: 8 KB per item
 * and 100 KB overall against a few hundred bytes, and 1,800 writes an hour
 * against at most one per generated reply. Signed out of Chrome, or with sync
 * switched off, `storage.sync` silently behaves like `storage.local` — which is
 * exactly the fallback we would have written by hand.
 *
 * `null` until the first reply is generated; nothing writes it on read.
 */
const record = storage.defineItem<QuotaRecord | null>('sync:quota.daily', { fallback: null });

export interface QuotaState {
  /** Comments charged today. */
  used: number;
  limit: number;
  /** Never negative, even if a write race pushed `used` past the cap. */
  remaining: number;
}

/**
 * The local calendar date, as `YYYY-MM-DD`.
 *
 * Local rather than UTC because the promise is "resets at midnight", and the
 * user's midnight is the only one they can act on. Built by hand rather than
 * through a locale, which would decide the field order for us.
 */
export function localDate(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * Read a stored record as of now.
 *
 * The stored date is what decides, not a timer: a record from any other local
 * date counts as nothing. That is what makes the reset immune to a service
 * worker that slept through midnight, and to a flight that moves the date
 * either way — a stale count is never resurrected, it is only ever ignored.
 */
export function quotaFrom(value: QuotaRecord | null, today = localDate()): QuotaState {
  const used = value?.date === today ? value.comments.length : 0;
  return { used, limit: DAILY_REPLY_LIMIT, remaining: Math.max(0, DAILY_REPLY_LIMIT - used) };
}

export async function readQuota(): Promise<QuotaState> {
  return quotaFrom(await record.getValue());
}

/** Follow the counter, for the surfaces that display it. */
export function watchQuota(callback: (state: QuotaState) => void): () => void {
  return record.watch((value) => callback(quotaFrom(value)));
}

/**
 * Whether this comment may be generated, and what the counter stands at.
 *
 * A comment already charged today always passes, however far past the cap the
 * count is — otherwise the day's last reply would lose its Regenerate button,
 * which is the one thing the per-comment unit exists to prevent.
 */
export async function allowanceFor(comment: string): Promise<QuotaState & { allowed: boolean }> {
  const value = await record.getValue();
  const today = localDate();
  const state = quotaFrom(value, today);
  const charged = value?.date === today && value.comments.includes(comment);

  return { ...state, allowed: charged || state.remaining > 0 };
}

/**
 * Charge a comment, once.
 *
 * Called after a reply arrives rather than before it is asked for: a request
 * that failed, timed out or came back empty produced nothing to charge for, and
 * the user would have every right to be angry about paying for it.
 *
 * Read-modify-write, so two tabs finishing at the same instant can lose one of
 * the two entries. Left alone deliberately: the cost is one free reply on a cap
 * that is unenforceable by design, and the alternative is a lock in storage
 * that can be left behind by a worker Chrome retires mid-write.
 */
export async function chargeComment(comment: string): Promise<void> {
  const value = await record.getValue();
  const today = localDate();

  if (value?.date !== today) {
    await record.setValue({ date: today, comments: [comment] });
    return;
  }

  if (value.comments.includes(comment)) return;

  await record.setValue({ date: today, comments: [...value.comments, comment] });
}
