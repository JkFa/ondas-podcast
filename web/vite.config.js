import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE permite publicar em subcaminho (GitHub Pages: /ondas-podcast/).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest', // service worker próprio (src/sw.js) com Workbox: precisamos tratar Range e downloads
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt', // não troca a versão no meio de um episódio: avisa e a pessoa escolhe atualizar
      injectRegister: false, // o registro é feito em src/hooks/usePwa.js
      manifest: false, // usamos public/manifest.webmanifest
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}', 'catalog.json'],
        // Fontes opcionais (acessibilidade) entram só quando usadas; o resto abaixo não faz parte do app.
        globIgnores: ['**/opendyslexic*', '**/atkinson*', 'obra/**', 'episodio/**', 'embed/**', 'transcripts/**', 'feed.xml', 'cover-1400.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
})
