import { API_BASE } from './client';
import { OpenRouterError } from './errors';

const AUTH_URL = 'https://openrouter.ai/auth';

/**
 * Obtain an OpenRouter key through their OAuth PKCE flow.
 *
 * Pasting a key by hand works too and is offered alongside this — nothing about
 * OpenRouter requires OAuth. The flow exists to remove five manual steps, and
 * because the key it returns is minted specifically for this extension: the
 * user's main key is never exposed to us, and the consent screen lets them cap
 * this key's spend and expiry before we ever hold it.
 *
 * The redirect goes to `https://<extension-id>.chromiumapp.org/`, which Chrome
 * intercepts. OpenRouter's docs only mention localhost callbacks, but the
 * chromiumapp URL is a normal https URL from their side and is accepted —
 * verified against the live consent screen. This is why the extension ID is
 * pinned in the manifest: the redirect URL embeds it.
 */
export async function connectWithOAuth(): Promise<string> {
  const verifier = createVerifier();
  const challenge = await deriveChallenge(verifier);
  const redirectUri = browser.identity.getRedirectURL();

  const url = new URL(AUTH_URL);
  url.searchParams.set('callback_url', redirectUri);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  let responseUrl: string | undefined;
  try {
    responseUrl = await browser.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive: true,
    });
  } catch {
    // Closing the window rejects here. That is a choice, not a failure, so it
    // gets its own kind and the UI stays quiet.
    throw new OpenRouterError('aborted', 'Authorization was cancelled');
  }

  if (!responseUrl) {
    throw new OpenRouterError('aborted', 'Authorization was cancelled');
  }

  const code = new URL(responseUrl).searchParams.get('code');
  if (!code) {
    throw new OpenRouterError(
      'unauthorized',
      'OpenRouter did not return an authorization code',
    );
  }

  return exchangeCode(code, verifier);
}

/** Trade the one-time code for the actual key. */
async function exchangeCode(code: string, verifier: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
    });
  } catch {
    throw new OpenRouterError('network', 'Could not reach OpenRouter to finish signing in');
  }

  if (!response.ok) {
    throw OpenRouterError.fromResponse(response.status, await response.text());
  }

  const { key } = await response.json();
  if (typeof key !== 'string' || key.length === 0) {
    throw new OpenRouterError('unauthorized', 'OpenRouter returned an empty key');
  }

  return key;
}

/** 32 random bytes, base64url-encoded — the PKCE verifier. */
function createVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function deriveChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
