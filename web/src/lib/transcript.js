// Utilitários da transcrição (puros, testados em transcript.test.js).
import { formatTime } from './format'

/** Mesma regra de pipeline/transcripts.py: quebra numa pausa > gap s, acima de max_chars ou de max_segments. */
export function toParagraphs(segments, { gap = 1.5, maxChars = 600, maxSegments = 6 } = {}) {
  const out = []
  let cur = null
  for (const seg of segments) {
    const text = seg.text.trim()
    if (!text) continue
    if (cur && (seg.start - cur.end > gap || cur.text.length + text.length > maxChars || cur.n >= maxSegments)) {
      out.push(cur)
      cur = null
    }
    if (!cur) cur = { start: seg.start, end: seg.end, text, n: 1 }
    else {
      cur.text += ` ${text}`
      cur.end = seg.end
      cur.n += 1
    }
  }
  if (cur) out.push(cur)
  return out.map(({ start, end, text }) => ({ start, end, text }))
}

/** Índice do último item cujo `start` ≤ t (+ folga), por busca binária; -1 se ainda não começou. */
export function findActive(items, t, slack = 0.2) {
  let lo = 0
  let hi = items.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].start <= t + slack) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

/** Minúsculas e sem acentos, mantendo 1 caractere por caractere (para mapear posições no texto original). */
export function fold(text) {
  return [...text.normalize('NFC')].map((c) => {
    const base = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    return base.length === 1 ? base : c.toLowerCase()
  }).join('')
}

/** Índices dos parágrafos que contêm a busca (ignora acentos e maiúsculas). */
export function searchParagraphs(paragraphs, query) {
  const q = fold(query.trim())
  if (!q) return []
  const hits = []
  paragraphs.forEach((p, i) => { if (fold(p.text).includes(q)) hits.push(i) })
  return hits
}

/** Divide o texto em [{text, hit}] para destacar as ocorrências da busca. */
export function highlight(text, query) {
  const q = fold(query.trim())
  if (!q) return [{ text, hit: false }]
  const folded = fold(text)
  const parts = []
  let from = 0
  for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, from)) {
    if (i > from) parts.push({ text: text.slice(from, i), hit: false })
    parts.push({ text: text.slice(i, i + q.length), hit: true })
    from = i + q.length
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false })
  return parts
}

export function buildTxt(paragraphs) {
  return `${paragraphs.map((p) => p.text).join('\n\n')}\n`
}

/** Markdown com cabeçalho (título, autor, licença, links) e o tempo de cada parágrafo. */
export function buildMd(meta, paragraphs, linkFor) {
  const lines = [`# ${meta.title}`, '']
  if (meta.author) lines.push(`- **Autor / programa:** ${meta.author}`)
  if (meta.license) lines.push(`- **Licença:** <${meta.license}>`)
  if (meta.episodeUrl) lines.push(`- **Ouça no Ondas:** <${meta.episodeUrl}>`)
  if (meta.archiveUrl) lines.push(`- **Arquivo no Internet Archive:** <${meta.archiveUrl}>`)
  lines.push('- **Transcrição automática**, pode conter erros', '', '## Transcrição', '')
  for (const p of paragraphs) {
    const stamp = `[${formatTime(p.start)}]${linkFor ? `(${linkFor(p.start)})` : ''}`
    lines.push(`**${stamp}** ${p.text}`, '')
  }
  return lines.join('\n')
}

/** Caminho relativo do catálogo (ex.: "transcripts/x.vtt") vira URL do site; absolutas passam direto. */
export function resolveUrl(url, base = import.meta.env.BASE_URL) {
  return /^https?:\/\//i.test(url) ? url : `${base}${url.replace(/^\//, '')}`
}

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slugForFile = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'transcricao'
