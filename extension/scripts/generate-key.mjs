/**
 * Generate the RSA keypair that pins this extension's ID.
 *
 * An unpacked extension's ID is derived from its directory path, so it changes
 * the moment the folder moves — and the OAuth callback URL embeds that ID
 * (`https://<id>.chromiumapp.org/`). Pinning a `key` in the manifest makes the
 * ID a constant instead.
 *
 * Run once:  node scripts/generate-key.mjs
 *
 * The public half goes into wxt.config.ts. The private half is written to
 * .keys/ (git-ignored) and is only needed if we ever sign a .crx ourselves —
 * the Chrome Web Store signs with its own key.
 */
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyDir = join(root, '.keys');
const privatePath = join(keyDir, 'extension.pem');

if (existsSync(privatePath)) {
  console.error(`Refusing to overwrite ${privatePath}.`);
  console.error('Regenerating changes the extension ID and breaks the OAuth callback.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Chrome derives the ID from the first 128 bits of the SHA-256 of the DER
// public key, rendered in a 16-letter alphabet starting at 'a' instead of hex.
const digest = createHash('sha256').update(publicKey).digest('hex').slice(0, 32);
const extensionId = [...digest]
  .map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)))
  .join('');

mkdirSync(keyDir, { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });

console.log('Private key written to .keys/extension.pem (git-ignored)\n');
console.log('Extension ID:', extensionId);
console.log('OAuth redirect:', `https://${extensionId}.chromiumapp.org/`);
console.log('\nAdd to the manifest in wxt.config.ts:\n');
console.log(`    key: '${publicKey.toString('base64')}',`);
