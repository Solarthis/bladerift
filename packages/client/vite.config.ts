import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** The direct-play handshake (public/p2p.php) for the dev server, in memory: the same four operations. */
function p2pDev(): Plugin {
  const offers = new Map<string, { gid: string; sdp: string }>();
  const answers = new Map<string, string>();
  return {
    name: 'p2p-dev',
    configureServer(server) {
      server.middlewares.use('/p2p.php', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const send = (v: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(v));
          };
          const i = JSON.parse(body || '{}') as { op: string; code: string; gid?: string; sdp?: string };
          if (i.op === 'offer') offers.set(i.code, { gid: i.gid!, sdp: i.sdp! });
          if (i.op === 'poll-offer') {
            const o = offers.get(i.code);
            offers.delete(i.code);
            return send(o ?? { ok: true });
          }
          if (i.op === 'answer') answers.set(`${i.code}.${i.gid}`, i.sdp!);
          if (i.op === 'poll-answer') {
            const k = `${i.code}.${i.gid}`;
            const a = answers.get(k);
            answers.delete(k);
            return send(a ? { sdp: a } : { ok: true });
          }
          send({ ok: true });
        });
      });
    },
  };
}

export default defineConfig({
  // relative paths: the same build runs at games.matsolutions.gy/bladerift/ and at the root of a LAN host
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  plugins: [
    p2pDev(),
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
