import type { TokenUsage } from '@/lib/openrouter/types';

/**
 * What the user has generated in this tab and has not committed to yet.
 *
 * Deliberately module-level rather than React state or `storage.session`:
 *
 * - React state dies with the popover, and closing the popover by accident must
 *   not destroy three attempts the user spent money on.
 * - `storage.session` is extension-wide and asynchronous. This is one tab's
 *   scratch space; nothing outside this content script has any use for it, and
 *   an await between "press Insert" and "read the text" would be a bug waiting
 *   to happen.
 *
 * A page reload clears everything, which is the right lifetime: the comments
 * themselves are re-rendered from scratch at that point too.
 */

export interface Attempt {
  text: string;
  /** Which angle produced it, kept so the UI can explain a variant later. */
  angle: string;
  /** The level it came out at, after the per-attempt bump. */
  creativity: number;
  usage?: TokenUsage;
}

export interface History {
  attempts: Attempt[];
  /** Which attempt is on screen. Always a valid index once there is one. */
  cursor: number;
}

const EMPTY: History = { attempts: [], cursor: 0 };

const histories = new Map<string, History>();

/** Never returns `null`, so callers do not branch on "first time" everywhere. */
export function readHistory(commentId: string): History {
  return histories.get(commentId) ?? EMPTY;
}

/** Store an attempt and point the cursor at it — a new attempt is what you asked for. */
export function pushAttempt(commentId: string, attempt: Attempt): History {
  const attempts = [...readHistory(commentId).attempts, attempt];
  const history: History = { attempts, cursor: attempts.length - 1 };
  histories.set(commentId, history);
  return history;
}

/** Remember which attempt the user was looking at when the popover closed. */
export function moveCursor(commentId: string, cursor: number): void {
  const history = histories.get(commentId);
  if (!history) return;
  histories.set(commentId, { ...history, cursor });
}

/**
 * Forget a comment's attempts.
 *
 * Called when the text is inserted: a choice was made, and reopening the same
 * comment afterwards is a new question, not a continuation of the old one.
 */
export function clearHistory(commentId: string): void {
  histories.delete(commentId);
  notes.delete(commentId);
}

/**
 * What the user typed for a particular comment, kept for as long as its
 * attempts are.
 *
 * Per comment rather than per tab, unlike the language: a note says something
 * about this one exchange ("tell them it ships next week"), and carrying it to
 * the next comment would quietly put words in a reply nobody meant them for.
 */
const notes = new Map<string, string>();

export function readNote(commentId: string): string {
  return notes.get(commentId) ?? '';
}

export function writeNote(commentId: string, note: string): void {
  if (note) notes.set(commentId, note);
  else notes.delete(commentId);
}

/**
 * A language the user typed, held for the whole tab rather than one popover.
 *
 * Someone answering a foreign-language audience types it once. `null` means
 * nothing was typed and detection decides, which is also what the reset button
 * restores.
 */
let languageOverride: string | null = null;

export function readLanguageOverride(): string | null {
  return languageOverride;
}

export function writeLanguageOverride(language: string | null): void {
  languageOverride = language;
}
