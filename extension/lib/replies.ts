import { storage } from '#imports';

/**
 * How many replies this copy has written, and nothing else.
 *
 * This module used to be a quota. The daily cap of 50 was removed in full: it
 * measured demand by getting in the way of the people it was meant to measure,
 * and a tool that stops working at the moment someone is finally using it
 * teaches them to stop using it. Nothing here refuses anything any more — the
 * count exists to say thank you at intervals (see `NUDGE_EVERY`) and to put a
 * number on the popup, which is the honest version of the same information.
 *
 * It is still trivially resettable by anyone who opens devtools, and now that
 * costs nobody anything: there is no gate behind it.
 */

/**
 * How often the support dialog is offered — every twentieth reply.
 *
 * Twenty is roughly a session of comment answering, so the dialog lands on
 * someone who has just finished a batch rather than on someone still working
 * out what the button does. It is never shown twice for the same crossing:
 * `nudgedAt` records the count it was last shown at.
 */
export const NUDGE_EVERY = 20;

/**
 * How many recent comment keys are remembered for the free-regeneration rule.
 *
 * The unit is a comment, not a button press: the first reply to a given comment
 * counts, and every regeneration of that same comment is free — otherwise the
 * counter would say "40 replies" to someone who answered ten comments well.
 *
 * The window is bounded because the record rides `storage.sync`, which allows
 * 8 KB per item, and the cap that used to bound this list is gone. Two hundred
 * seven-character keys are under 2 KB; a comment answered longer ago than that
 * is not one anybody is still regenerating.
 */
const RECENT_LIMIT = 200;

interface ReplyRecord {
  /** The local date `today` belongs to, `YYYY-MM-DD`. */
  date: string;
  /** Comment keys counted today, newest last. Bounded by `RECENT_LIMIT`. */
  comments: string[];
  /** Replies written today. Its own field, now that `comments` is a window. */
  today: number;
  /** Replies written since the extension was installed. Never reset. */
  total: number;
  /** What `total` stood at when the support dialog was last shown. */
  nudgedAt: number;
}

/**
 * `sync`, unlike every setting in `lib/settings.ts`.
 *
 * The counter rides the Chrome profile, so it survives a reinstall and follows
 * the user to a second machine. Every `sync` constraint is far away: 8 KB per
 * item and 100 KB overall against under 2 KB, and 1,800 writes an hour against
 * at most one per generated reply. Signed out of Chrome, or with sync switched
 * off, `storage.sync` silently behaves like `storage.local` — which is exactly
 * the fallback we would have written by hand.
 *
 * A new key rather than the old `quota.daily`: the shape gained three fields
 * and lost its meaning, and an old record read as a new one would report a
 * lifetime total of zero anyway. Whoever upgrades starts the count at nought,
 * which costs them one thank-you note and nothing else.
 */
const record = storage.defineItem<ReplyRecord | null>('sync:replies.count', { fallback: null });

export interface ReplyCount {
  /** Comments answered since local midnight. */
  today: number;
  /** Comments answered since the extension was installed. */
  total: number;
}

/**
 * The local calendar date, as `YYYY-MM-DD`.
 *
 * Local rather than UTC because "today" is the user's today, and theirs is the
 * only one they can act on. Built by hand rather than through a locale, which
 * would decide the field order for us.
 */
export function localDate(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * Read a stored record as of now.
 *
 * The stored date is what decides the daily figure, not a timer: a record from
 * any other local date counts as nothing for today and everything for the
 * total. That is what makes the daily number immune to a service worker that
 * slept through midnight, and to a flight that moves the date either way.
 */
export function countFrom(value: ReplyRecord | null, today = localDate()): ReplyCount {
  return { today: value?.date === today ? value.today : 0, total: value?.total ?? 0 };
}

export async function readReplies(): Promise<ReplyCount> {
  return countFrom(await record.getValue());
}

/** Follow the counter, for the surfaces that display it. */
export function watchReplies(callback: (count: ReplyCount) => void): () => void {
  return record.watch((value) => callback(countFrom(value)));
}

/**
 * Count a reply, once per comment.
 *
 * Called after a reply arrives rather than before it is asked for: a request
 * that failed, timed out or came back empty produced nothing to count.
 *
 * Read-modify-write, so two tabs finishing at the same instant can lose one of
 * the two entries. Left alone deliberately: the cost is one uncounted reply on
 * a number that gates nothing, and the alternative is a lock in storage that
 * can be left behind by a worker Chrome retires mid-write.
 */
export async function countReply(comment: string): Promise<void> {
  const value = await record.getValue();
  const today = localDate();
  const sameDay = value?.date === today;

  if (sameDay && value.comments.includes(comment)) return;

  const comments = sameDay ? [...value.comments, comment].slice(-RECENT_LIMIT) : [comment];

  await record.setValue({
    date: today,
    comments,
    today: sameDay ? value.today + 1 : 1,
    total: (value?.total ?? 0) + 1,
    nudgedAt: value?.nudgedAt ?? 0,
  });
}

/**
 * Whether the support dialog is due, claiming it if it is.
 *
 * Claiming and asking are one call on purpose. Two tabs both crossing the
 * twentieth reply would otherwise both open a dialog, and the second one lands
 * on someone who has just dismissed the first — the fastest way to make a
 * thank-you read as an advert.
 *
 * Returns the count worth celebrating, or `null` when nothing is due. It reads
 * a fact about the user's own machine and goes nowhere near the network.
 */
export async function takeNudge(): Promise<number | null> {
  const value = await record.getValue();
  if (!value || value.total < value.nudgedAt + NUDGE_EVERY) return null;

  // Floored to the milestone rather than set to the raw total, so a burst that
  // jumps from 19 to 22 still shows "20" and the next one is due at 40.
  const milestone = Math.floor(value.total / NUDGE_EVERY) * NUDGE_EVERY;
  await record.setValue({ ...value, nudgedAt: milestone });
  return milestone;
}
