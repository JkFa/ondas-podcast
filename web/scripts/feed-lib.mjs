// Montagem do RSS (RSS 2.0 + iTunes + Podcasting 2.0). Funções puras, testadas em feed-lib.test.js.
import { createHash } from 'node:crypto'

export const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

/** Markdown simples → texto puro (o feed usa só texto). */
export const plain = (md = '') =>
  String(md)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*(.+?)\*\*|\*(.+?)\*/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim()

export const hms = (sec) => {
  const s = Math.round(sec)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

/** UUID versão 5 (RFC 4122): SHA-1 de namespace + nome. */
export function uuidV5(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(ns).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

export const PODCAST_NAMESPACE = 'ead4c236-bf58-58c6-a2c6-a6b28d128cb6' // namespace oficial do podcast:guid

/** podcast:guid = UUIDv5 da URL do feed sem o protocolo e sem barras no fim (especificação do Podcasting 2.0). */
export const podcastGuid = (feedUrl) => uuidV5(feedUrl.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, ''), PODCAST_NAMESPACE)

/** "https://creativecommons.org/licenses/by-nc-sa/4.0/" → "CC BY-NC-SA 4.0"; CC0 e domínio público também. */
export function licenseName(url) {
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/.exec(url ?? '')
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`
  if (/publicdomain\/zero/.test(url ?? '')) return 'CC0 1.0'
  if (/publicdomain\/mark/.test(url ?? '')) return 'Public Domain Mark 1.0'
  return null
}

export const rfc822 = (date) => new Date(date).toUTCString()

/**
 * <item> de um episódio. `ctx`: { site, lengthOf(ep), seasons: Map, transcriptUrl(ep), language, pubDate? }.
 * `pubDate` permite escalonar as partes de uma obra (feeds por obra).
 */
export function itemXml(ep, ctx) {
  const pubDate = ctx.pubDate ?? new Date(ep.publishedAt)
  const lic = licenseName(ep.license)
  const text = [plain(ep.description), ep.license && `Licença: ${lic ?? ep.license}`].filter(Boolean).join('\n\n')
  const tUrl = ctx.transcriptUrl(ep)
  return `    <item>
      <title>${escXml(ep.title)}</title>
      <link>${escXml(ctx.site)}</link>
      <guid isPermaLink="false">${escXml(ep.id)}</guid>
      <pubDate>${rfc822(pubDate)}</pubDate>
      <description>${escXml(text)}</description>
      <enclosure url="${escXml(ep.audioUrl)}" length="${ctx.lengthOf(ep)}" type="audio/mpeg"/>
      <itunes:author>${escXml(ep.show)}</itunes:author>
      <itunes:summary>${escXml(ep.shortDescription || plain(ep.description).slice(0, 255))}</itunes:summary>
      <itunes:duration>${hms(ep.duration)}</itunes:duration>
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>${
        ep.series && ep.part
          ? `\n      <itunes:season>${ctx.seasons.get(ep.series)}</itunes:season>\n      <itunes:episode>${ep.part}</itunes:episode>\n      <itunes:episodeType>full</itunes:episodeType>`
          : ''
      }${lic ? `\n      <podcast:license url="${escXml(ep.license)}">${escXml(lic)}</podcast:license>` : ''}${
        ep.chapters?.length
          ? `\n      <podcast:chapters url="${escXml(`${ctx.site}chapters/${ep.id}.json`)}" type="application/json+chapters"/>`
          : ''
      }${
        tUrl ? `\n      <podcast:transcript url="${escXml(tUrl)}" type="text/vtt" language="${ep.transcripts?.language || ctx.language.split('-')[0]}"/>` : ''
      }${ep.cover ? `\n      <itunes:image href="${escXml(ep.cover)}"/>` : ''}
    </item>`
}

/**
 * Feed completo. `channel`: { title, link, self, description, author, image, language, type?, explicit, category?,
 * subcategory?, ownerName?, ownerEmail?, locked?, copyright? }.
 */
export function feedXml(channel, items, now = new Date()) {
  const c = channel
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${escXml(c.title)}</title>
    <link>${escXml(c.link)}</link>
    <atom:link href="${escXml(c.self)}" rel="self" type="application/rss+xml"/>
    <description>${escXml(c.description)}</description>
    <language>${c.language}</language>${c.copyright ? `\n    <copyright>${escXml(c.copyright)}</copyright>` : ''}
    <lastBuildDate>${rfc822(now)}</lastBuildDate>
    <podcast:guid>${podcastGuid(c.self)}</podcast:guid>${
      c.locked ? `\n    <podcast:locked${c.ownerEmail ? ` owner="${escXml(c.ownerEmail)}"` : ''}>yes</podcast:locked>` : ''
    }
    <itunes:author>${escXml(c.author)}</itunes:author>
    <itunes:summary>${escXml(c.description)}</itunes:summary>
    <itunes:explicit>${c.explicit ? 'true' : 'false'}</itunes:explicit>${c.type ? `\n    <itunes:type>${c.type}</itunes:type>` : ''}
    <itunes:image href="${escXml(c.image)}"/>${
      c.category
        ? c.subcategory
          ? `\n    <itunes:category text="${escXml(c.category)}"><itunes:category text="${escXml(c.subcategory)}"/></itunes:category>`
          : `\n    <itunes:category text="${escXml(c.category)}"/>`
        : ''
    }${
      c.ownerName || c.ownerEmail
        ? `\n    <itunes:owner>${c.ownerName ? `<itunes:name>${escXml(c.ownerName)}</itunes:name>` : ''}${c.ownerEmail ? `<itunes:email>${escXml(c.ownerEmail)}</itunes:email>` : ''}</itunes:owner>`
        : ''
    }
${items.join('\n')}
  </channel>
</rss>
`
}
