// Estatísticas pessoais de escuta. Ficam só no aparelho (localStorage 'ondas:v1:stats'); nada é enviado a lugar nenhum.
// Formato: { since: 'AAAA-MM-DD', days: { 'AAAA-MM-DD': { c: segundos de conteúdo, w: segundos reais } } }
//   c = quanto do áudio foi ouvido (a 2× rende o dobro por segundo real) · w = tempo real de escuta (para a velocidade média).
import { bookStats } from './books'

export const EMPTY_STATS = { since: null, days: {} }
const MAX_DAYS = 800
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Data local (não UTC) no formato AAAA-MM-DD: "hoje" tem que ser o dia de quem ouve. */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/**
 * Soma um trecho ouvido. `content`/`wall` em segundos; valores inválidos ou negativos são ignorados.
 * Devolve um novo objeto (e poda dias muito antigos).
 */
export function addListening(stats, content, wall, now = new Date()) {
  if (!(content > 0) || !(wall > 0) || !Number.isFinite(content) || !Number.isFinite(wall)) return stats
  const key = dayKey(now)
  const day = stats.days[key] || { c: 0, w: 0 }
  const days = { ...stats.days, [key]: { c: day.c + content, w: day.w + wall } }
  const keys = Object.keys(days).sort()
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete days[k]
  return { since: stats.since || key, days }
}

/**
 * Mede um intervalo entre dois `timeupdate`. Só conta reprodução contínua: um salto na posição (arrastar a barra, ir para
 * um capítulo) tem `dm` bem maior que o tempo real decorrido e é descartado, assim como pausas longas entre eventos.
 */
export function tickDelta(prev, mediaTime, wallNow, rate = 1) {
  if (!prev) return null
  const dm = mediaTime - prev.media
  const dw = (wallNow - prev.wall) / 1000
  if (!(dm > 0) || !(dw > 0) || dw > 5) return null
  if (dm > dw * Math.max(rate, 1) * 1.5 + 0.5) return null
  return { content: dm, wall: dw }
}

/** Valida o que veio do localStorage ou de um backup. */
export function sanitizeStats(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.days !== 'object' || !raw.days) return { ...EMPTY_STATS, days: {} }
  const days = {}
  for (const [k, v] of Object.entries(raw.days)) {
    if (!DAY_RE.test(k) || !v || typeof v !== 'object') continue
    const c = Number(v.c)
    const w = Number(v.w)
    if (Number.isFinite(c) && Number.isFinite(w) && c >= 0 && w >= 0 && c < 86400 * 2 && w < 86400) days[k] = { c, w }
  }
  const since = typeof raw.since === 'string' && DAY_RE.test(raw.since) ? raw.since : Object.keys(days).sort()[0] || null
  return { since, days }
}

/** Junta duas estatísticas pegando o MAIOR valor de cada dia (importar o mesmo backup duas vezes não duplica nada). */
export function mergeStats(a, b) {
  const days = { ...a.days }
  for (const [k, v] of Object.entries(b.days)) days[k] = !days[k] ? v : { c: Math.max(days[k].c, v.c), w: Math.max(days[k].w, v.w) }
  const since = [a.since, b.since].filter(Boolean).sort()[0] || null
  return { since, days }
}

const addDays = (date, n) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
  return d
}

/** Últimos `n` dias (do mais antigo ao de hoje): [{ key, date, c }]. */
export function lastDays(stats, n = 7, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(now, i - (n - 1))
    const key = dayKey(date)
    return { key, date, c: stats.days[key]?.c || 0 }
  })
}

/** Sequência atual de dias seguidos com escuta (hoje ainda sem escuta não quebra a sequência de ontem). */
export function streak(stats, now = new Date()) {
  let n = 0
  let d = now
  if (!(stats.days[dayKey(d)]?.c > 0)) d = addDays(d, -1)
  while (stats.days[dayKey(d)]?.c > 0) {
    n += 1
    d = addDays(d, -1)
  }
  return n
}

/** Números da tela: tempo total, hoje, 7 dias, dias ativos, média, sequência, velocidade média e o que foi concluído. */
export function summarize(stats, progress, books, now = new Date()) {
  const entries = Object.values(stats.days)
  const total = entries.reduce((s, d) => s + d.c, 0)
  const wall = entries.reduce((s, d) => s + d.w, 0)
  const active = entries.filter((d) => d.c > 0).length
  const week = lastDays(stats, 7, now)
  const weekTotal = week.reduce((s, d) => s + d.c, 0)
  let episodesDone = 0
  let booksDone = 0
  let booksOngoing = 0
  for (const b of books) {
    const s = bookStats(b, progress)
    episodesDone += s.done
    if (s.finished) booksDone += 1
    else if (s.started) booksOngoing += 1
  }
  return {
    total,
    today: stats.days[dayKey(now)]?.c || 0,
    weekTotal,
    activeDays: active,
    avgPerActiveDay: active ? total / active : 0,
    streak: streak(stats, now),
    avgSpeed: wall > 0 ? total / wall : 0,
    episodesDone,
    booksDone,
    booksOngoing,
    week,
  }
}

/** "1 h 12 min", "8 min", "45 s" (para narrar e mostrar). */
export function spokenDuration(sec) {
  const s = Math.round(sec)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

