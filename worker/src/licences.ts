import { DurableObject } from 'cloudflare:workers';

/**
 * The codes that have been sold or given away, and how many activations each
 * one has left (#39).
 *
 * A Durable Object for the same reason the trial uses one: spending an
 * activation is a decrement that must not race itself, and KV's eventual
 * consistency loses exactly the write that matters. One object serialises them,
 * and this is touched once per purchase and once per activation — nowhere near
 * anything's ceiling.
 *
 * **What is not stored: who bought it.** No email, no name, no payment id. The
 * shop knows who paid and this knows what was issued, and nothing here can join
 * the two. That is deliberate — it is what keeps an activation free of personal
 * data, and it is the reason a refund cannot be traced back to a code from this
 * side. See the note on revocation below.
 *
 * **There is no revocation, by design.** #39 removed it: what it buys is the
 * ability to kill a leaked or refunded code, worth — in this product — a nag
 * card staying off for someone who did not pay. What it costs is an extension
 * tethered to a Worker that must keep running for as long as anyone has the
 * extension installed. Once an entitlement is signed, this object never hears
 * about it again, and shutting this Worker down cannot break it.
 */

/** What `spend` decided, in the words the endpoint answers with. */
export type Spend =
  | { status: 'ok'; kind: Kind; expiresAt: number | null }
  | { status: 'unknown' }
  | { status: 'spent' }
  | { status: 'expired' };

/** A purchase, or a promo code — the same object with an expiry (#39, #40). */
export type Kind = 'supporter' | 'promo';

type CodeRow = Record<string, SqlStorageValue> & {
  kind: string;
  activations_left: number;
  expires_at: number | null;
};

export class LicenceLedger extends DurableObject {
  private readonly sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS codes (
        code             TEXT PRIMARY KEY,
        kind             TEXT NOT NULL,
        activations_left INTEGER NOT NULL,
        activations_used INTEGER NOT NULL DEFAULT 0,
        expires_at       INTEGER,
        created_at       INTEGER NOT NULL,
        note             TEXT
      );

      -- Which shop event produced which code. The shop retries a webhook it
      -- believes failed — Buy Me a Coffee up to five times — and without this a
      -- retry would mint a second code for one purchase. Creating it here, in
      -- the constructor and only if absent, is also how the table reached an
      -- object that already existed before it was written.
      --
      -- The event id is theirs and random; nothing here says who paid.
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        code     TEXT NOT NULL,
        at       INTEGER NOT NULL
      );
    `);
  }

  /** The code already issued for this event, if it has been seen before. */
  codeForEvent(eventId: string): string | null {
    const row = this.sql
      .exec<{ code: string }>('SELECT code FROM events WHERE event_id = ?', eventId)
      .toArray()[0];
    return row?.code ?? null;
  }

  /** Tie an event to the code it produced, so a retry hands back the same one. */
  rememberEvent(eventId: string, code: string): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO events (event_id, code, at) VALUES (?, ?, ?)',
      eventId,
      code,
      Date.now(),
    );
  }

  /**
   * Write down a code that is about to be emailed to somebody.
   *
   * `note` is free text from whoever issued it — "bmc 2026-08-18", "video with
   * so-and-so" — so a batch can be recognised later. It is not a person: the
   * shop's own records are where a purchase is joined to a buyer, and nothing
   * here should make that join possible.
   */
  mint(
    code: string,
    kind: Kind,
    activations: number,
    expiresAt: number | null,
    note: string | null,
  ): void {
    this.sql.exec(
      'INSERT INTO codes (code, kind, activations_left, expires_at, created_at, note) VALUES (?, ?, ?, ?, ?, ?)',
      code,
      kind,
      activations,
      expiresAt,
      Date.now(),
      note,
    );
  }

  /**
   * Take one activation, or say why not.
   *
   * The ceiling exists because a code can be posted publicly — in a comment
   * under the very video that gave it away. An honest buyer with sync on needs
   * exactly one activation; the allowance above that covers sync being off, a
   * reinstall, and a second machine, and stops well short of being worth
   * sharing.
   */
  spend(code: string): Spend {
    const row = this.sql
      .exec<CodeRow>(
        'SELECT kind, activations_left, expires_at FROM codes WHERE code = ?',
        code,
      )
      .toArray()[0];

    if (!row) return { status: 'unknown' };
    if (row.expires_at !== null && row.expires_at <= Date.now()) return { status: 'expired' };
    if (row.activations_left <= 0) return { status: 'spent' };

    this.sql.exec(
      'UPDATE codes SET activations_left = activations_left - 1, activations_used = activations_used + 1 WHERE code = ?',
      code,
    );

    return {
      status: 'ok',
      kind: row.kind as Kind,
      expiresAt: row.expires_at,
    };
  }

  /** How many codes exist and how many have ever been activated. Read by `/health`. */
  counts(): { codes: number; activated: number } {
    const row = this.sql
      .exec<{ codes: number; activated: number }>(
        'SELECT COUNT(*) AS codes, COALESCE(SUM(activations_used), 0) AS activated FROM codes',
      )
      .toArray()[0];
    return { codes: row?.codes ?? 0, activated: row?.activated ?? 0 };
  }
}
