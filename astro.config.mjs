import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://eric.maya2c.dev',
  output: 'static',
  trailingSlash: 'ignore',
  // Styles stay external so the CSP can use script/style 'self' with no hashes.
  build: {
    inlineStylesheets: 'never',
    // The three.js scene is a lazy chunk (see src/scripts/hero.ts); the warning limit is set to match it.
    chunkSizeWarningLimit: 600,
  },
  // Keep every script external so the CSP script-src can stay 'self' with no hashes.
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
