// Valida os feeds RSS gerados (feed.xml e feeds/*.xml): XML bem formado, campos obrigatórios do RSS 2.0, do iTunes e do
// Podcasting 2.0. O build falha (código 1) se algum feed ficar inválido. Uso: node scripts/validate-feed.mjs [dist]
import { readdir, readFile } from 'node:fs/promises'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { podcastGuid } from './feed-lib.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const RFC822 = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/
const DURATION = /^\d{2,}:[0-5]\d:[0-5]\d$/
const txt = (v) => (typeof v === 'object' && v !== null ? v['#text'] : v)?.toString().trim()
const arr = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const isHttps = (u) => { try { return new URL(u).protocol === 'https:' } catch { return false } }

/** Devolve a lista de problemas (vazia = válido). */
export function validateFeed(xml, label = 'feed') {
  const errs = []
  const bad = (m) => errs.push(`${label}: ${m}`)
  const ok = XMLValidator.validate(xml)
  if (ok !== true) return [`${label}: XML mal formado (${ok.err.msg}, linha ${ok.err.line})`]
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, isArray: (n) => ['item', 'atom:link', 'itunes:category', 'podcast:transcript'].includes(n) }).parse(xml)
  const rss = doc.rss
  if (!rss || rss['@_version'] !== '2.0') return [`${label}: falta <rss version="2.0">`]
  const ch = rss.channel
  if (!ch) return [`${label}: falta <channel>`]

  for (const k of ['title', 'link', 'description', 'language', 'lastBuildDate', 'itunes:author', 'itunes:explicit']) if (!txt(ch[k])) bad(`canal sem <${k}>`)
  if (ch.lastBuildDate && !RFC822.test(txt(ch.lastBuildDate))) bad('lastBuildDate fora do formato RFC 822')
  if (!isHttps(ch['itunes:image']?.['@_href'])) bad('canal sem <itunes:image href> https')
  if (!['true', 'false'].includes(txt(ch['itunes:explicit']))) bad('itunes:explicit do canal deve ser true ou false')
  if (!arr(ch['itunes:category']).some((c) => c['@_text'])) bad('canal sem <itunes:category text>')
  const self = arr(ch['atom:link']).find((l) => l['@_rel'] === 'self')
  if (!self || !isHttps(self['@_href'])) bad('canal sem <atom:link rel="self"> https')
  const guid = txt(ch['podcast:guid'])
  if (!guid || !UUID.test(guid)) bad('canal sem <podcast:guid> válido (UUID v5)')
  else if (self && guid !== podcastGuid(self['@_href'])) bad('podcast:guid não corresponde à URL do feed')
  const locked = ch['podcast:locked']
  if (locked !== undefined && !['yes', 'no'].includes(txt(locked))) bad('podcast:locked deve ser yes ou no')
  if (ch['itunes:type'] !== undefined && !['episodic', 'serial'].includes(txt(ch['itunes:type']))) bad('itunes:type deve ser episodic ou serial')

  const items = arr(ch.item)
  if (!items.length) bad('o feed não tem nenhum <item>')
  const guids = new Set()
  items.forEach((it, i) => {
    const where = `item ${i + 1} (${txt(it.title)?.slice(0, 40) ?? '?'})`
    for (const k of ['title', 'guid', 'pubDate', 'description', 'itunes:duration', 'itunes:explicit']) if (!txt(it[k])) bad(`${where} sem <${k}>`)
    const g = txt(it.guid)
    if (g && guids.has(g)) bad(`${where}: guid repetido (${g})`)
    guids.add(g)
    if (it.pubDate && !RFC822.test(txt(it.pubDate))) bad(`${where}: pubDate fora do formato RFC 822`)
    if (it['itunes:duration'] && !DURATION.test(txt(it['itunes:duration']))) bad(`${where}: itunes:duration deve ser HH:MM:SS`)
    if (it['itunes:explicit'] && !['true', 'false'].includes(txt(it['itunes:explicit']))) bad(`${where}: itunes:explicit deve ser true ou false`)
    const enc = it.enclosure
    if (!enc || !isHttps(enc['@_url'])) bad(`${where}: <enclosure url> https obrigatório`)
    else {
      if (!(Number(enc['@_length']) > 0)) bad(`${where}: enclosure sem length > 0`)
      if (enc['@_type'] !== 'audio/mpeg') bad(`${where}: enclosure type deve ser audio/mpeg`)
    }
    for (const t of arr(it['podcast:transcript'])) if (!isHttps(t['@_url'])) bad(`${where}: podcast:transcript url https`)
    if (it['podcast:chapters'] && !isHttps(it['podcast:chapters']['@_url'])) bad(`${where}: podcast:chapters url https`)
    const lic = it['podcast:license']
    if (lic !== undefined && !isHttps(arr(lic)[0]?.['@_url'])) bad(`${where}: podcast:license precisa de url https`)
    if (it['itunes:episode'] !== undefined && !/^\d+$/.test(txt(it['itunes:episode']))) bad(`${where}: itunes:episode deve ser inteiro`)
  })
  return errs
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] || new URL('../dist', import.meta.url).pathname
  const files = ['feed.xml']
  try { files.push(...(await readdir(`${dist}/feeds`)).filter((f) => f.endsWith('.xml')).map((f) => `feeds/${f}`)) } catch { /* sem feeds por obra */ }
  let all = []
  for (const f of files) all = all.concat(validateFeed(await readFile(`${dist}/${f}`, 'utf8'), f))
  if (all.length) {
    console.error(`[feed] ${all.length} problema(s):\n  - ${all.slice(0, 40).join('\n  - ')}${all.length > 40 ? '\n  - …' : ''}`)
    process.exit(1)
  }
  console.log(`[feed] ${files.length} feed(s) válidos (RSS 2.0 + iTunes + Podcasting 2.0)`)
}
