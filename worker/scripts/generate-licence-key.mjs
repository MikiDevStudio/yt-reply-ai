/**
 * Make the licence signing pair, once, for this deployment.
 *
 *   node scripts/generate-licence-key.mjs
 *
 * The private half is written to `.licence-signing-key` — gitignored, and the
 * only copy that matters. The public half is printed, because it is meant to be
 * published: it goes into `extension/lib/licence.ts`, ships inside the
 * extension, and is what lets an install verify an entitlement without ever
 * asking us again.
 *
 * Deliberately not printed to the terminal: the private half. It goes to a file
 * so it can be piped straight into `wrangler secret put` without ever appearing
 * in a shell history, a scrollback buffer or a screenshot.
 *
 * ## Running this twice
 *
 * A new pair invalidates every entitlement already signed with the old one —
 * every licence anybody has bought stops verifying. There is no re-issue path
 * for that and there should not be one. The file is written with `wx`, so a
 * second run fails rather than overwrites; deleting the file to force it is a
 * decision, which is the point.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.licence-signing-key');

// P-256 rather than Ed25519: the extension verifies with the browser's own Web
// Crypto, and Ed25519 landed there only in Chrome 137. See the note in
// src/entitlement.ts.
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

const privateKey = base64(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey));
const publicKey = base64(await webcrypto.subtle.exportKey('spki', pair.publicKey));

try {
  writeFileSync(target, privateKey, { encoding: 'utf8', flag: 'wx' });
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error(
      `.licence-signing-key already exists.\n\n` +
        `Generating another pair would invalidate every licence ever activated.\n` +
        `If that is genuinely what you want, delete the file first.`,
    );
    process.exit(1);
  }
  throw error;
}

console.log(`Private half written to worker/.licence-signing-key — never commit it.

Put it where the Worker can read it, then delete the file:

  npx wrangler secret put LICENCE_SIGNING_KEY < .licence-signing-key
  echo "LICENCE_SIGNING_KEY=$(cat .licence-signing-key)" >> .dev.vars
  rm .licence-signing-key

The public half is below. It belongs in extension/lib/licence.ts, and being
public is the whole point of it:

${publicKey}
`);

function base64(buffer) {
  return Buffer.from(buffer).toString('base64');
}
