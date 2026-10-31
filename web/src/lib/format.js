/** 75 → "1:15"; 3725 → "1:02:05" */
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** 45 → "1 min"; 3000 → "50 min"; 18720 → "5 h 12 min" */
export function formatDuration(sec) {
  const m = Math.max(1, Math.round((Number.isFinite(sec) ? sec : 0) / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')} min` : ''}`
}

/** Texto para leitores de tela: "12 minutos de 45". */
export function spokenProgress(pos, dur) {
  const min = (s) => {
    const m = Math.floor((s || 0) / 60)
    return `${m} ${m === 1 ? 'minuto' : 'minutos'}`
  }
  return dur ? `${min(pos)} de ${Math.round(dur / 60)}` : min(pos)
}

export function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "12:34" | "1:02:03" | "34" → segundos (ou null se inválido). */
export function parseTimestamp(str) {
  const parts = str.trim().split(':').map(Number)
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Textarea "00:00 Abertura" (uma por linha) → [{start,title}] ordenado. */
export function parseChapters(text) {
  return text
    .split('\n')
    .map((line) => line.trim().match(/^\[?(\d{1,2}(?::\d{2}){1,2})\]?\s*[-–—]?\s*(.+)$/))
    .filter(Boolean)
    .map((m) => ({ start: parseTimestamp(m[1]), title: m[2].trim() }))
    .filter((c) => c.start !== null)
    .sort((a, b) => a.start - b.start)
}

export function chaptersToText(chapters = []) {
  return chapters.map((c) => `${formatTime(c.start)} ${c.title}`).join('\n')
}

/**
 * Markdown mínimo → blocos. Suporta parágrafos, títulos (#), listas (-/*),
 * **negrito**, *itálico* e [links](http...). O HTML nunca é interpretado:
 * a renderização usa elementos React, então não há injeção.
 */
export function parseMarkdown(src = '') {
  const blocks = []
  let list = null
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd()
    const item = line.match(/^\s*[-*]\s+(.*)$/)
    if (item) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }))
      list.items.push(item[1])
      continue
    }
    list = null
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) blocks.push({ type: 'h', text: h[1] })
    else if (line.trim()) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'p') last.text += ' ' + line.trim()
      else blocks.push({ type: 'p', text: line.trim() })
    }
  }
  return blocks
}

/** Texto → tokens inline [{t:'text'|'b'|'i'|'a', text, href?}]. */
export function parseInline(text) {
  const out = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'b', text: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'i', text: m[2] })
    else out.push({ t: 'a', text: m[3], href: m[4] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}
