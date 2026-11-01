// Apps de podcast e como assinar o feed neles. Cada esquema de URL abaixo foi conferido na documentação
// de cada app em 2026-11-01 (campo `verified` + `source`). Só entram como "um toque" os que têm link
// documentado ou confirmado; os demais ficam com passo a passo manual (sem inventar esquemas que não existem).
//
// Diferenças em relação à tabela original do projeto, descobertas na verificação:
//  - AntennaPod: o esquema antennapod-subscribe:// NÃO está documentado; o link oficial é
//    https://antennapod.org/deeplink/subscribe?url=…&title=… (abre o app se instalado, senão mostra instruções).
//  - Pocket Casts: pktc://subscribe/ está documentado só para iOS, e sem o "http://" do feed.
//  - Apple Podcasts: podcast://<feed sem esquema> funciona (relatos em macOS 12 e iOS 16), mas a Apple não o documenta.
//  - Castro, Podcast Addict, Castbox, Podverse e Fountain: nenhum link de assinatura documentado → passo a passo.
const enc = encodeURIComponent
const noScheme = (url) => url.replace(/^https?:\/\//i, '')
const VERIFIED = '2026-11-01'

export const APPS = [
  {
    id: 'applepodcasts', name: 'Apple Podcasts', kind: 'link', platforms: ['ios', 'mac'], official: false, verified: VERIFIED,
    source: 'https://stackoverflow.com/questions/33208299 (relatos da comunidade; a Apple não documenta o esquema)',
    href: (feed) => `podcast://${noScheme(feed)}`,
    store: { ios: 'https://apps.apple.com/br/app/apple-podcasts/id525463029' },
  },
  {
    id: 'overcast', name: 'Overcast', kind: 'link', platforms: ['ios'], official: true, verified: VERIFIED,
    source: 'https://overcast.fm/podcasterinfo',
    href: (feed) => `overcast://x-callback-url/add?url=${enc(feed)}`,
    store: { ios: 'https://apps.apple.com/br/app/overcast/id888422857' },
  },
  {
    id: 'pocketcasts', name: 'Pocket Casts', kind: 'link', platforms: ['ios'], official: true, verified: VERIFIED,
    source: 'https://support.pocketcasts.com/knowledge-base/how-can-i-use-pocket-casts-with-apps-like-launch-center/',
    href: (feed) => `pktc://subscribe/${noScheme(feed)}`,
    store: { ios: 'https://apps.apple.com/br/app/pocket-casts/id414834813', android: 'https://play.google.com/store/apps/details?id=au.com.shiftyjelly.pocketcasts' },
    steps: ['Abra o Pocket Casts e toque em Descobrir.', 'Toque na lupa, cole o endereço do feed e escolha o programa.', 'Toque em Assinar.'],
    manualPlatforms: ['android', 'desktop'],
  },
  {
    id: 'antennapod', name: 'AntennaPod', kind: 'link', platforms: ['android'], official: true, verified: VERIFIED, web: true,
    source: 'https://antennapod.org/documentation/podcasters-hosters/add-on-antennapod',
    href: (feed, title) => `https://antennapod.org/deeplink/subscribe?url=${enc(feed)}&title=${enc(title)}`,
    store: { android: 'https://play.google.com/store/apps/details?id=de.danoeh.antennapod', fdroid: 'https://f-droid.org/packages/de.danoeh.antennapod/' },
  },
  {
    id: 'castro', name: 'Castro', kind: 'manual', platforms: ['ios'], verified: VERIFIED,
    source: 'https://www.macworld.com/article/234395/how-to-add-a-podcast-by-url-feed-to-podcasts-app-castro-overcast-pocketcasts.html',
    steps: ['Copie o endereço do feed (botão abaixo).', 'No Castro, toque na lupa (canto superior direito) e cole o endereço.', 'Escolha o programa e toque em Assinar.'],
    store: { ios: 'https://apps.apple.com/dk/app/id1080840241' },
  },
  {
    id: 'podcastaddict', name: 'Podcast Addict', kind: 'manual', platforms: ['android'], verified: VERIFIED,
    source: 'https://slatehelp.freshdesk.com/support/solutions/articles/16000086982-podcast-addict',
    steps: ['Copie o endereço do feed (botão abaixo).', 'No Podcast Addict, toque em “+” e em “Adicionar um podcast”.', 'Escolha “URL do feed RSS”, cole o endereço e toque em Adicionar.'],
    store: { android: 'https://play.google.com/store/apps/details?id=com.bambuna.podcastaddict' },
  },
  {
    id: 'castbox', name: 'Castbox', kind: 'manual', platforms: ['ios', 'android'], verified: VERIFIED,
    source: 'https://www.thepitch.show/blog/how-to-manually-add-an-rss-feed-to-your-podcast-app-on-desktop-ios-android',
    steps: ['Copie o endereço do feed (botão abaixo).', 'No Castbox, abra Descobrir e cole o endereço na busca.', 'Abra o programa e toque em Assinar.'],
    store: { android: 'https://play.google.com/store/apps/details?id=fm.castbox.audiobook.radio.podcast' },
  },
  {
    id: 'podverse', name: 'Podverse', kind: 'manual', platforms: ['ios', 'android', 'desktop'], verified: VERIFIED,
    source: 'https://help.helloaudio.fm/en/articles/12405129-how-do-i-use-podverse-to-listen-to-private-podcasts',
    steps: ['Copie o endereço do feed (botão abaixo).', 'No Podverse, abra o menu “Mais” e escolha adicionar um feed RSS.', 'Cole o endereço e salve.'],
    site: 'https://podverse.fm',
  },
  {
    id: 'fountain', name: 'Fountain', kind: 'manual', platforms: ['ios', 'android'], verified: VERIFIED,
    source: 'https://support.fountain.fm/article/109-how-do-i-add-my-podcast-to-fountain',
    steps: ['O Fountain não assina um feed diretamente: ele usa o Podcast Index.', 'Cadastre o feed em podcastindex.org/add (precisa ser feito uma vez pelo dono do projeto).', 'Alguns minutos depois, procure “Ondas” na busca do Fountain.'],
    site: 'https://podcastindex.org/add',
  },
]

/** Plataformas que não aceitam RSS qualquer: só aparecem se `config/platforms.json` tiver o link. */
export const PLATFORMS = [
  { id: 'spotify', name: 'Spotify', configKey: 'spotify' },
  { id: 'youtubemusic', name: 'YouTube Music', configKey: 'youtubeMusic' },
  { id: 'amazonmusic', name: 'Amazon Music', configKey: 'amazonMusic' },
  { id: 'deezer', name: 'Deezer', configKey: 'deezer' },
]

/** 'ios' | 'android' | 'mac' | 'desktop' a partir do que o navegador diz (puro: recebe os dados). */
export function detectPlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mac/i.test(platform) || /Mac OS X/.test(userAgent)) return 'mac'
  return 'desktop'
}

/** Apps com assinatura por link para esta plataforma e os que ficam com passo a passo manual. */
export function appsFor(platform) {
  const oneTap = APPS.filter((a) => a.kind === 'link' && (a.platforms.includes(platform) || (platform === 'desktop' && a.web)))
  const manual = APPS.filter(
    (a) => !oneTap.includes(a) && a.steps && (platform === 'desktop' || platform === 'mac' || a.platforms.includes(platform) || a.manualPlatforms?.includes(platform)),
  )
  return { oneTap, manual }
}

/** O feed (geral ou de uma obra) em URL absoluta. */
export const feedUrl = (base, slug) => `${base.replace(/\/?$/, '/')}${slug ? `feeds/${encodeURIComponent(slug)}.xml` : 'feed.xml'}`

/** Plataformas com link preenchido em config/platforms.json (campo vazio = botão oculto). */
export const visiblePlatforms = (config) => PLATFORMS.filter((p) => typeof config?.[p.configKey] === 'string' && /^https:\/\//.test(config[p.configKey].trim()))
