// Gera dist/feed.xml (RSS 2.0 + tags iTunes) a partir de public/catalog.json.
// Roda depois do `vite build`. A URL do site vem de SITE_URL; no GitHub Actions
// é derivada de GITHUB_REPOSITORY (https://<dono>.github.io/<repo>/).
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const repo = process.env.GITHUB_REPOSITORY?.split('/')
const site = (
  process.env.SITE_URL ||
  (repo ? `https://${repo[0].toLowerCase()}.github.io/${repo[1]}/` : 'https://jkfa.github.io/ondas-podcast/')
).replace(/\/?$/, '/')

const CHANNEL = {
  title: 'Ondas',
  description: 'Podcasts independentes, hospedados no Internet Archive.',
  language: 'pt-br',
  author: 'Ondas',
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

/** Markdown simples → texto puro (o feed usa só texto). */
const plain = (md = '') =>
  md
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*(.+?)\*\*|\*(.+?)\*/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim()

const hms = (sec) => {
  const s = Math.round(sec)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Tamanho em bytes do MP3 (obrigatório no <enclosure>); estima se o HEAD falhar. */
async function audioLength(ep) {
  try {
    const res = await fetch(ep.audioUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const n = Number(res.headers.get('content-length'))
    if (res.ok && n > 0) return n
  } catch {
    /* sem rede: cai na estimativa */
  }
  console.warn(`[feed] não consegui o tamanho de ${ep.id}; estimando (96 kbps)`)
  return Math.round(ep.duration * 12000)
}

const { episodes } = JSON.parse(await readFile(new URL('public/catalog.json', root), 'utf8'))
const sorted = [...episodes].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
const lengths = await Promise.all(sorted.map(audioLength))

const items = sorted.map((ep, i) => {
  const text = [plain(ep.description), ep.license && `Licença: ${ep.license}`].filter(Boolean).join('\n\n')
  return `    <item>
      <title>${esc(ep.title)}</title>
      <link>${esc(site)}</link>
      <guid isPermaLink="false">${esc(ep.id)}</guid>
      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>
      <description>${esc(text)}</description>
      <enclosure url="${esc(ep.audioUrl)}" length="${lengths[i]}" type="audio/mpeg"/>
      <itunes:author>${esc(ep.show)}</itunes:author>
      <itunes:duration>${hms(ep.duration)}</itunes:duration>${ep.cover ? `\n      <itunes:image href="${esc(ep.cover)}"/>` : ''}
    </item>`
})

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(CHANNEL.title)}</title>
    <link>${esc(site)}</link>
    <atom:link href="${esc(site)}feed.xml" rel="self" type="application/rss+xml"/>
    <description>${esc(CHANNEL.description)}</description>
    <language>${CHANNEL.language}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${esc(CHANNEL.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${esc(site)}icon-512.png"/>
${items.join('\n')}
  </channel>
</rss>
`

await writeFile(new URL('dist/feed.xml', root), feed)
console.log(`[feed] dist/feed.xml: ${sorted.length} episódios (${site}feed.xml)`)
