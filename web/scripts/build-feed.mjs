// Gera dist/feed.xml (RSS 2.0 + tags iTunes) a partir de public/catalog.json.
// Roda depois do `vite build`. A URL do site vem de SITE_URL; no GitHub Actions
// é derivada de GITHUB_REPOSITORY (https://<dono>.github.io/<repo>/).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildBooks } from '../src/lib/books.js'
import { feedXml, itemXml as renderItem } from './feed-lib.mjs'
import { site } from './site.mjs'
import { clip, synopsis } from './text.mjs'

const root = new URL('../', import.meta.url)

// Dados do canal (título, autor, categoria, locked, e-mail do dono opcional): config/channel.json
const CHANNEL = JSON.parse(await readFile(new URL('../config/channel.json', root), 'utf8'))

/** Tamanhos já publicados no feed do site (reserva quando o archive.org falha no build). */
async function previousLengths() {
  try {
    const res = await fetch(`${site}feed.xml`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return new Map()
    const xml = await res.text()
    return new Map([...xml.matchAll(/<enclosure url="([^"]+)" length="(\d+)"/g)].map((m) => [m[1].replace(/&amp;/g, '&'), Number(m[2])]))
  } catch {
    return new Map()
  }
}

/** Tamanho em bytes do MP3 (obrigatório no <enclosure>): feed já publicado, senão HEAD com tentativas, senão estimativa. */
async function audioLength(ep, previous) {
  // O arquivo no archive.org não muda de tamanho; ignora valores que foram só estimativa no build anterior.
  const known = previous.get(ep.audioUrl)
  if (known && known !== Math.round(ep.duration * 12000)) return known
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ep.audioUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) })
      const n = Number(res.headers.get('content-length'))
      if (res.ok && n > 0) return n
    } catch {
      /* tenta de novo */
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  console.warn(`[feed] não consegui o tamanho de ${ep.id}; estimando (96 kbps)`)
  return Math.round(ep.duration * 12000)
}

/** Executa `fn` sobre `list` com no máximo `limit` chamadas simultâneas (o archive.org não gosta de rajadas). */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++
        out[i] = await fn(list[i])
      }
    }),
  )
  return out
}

const { episodes } = JSON.parse(await readFile(new URL('public/catalog.json', root), 'utf8'))
const sorted = [...episodes].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
// --offline: não consulta a rede (testes e CI): os tamanhos dos MP3 viram estimativa. O build de produção sempre consulta.
const offline = process.argv.includes('--offline')
const previous = offline ? new Map() : await previousLengths()
const lengths = offline ? sorted.map((ep) => Math.round(ep.duration * 12000)) : await mapLimit(sorted, 6, (ep) => audioLength(ep, previous))

/** Capítulos no formato Podcasting 2.0 (JSON Chapters 1.2.0), um arquivo por episódio. */
const withChapters = sorted.filter((ep) => ep.chapters?.length)
await mkdir(new URL('dist/chapters/', root), { recursive: true })
await Promise.all(
  withChapters.map((ep) =>
    writeFile(
      new URL(`dist/chapters/${ep.id}.json`, root),
      JSON.stringify(
        { version: '1.2.0', title: ep.title, chapters: ep.chapters.map((c) => ({ startTime: c.start, title: c.title })) },
        null,
        2,
      ) + '\n',
    ),
  ),
)

/** Transcrição como WebVTT (Podcasting 2.0 <podcast:transcript>), um arquivo por episódio. */
const vttTime = (sec) => {
  const ms = Math.round(sec * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`
}
const withTranscript = sorted.filter((ep) => ep.transcript?.length) // legado: segmentos dentro do catálogo
const transcriptUrl = (ep) => {
  // Preferência: arquivo .vtt registrado no catálogo (absoluto ou relativo ao site); senão o gerado acima.
  const u = ep.transcripts?.vtt
  if (u) return /^https?:\/\//i.test(u) ? u : `${site}${u.replace(/^\//, '')}`
  return ep.transcript?.length ? `${site}transcripts/${ep.id}.vtt` : null
}
await mkdir(new URL('dist/transcripts/', root), { recursive: true })
await Promise.all(
  withTranscript.map((ep) =>
    writeFile(
      new URL(`dist/transcripts/${ep.id}.vtt`, root),
      'WEBVTT\n\n' +
        ep.transcript.map((t) => `${vttTime(t.start)} --> ${vttTime(t.end)}\n${t.text.trim()}\n`).join('\n'),
    ),
  ),
)

/** Cada obra (`series`) vira uma temporada, numerada pela data do seu primeiro episódio (estável). */
const seasons = new Map(
  [...new Set(episodes.filter((e) => e.series).sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt)).map((e) => e.series))].map(
    (name, i) => [name, i + 1],
  ),
)

const lengthOf = new Map(sorted.map((ep, i) => [ep.id, lengths[i]]))

const itemCtx = { site, lengthOf: (ep) => lengthOf.get(ep.id), seasons, transcriptUrl, language: CHANNEL.language }
const itemXml = (ep, opts = {}) => renderItem(ep, { ...itemCtx, ...opts })

const items = sorted.map((ep) => itemXml(ep))

const baseChannel = { ...CHANNEL, link: site }
const feed = feedXml({ ...baseChannel, self: `${site}feed.xml`, image: `${site}cover-1400.png` }, items)

await writeFile(new URL('dist/feed.xml', root), feed)
console.log(`[feed] dist/feed.xml: ${sorted.length} episódios, ${withChapters.length} com capítulos, ${sorted.filter((e) => transcriptUrl(e)).length} com transcrição (${site}feed.xml)`)

// Feeds por obra (feeds/<slug>.xml): quem quer acompanhar só uma série assina só ela. As partes saem em ordem
// (itunes:type serial) e com datas escalonadas de 1 minuto, porque todas as partes de uma obra têm a mesma data de publicação.
const books = buildBooks(episodes)
await mkdir(new URL('dist/feeds/', root), { recursive: true })
for (const b of books) {
  const list = b.parts.map((ep, i) => itemXml(ep, { pubDate: new Date(Date.parse(ep.publishedAt) + i * 60000) }))
  const xml = feedXml(
    {
      ...baseChannel,
      title: b.title,
      link: `${site}obra/${encodeURIComponent(b.slug)}/`,
      self: `${site}feeds/${encodeURIComponent(b.slug)}.xml`,
      description: clip(synopsis(b.description), 600) || `${b.title}, de ${b.author}.`,
      author: b.author,
      image: b.cover || `${site}cover-1400.png`,
      type: b.isSeries ? 'serial' : 'episodic',
    },
    list,
  )
  await writeFile(new URL(`dist/feeds/${b.slug}.xml`, root), xml)
}
console.log(`[feed] ${books.length} feeds por obra em dist/feeds/<obra>.xml`)
