/** WebVTT → [{start, end, text}] (segundos). Ignora cabeçalho, NOTE/STYLE, identificadores e tags <i>, <b>, <c>. */
const TIME = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/

const toSeconds = (m) => (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3] + +m[4] / 1000

export function parseVtt(text) {
  const segments = []
  const blocks = String(text).replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0 || /^(NOTE|STYLE|REGION)/.test(lines[0])) continue
    const [a, b] = lines[i].split('-->')
    const start = TIME.exec(a)
    const end = TIME.exec(b)
    if (!start || !end) continue
    const body = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (body) segments.push({ start: toSeconds(start), end: toSeconds(end), text: body })
  }
  return segments
}
