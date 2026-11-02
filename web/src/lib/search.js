// Busca no catálogo inteiro (MiniSearch), com índice gerado no build (scripts/build-search.mjs → dist/search-index.json).
// Indexa obras (título, autor, descrição, assuntos, títulos das partes), capítulos e o TEXTO das transcrições, por trecho com
// o tempo, para "achar o episódio em que falam de X". Sem acento, sem maiúsculas, tolera erro de digitação e prefixo.
import MiniSearch from 'minisearch'
import { toParagraphs } from './transcript.js'

/** minúsculas e sem acento (mesmo comprimento para texto em NFC: serve para achar posições no original). */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Palavras tão comuns que só atrapalham ("de", "a", "o"): saem do índice e da consulta.
const STOP = new Set('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem e ou que se ao aos à às pelo pela pelos pelas mas como foi era ser tem ha'.split(' '))

export const OPTIONS = {
  fields: ['title', 'author', 'text', 'parts'],
  storeFields: ['kind', 'slug', 'ep', 'start', 'snippet'],
  processTerm: (term) => {
    const t = fold(term)
    return t.length < 2 && !/\d/.test(t) ? null : STOP.has(t) ? null : t
  },
}
export const SEARCH_OPTIONS = {
  prefix: true,
  fuzzy: (term) => (term.length > 4 ? 0.2 : false),
  boost: { title: 4, author: 3, parts: 1.5, text: 1 },
  combineWith: 'AND',
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const SNIPPET = 260

/**
 * Documentos do índice. `segmentsFor(ep)` devolve os segmentos [{start,end,text}] da transcrição do episódio (ou []).
 * `books` vem de buildBooks. Os ids são estáveis: w:<obra> · c:<ep>:<n> · p:<ep>:<segundo>.
 */
export function buildDocuments(books, segmentsFor = () => []) {
  const docs = []
  for (const b of books) {
    docs.push({
      id: `w:${b.slug}`, kind: 'work', slug: b.slug, title: b.title, author: b.author,
      text: clip([b.description, ...b.parts.flatMap((p) => p.tags || [])].join(' '), 1800),
      parts: clip(b.parts.map((p) => p.title).join(' · '), 3000),
    })
    for (const ep of b.parts) {
      ;(ep.chapters || []).forEach((c, i) => {
        docs.push({ id: `c:${ep.id}:${i}`, kind: 'chapter', slug: b.slug, ep: ep.id, start: Math.floor(c.start), title: b.title, author: b.author, text: c.title, snippet: c.title })
      })
      for (const p of toParagraphs(segmentsFor(ep) || [])) {
        docs.push({ id: `p:${ep.id}:${Math.floor(p.start)}`, kind: 'passage', slug: b.slug, ep: ep.id, start: Math.floor(p.start), title: b.title, author: b.author, text: p.text, snippet: clip(p.text, SNIPPET * 2) })
      }
    }
  }
  return docs
}

export function buildIndex(docs) {
  const index = new MiniSearch(OPTIONS)
  index.addAll(docs)
  return index
}

/** O que o navegador baixa (objeto JSON serializável). */
export const serializeIndex = (index) => index.toJSON()
export const loadIndex = (json) => MiniSearch.loadJS(json, OPTIONS)

/**
 * { works: [{slug, score}], passages: [{slug, ep, start, snippet, kind, score, terms}] }.
 * `passages` mistura trechos de transcrição e capítulos, do mais relevante para o menos.
 */
export function search(index, text, { maxPassages = 20 } = {}) {
  const q = String(text ?? '').trim()
  if (!q || !fold(q).replace(/[^a-z0-9]/g, '')) return { works: [], passages: [] }
  const raw = index.search(q, SEARCH_OPTIONS)
  const works = []
  const passages = []
  for (const r of raw) {
    if (r.kind === 'work') works.push({ slug: r.slug, score: r.score })
    else if (passages.length < maxPassages) passages.push({ slug: r.slug, ep: r.ep, start: r.start, snippet: r.snippet, kind: r.kind, score: r.score, terms: r.terms })
  }
  // Obras que só aparecem por causa de um trecho também entram na lista de obras (depois das que casam direto).
  const seen = new Set(works.map((w) => w.slug))
  for (const p of passages) if (!seen.has(p.slug)) { seen.add(p.slug); works.push({ slug: p.slug, score: p.score * 0.5 }) }
  return { works, passages }
}

/**
 * Recorta o trecho em volta da primeira palavra achada e marca as palavras que casaram.
 * `terms` são termos do índice (já sem acento); devolve [{text, hit}].
 */
export function snippetParts(text, terms, width = SNIPPET) {
  const want = new Set((terms || []).map(fold))
  const wordRe = /[\p{L}\p{N}]+/gu
  const hits = []
  for (const m of text.matchAll(wordRe)) if (want.has(fold(m[0])) || [...want].some((t) => t.length > 2 && fold(m[0]).startsWith(t))) hits.push([m.index, m.index + m[0].length])
  let from = 0
  let to = text.length
  if (text.length > width) {
    const center = hits.length ? hits[0][0] : 0
    from = Math.max(0, center - Math.floor(width / 3))
    to = Math.min(text.length, from + width)
    from = Math.max(0, to - width)
    const sp = text.indexOf(' ', from)
    if (from > 0 && sp > -1 && sp < from + 20) from = sp + 1
    const lastSp = text.lastIndexOf(' ', to)
    if (to < text.length && lastSp > to - 20) to = lastSp
  }
  const parts = []
  if (from > 0) parts.push({ text: '… ', hit: false })
  let pos = from
  for (const [a, b] of hits) {
    if (b <= from || a >= to) continue
    if (a > pos) parts.push({ text: text.slice(pos, a), hit: false })
    parts.push({ text: text.slice(Math.max(a, from), Math.min(b, to)), hit: true })
    pos = Math.min(b, to)
  }
  if (pos < to) parts.push({ text: text.slice(pos, to), hit: false })
  if (to < text.length) parts.push({ text: ' …', hit: false })
  return parts
}
