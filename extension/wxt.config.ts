import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  manifest: {
    name: 'Reply AI — YouTube Comment Assistant',
    description:
      'Generate replies to YouTube comments in your own voice. Bring your own OpenRouter account.',
    version: '0.1.0',

    // `identity` is needed for the OpenRouter OAuth PKCE flow via
    // chrome.identity.launchWebAuthFlow (redirects to <id>.chromiumapp.org).
    permissions: ['storage', 'identity'],

    // Listing openrouter.ai here lets the background service worker call the API
    // without being subject to the page's CORS rules. Never widen this to <all_urls>.
    host_permissions: ['https://openrouter.ai/*'],
  },
});
