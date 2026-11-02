import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // view.html renders the 3D scene alone, for screenshots and scripts/check-overlay.js.
  build: { rollupOptions: { input: { main: 'index.html', view: 'view.html' } } },
  define: { __PROFILE__: JSON.stringify('app') },
  plugins: [
    VitePWA({
      // The page registers the worker itself and only reloads when the user accepts.
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        // App shell, fonts, icons and the worklet chunk. Audio lives in IndexedDB
        // and is never fetched, so there is no runtime caching at all.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['screenshots/**', 'og.png', 'view.html'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
