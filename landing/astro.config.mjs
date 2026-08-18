// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@tailwindcss/vite';

/**
 * The website, built from here into `../site`.
 *
 * The split is deliberate and the one thing to understand before moving
 * anything: `site/` is what the host serves — Coolify's static build pack is
 * pointed at that directory and a deploy is a git pull — so the built output is
 * committed. This directory is the source it is built from. Editing anything in
 * `site/` by hand is editing a build artefact; the next `npm run build` will
 * quietly overwrite it.
 *
 * `format: 'directory'` keeps the URLs that are already shipped inside the
 * extension: `/pro` and `/privacy` resolve without a trailing slash and without
 * rewrite rules, because each is a real directory with an `index.html`.
 */
export default defineConfig({
  site: 'https://reply-ai.mikidev.app',
  output: 'static',
  outDir: '../site',
  build: { format: 'directory' },
  // Nothing on these pages needs to hydrate, so nothing ships as a module by
  // itself: the few interactive parts are inline `<script>` tags Astro bundles.
  vite: { plugins: [tailwind()] },
});
