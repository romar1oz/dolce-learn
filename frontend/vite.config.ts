import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const API = process.env.VITE_API_PROXY || 'http://127.0.0.1:8000'

// HTTPS для доступа с телефонов в локальной сети: DOLCE_HTTPS=1 + сертификаты из ./scripts/https-setup.sh
const CERTS = fileURLToPath(new URL('../.certs/', import.meta.url))
const https = process.env.DOLCE_HTTPS === '1' && existsSync(CERTS + 'server.crt')
  ? { key: readFileSync(CERTS + 'server.key'), cert: readFileSync(CERTS + 'server.crt') }
  : undefined
if (process.env.DOLCE_HTTPS === '1' && !https) {
  throw new Error('Нет сертификатов .certs/server.crt — выполните ./scripts/https-setup.sh')
}

// Отдаёт сертификат локального CA с MIME-типом, по которому Android/iOS предлагают его установить
const caCertMime = {
  name: 'dolce-ca-cert-mime',
  configureServer(server: any) { server.middlewares.use(setCaMime) },
  configurePreviewServer(server: any) { server.middlewares.use(setCaMime) },
}
function setCaMime(req: any, res: any, next: () => void) {
  const file = fileURLToPath(new URL('./public/dolce-local-ca.crt', import.meta.url))
  if (req.url?.split('?')[0] !== '/dolce-local-ca.crt' || !existsSync(file)) return next()
  res.setHeader('Content-Type', 'application/x-x509-ca-cert')
  res.setHeader('Content-Disposition', 'attachment; filename="dolce-local-ca.crt"')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(readFileSync(file))
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    caCertMime,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Dolce Learn',
        short_name: 'Dolce Learn',
        description: 'Обучение и аттестация персонала Dolce Pharm — работает без интернета',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#F8FAFC',
        theme_color: '#064E3B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // API не кэшируется Service Worker'ом: офлайн-данные хранятся явно в IndexedDB/Cache Storage приложением
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    https,
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  preview: {
    https,
    host: '0.0.0.0',
    port: 4173,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as any)
