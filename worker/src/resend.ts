/**
 * The one email this Worker sends: a licence code to somebody who has just paid.
 *
 * Resend, because the rest of the stack already sends through it — the website's
 * contact form and the waitlist's opt-in mail both do — so the sending domain,
 * its SPF and its DKIM are already set up and warm. One key, one endpoint, no
 * SDK: the whole API surface used here is a POST with four fields.
 *
 * Failing to send is not silent and must never become silent. The code is
 * already minted at that point, so a swallowed error is somebody who paid and
 * got nothing, with no trace of it anywhere. The caller writes the failure to
 * the log with the code stub in it, and a person can then send it by hand.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */

const ENDPOINT = 'https://api.resend.com/emails';

export class MailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export interface Letter {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Where a reply should go, when that is not the address we send from. */
  replyTo?: string;
}

export async function send(apiKey: string, letter: Letter): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: letter.from,
      to: [letter.to],
      subject: letter.subject,
      text: letter.text,
      ...(letter.replyTo ? { reply_to: letter.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new MailError(response.status, body.length > 300 ? `${body.slice(0, 300)}…` : body);
  }
}
