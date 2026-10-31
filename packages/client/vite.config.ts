import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // relative paths: the same build runs at games.matsolutions.gy/bladerift/ and at the root of a LAN host
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Bladerift',
        short_name: 'Bladerift',
        description: 'One-on-one medieval duels: online, on one device, or against a bot.',
        id: './',
        theme_color: '#0d0a14',
        background_color: '#0d0a14',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        start_url: './',
        scope: './',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,webp,woff2,json}'],
        // fighter sprite atlases (~1 MB each) are not precached: they download for the heroes actually played and are
        // cached at runtime (stale-while-revalidate: an updated atlas arrives on the next visit)
        globIgnores: ['**/assets/characters/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/characters\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'bladerift-fighters', expiration: { maxEntries: 40 } },
          },
        ],
        // Only Vite's content-hashed bundles skip revisioning; generated art (assets/gen) is unhashed and
        // must get a precache revision so a new release never pairs new code with stale atlases.
        dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$/,
        // Generated art is precached only under its content-hashed names (see tools/build-art.mjs).
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter((e) => !/^assets\/gen\/.+(?<!\.[0-9a-f]{10})\.(png|json)$/.test(e.url) || e.url.endsWith('manifest.json')),
            warnings: [],
          }),
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
    }),
  ],
});
