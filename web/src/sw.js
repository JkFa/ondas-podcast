/// <reference lib="webworker" />
// Service worker do Ondas (Workbox, modo injectManifest). O que ele faz:
//  - pré-carrega o app (JS/CSS/HTML/fontes/ícones) e o catálogo, então o app abre sem internet;
//  - serve do cache de DOWNLOADS (áudio, capa e transcrição que a pessoa baixou), tratando requisições
//    `Range` (a barra de progresso precisa saltar com o arquivo local);
//  - guarda capas vistas na navegação (CacheFirst, no máximo 300) e fontes opcionais;
//  - nunca guarda áudio que a pessoa não baixou (o cache do navegador não serve para arquivos de dezenas de MB).
import { clientsClaim } from 'workbox-core'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { createPartialResponse } from 'workbox-range-requests'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { AUDIO_CACHE, COVER_CACHE } from './lib/offline-constants'

const base = import.meta.env.BASE_URL

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Abrir o app sem rede: qualquer navegação do app devolve o index.html pré-carregado.
// (Páginas de compartilhamento e o player incorporado são HTML próprios, fora do app.)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${base}index.html`), {
    denylist: [/\/(obra|episodio|embed)\//, /\/feed\.xml$/, /\/transcripts\//],
  }),
)

const downloaded = async (request) => (await caches.open(AUDIO_CACHE)).match(request.url)

// Áudio do archive.org: se foi baixado, responde do cache (206 com Range); senão, vai para a rede como sempre.
registerRoute(
  ({ url, request }) => request.method === 'GET' && /(^|\.)archive\.org$/.test(url.hostname) && /\.(mp3|ogg|m4a)$/i.test(url.pathname),
  async ({ request }) => {
    const cached = await downloaded(request)
    return cached ? createPartialResponse(request, cached) : fetch(request)
  },
)

// Capas: baixada > vista antes > rede.
const coverStrategy = new CacheFirst({
  cacheName: COVER_CACHE,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 300, purgeOnQuotaError: true })],
})
registerRoute(
  ({ url, request }) => request.method === 'GET' && request.destination === 'image' && /(^|\.)archive\.org$/.test(url.hostname),
  async (ctx) => (await downloaded(ctx.request)) ?? coverStrategy.handle(ctx),
)

// Transcrições (.vtt do site): baixada > rede com revalidação.
const vttStrategy = new StaleWhileRevalidate({ cacheName: 'ondas-transcripts-v1', plugins: [new ExpirationPlugin({ maxEntries: 200 })] })
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.origin === self.location.origin && /\/transcripts\/.+\.vtt$/.test(url.pathname),
  async (ctx) => (await downloaded(ctx.request)) ?? vttStrategy.handle(ctx),
)

// Fontes escolhidas no painel de acessibilidade (não são pré-carregadas: só entram quando alguém as usa).
registerRoute(
  ({ request, url }) => request.destination === 'font' && url.origin === self.location.origin,
  new CacheFirst({ cacheName: 'ondas-fonts-v1', plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 20 })] }),
)
