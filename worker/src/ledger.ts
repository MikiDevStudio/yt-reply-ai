import { DurableObject } from 'cloudflare:workers';

/**
 * The one piece of state the trial needs: who has already been issued a key,
 * and how many have gone out today.
 *
 * A single Durable Object rather than KV. The daily ceiling is a counter, and
 * KV is eventually consistent with roughly one write a second to a key — a
 * counter on it undercounts exactly when it matters, which is a burst. A DO
 * serialises its own writes, and one object is far inside its ~1k req/s
 * ceiling: this is called once per install, not once per reply.
 *
 * What is stored is an install id — a random UUID the extension makes for
 * itself — a key hash, and timestamps. No IP address, no request body; there is
 * no request body to store.
 */

/** What the Worker should do next, decided here so the decision is serialised. */
export type Claim =
  | { status: 'mint' }
  | { status: 'reissue'; hash: string | null }
  | { status: 'exhausted' }
  | { status: 'ceiling' };

/**
 * `sql.exec<T>` requires an index signature — the cursor is a row of unknown
 * columns as far as the type system is concerned.
 */
type TrialRow = Record<string, SqlStorageValue> & {
  key_hash: string | null;
  attempts: number;
  updated_at: number;
};

/**
 * How long after an issue a second attempt is still treated as the first one
 * retried.
 *
 * There is a window because OpenRouter reports a key's usage five to eight
 * seconds late, measured — so a retry sent immediately after a dropped response
 * can read the old key as untouched and mint a replacement. That is harmless
 * (the old key is deleted first, so nobody ever holds two) but it is not a
 * hole to leave open indefinitely: without a window, an install could come back
 * every day for another two cents. Ten minutes is far longer than a retry takes
 * and far shorter than a second visit.
 */
const REISSUE_WINDOW_MS = 10 * 60 * 1000;

export class TrialLedger extends DurableObject {
  private readonly sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS trials (
        install_id TEXT PRIMARY KEY,
        key_hash   TEXT,
        attempts   INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS days (
        day    TEXT PRIMARY KEY,
        issued INTEGER NOT NULL
      );
    `);
  }

  /**
   * Ask for the right to mint, and take a slot out of today's ceiling if the
   * answer is yes.
   *
   * The slot is taken before the key exists, and given back by `release` if
   * minting fails. Overcounting for a few seconds is the safe direction: the
   * other order lets a burst of simultaneous requests all pass a ceiling check
   * that none of them has yet paid for.
   */
  claim(installId: string, day: string, ceiling: number, maxAttempts: number): Claim {
    const existing = this.sql
      .exec<TrialRow>(
        'SELECT key_hash, attempts, updated_at FROM trials WHERE install_id = ?',
        installId,
      )
      .toArray()[0];

    if (existing) {
      // Already served. Either the reply never arrived and this install still
      // has nothing, or someone is asking twice on purpose; the Worker tells
      // those apart by looking at what the old key has spent — but only while
      // the request still looks like a retry of the one that failed.
      if (existing.attempts >= maxAttempts) return { status: 'exhausted' };
      if (Date.now() - existing.updated_at > REISSUE_WINDOW_MS) return { status: 'exhausted' };
      // A reissue is still a key minted, so it comes out of the same ceiling.
      // That is what makes the day's exposure a fixed number rather than one
      // that depends on winning a race against OpenRouter's accounting.
      if (this.issuedOn(day) >= ceiling) return { status: 'ceiling' };
      return { status: 'reissue', hash: existing.key_hash };
    }

    const issued = this.issuedOn(day);
    if (issued >= ceiling) return { status: 'ceiling' };

    const now = Date.now();
    this.sql.exec(
      'INSERT INTO trials (install_id, key_hash, attempts, created_at, updated_at) VALUES (?, NULL, 1, ?, ?)',
      installId,
      now,
      now,
    );
    this.sql.exec(
      'INSERT INTO days (day, issued) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET issued = issued + 1',
      day,
    );

    return { status: 'mint' };
  }

  /**
   * A second or third attempt, about to mint another key.
   *
   * It takes a slot of its own. OpenRouter reports a key's usage five to
   * thirteen seconds late — measured, and the spread is the point — so a retry
   * arriving inside that window cannot be told from an honest one. Counting
   * every mint makes the day's worst case `ceiling × limit` whoever is asking,
   * instead of `ceiling × limit × attempts` for anyone willing to hurry.
   */
  reclaim(installId: string, day: string): void {
    this.sql.exec(
      'UPDATE trials SET attempts = attempts + 1, key_hash = NULL, updated_at = ? WHERE install_id = ?',
      Date.now(),
      installId,
    );
    this.sql.exec(
      'INSERT INTO days (day, issued) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET issued = issued + 1',
      day,
    );
  }

  /** The key exists and is on its way back to the extension. */
  record(installId: string, hash: string): void {
    this.sql.exec(
      'UPDATE trials SET key_hash = ?, updated_at = ? WHERE install_id = ?',
      hash,
      Date.now(),
      installId,
    );
  }

  /**
   * Minting failed. The install is left as it was so it can try again, and the
   * ceiling gets its slot back — nothing was spent.
   */
  release(installId: string, day: string): void {
    this.sql.exec('DELETE FROM trials WHERE install_id = ?', installId);
    this.sql.exec('UPDATE days SET issued = MAX(issued - 1, 0) WHERE day = ?', day);
  }

  /** Keys issued on a UTC day. Read by the health endpoint. */
  issuedOn(day: string): number {
    const row = this.sql
      .exec<{ issued: number }>('SELECT issued FROM days WHERE day = ?', day)
      .toArray()[0];
    return row?.issued ?? 0;
  }
}
