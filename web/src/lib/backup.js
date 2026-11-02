// Exportar/importar o que fica só neste aparelho (progresso, favoritos, fila, estatísticas, preferências), sem conta.
// O arquivo é um JSON legível. O QR leva só o essencial (cabe pouco): é um link para #/backup com os dados compactados.
// Tudo o que entra é validado como texto não confiável: tipos, tamanhos e chaves conhecidas.
import { validateEpisode } from './catalog'
import { sanitize as sanitizePrefs } from './prefs'
import { mergeStats, sanitizeStats } from './stats'

export const BACKUP_VERSION = 1
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const KEYS = ['progress', 'favorites', 'queue', 'rate', 'volume', 'transcript-on', 'a11y', 'imported', 'stats']
const LIMITS = { progress: 6000, ids: 6000, imported: 500 }
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const hasControl = (s) => [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 300 && !hasControl(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

// ------------------------------------------------------------------ validação por chave
const cleaners = {
  progress(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const out = {}
    for (const [id, p] of Object.entries(raw).slice(0, LIMITS.progress)) {
      if (!isId(id) || FORBIDDEN.has(id) || !p || !isNum(p.pos) || !isNum(p.dur) || p.pos < 0 || p.dur <= 0) continue
      out[id] = { pos: Math.min(p.pos, p.dur), dur: p.dur, ...(isNum(p.at) && p.at >= 0 ? { at: p.at } : {}) }
    }
    return out
  },
  favorites: (raw) => (Array.isArray(raw) ? [...new Set(raw.filter(isId))].slice(0, LIMITS.ids) : null),
  queue: (raw) => (Array.isArray(raw) ? [...new Set(raw.filter(isId))].slice(0, LIMITS.ids) : null),
  rate: (raw) => (RATES.includes(raw) ? raw : null),
  volume: (raw) => (isNum(raw) && raw >= 0 && raw <= 1 ? raw : null),
  'transcript-on': (raw) => (typeof raw === 'boolean' ? raw : null),
  a11y: (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? sanitizePrefs(raw) : null),
  imported: (raw) => (Array.isArray(raw) ? raw.filter((e) => validateEpisode(e).length === 0).slice(0, LIMITS.imported) : null),
  stats: (raw) => (raw && typeof raw === 'object' ? sanitizeStats(raw) : null),
}

/** Mantém só as chaves conhecidas e válidas. */
export function cleanData(data) {
  const out = {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out
  for (const k of KEYS) {
    if (!Object.hasOwn(data, k)) continue
    const v = cleaners[k](data[k])
    if (v !== null) out[k] = v
  }
  return out
}

// ------------------------------------------------------------------ arquivo
/** Monta o backup a partir de `read(chave, padrão)` (por padrão o localStorage do app). */
export function buildBackup(read, now = new Date()) {
  const data = {}
  for (const k of KEYS) {
    const v = read(k, undefined)
    if (v !== undefined) data[k] = v
  }
  return { app: 'ondas', kind: 'backup', version: BACKUP_VERSION, exportedAt: now.toISOString(), data: cleanData(data) }
}

export const backupFilename = (now = new Date()) => `ondas-backup-${now.toISOString().slice(0, 10)}.json`

/** Números para a prévia antes de importar. */
export function summarizeData(data) {
  const days = Object.values(data.stats?.days || {})
  return {
    progress: Object.keys(data.progress || {}).length,
    favorites: (data.favorites || []).length,
    queue: (data.queue || []).length,
    imported: (data.imported || []).length,
    statsDays: days.length,
    statsSeconds: days.reduce((s, d) => s + d.c, 0),
    hasSettings: ['rate', 'volume', 'a11y', 'transcript-on'].some((k) => k in data),
  }
}

/** Lê o texto de um arquivo de backup. Devolve { ok, data, summary, exportedAt } ou { ok:false, error }. */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'empty' }
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: 'big' }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'json' }
  }
  if (!json || json.app !== 'ondas' || json.kind !== 'backup' || !json.data) return { ok: false, error: 'notBackup' }
  if (!Number.isInteger(json.version) || json.version < 1) return { ok: false, error: 'notBackup' }
  if (json.version > BACKUP_VERSION) return { ok: false, error: 'newer' }
  const data = cleanData(json.data)
  const summary = summarizeData(data)
  if (!summary.progress && !summary.favorites && !summary.queue && !summary.statsDays && !summary.imported && !summary.hasSettings) return { ok: false, error: 'nothing' }
  const t = Date.parse(json.exportedAt)
  return { ok: true, data, summary, exportedAt: Number.isNaN(t) ? null : new Date(t).toISOString() }
}

// ------------------------------------------------------------------ aplicar
const newer = (a, b) => ((b.at || 0) > (a.at || 0) || ((b.at || 0) === (a.at || 0) && b.pos > a.pos) ? b : a)
const union = (cur = [], inc = []) => [...cur, ...inc.filter((x) => !cur.includes(x))]

/**
 * Resultado de aplicar `incoming` sobre `current` (ambos já validados): { chave: novo valor }.
 *  - 'merge': progresso fica com o registro mais recente de cada episódio; favoritos, fila e importados são unidos; estatísticas
 *    pegam o maior valor de cada dia; preferências (velocidade, volume, acessibilidade) NÃO são alteradas.
 *  - 'replace': tudo o que o backup traz substitui o que há aqui.
 */
export function applyData(current, incoming, mode = 'merge') {
  const out = {}
  if (mode === 'replace') {
    for (const k of Object.keys(incoming)) out[k] = incoming[k]
    return out
  }
  if (incoming.progress) {
    const merged = { ...(current.progress || {}) }
    for (const [id, p] of Object.entries(incoming.progress)) merged[id] = merged[id] ? newer(merged[id], p) : p
    out.progress = merged
  }
  if (incoming.favorites) out.favorites = union(current.favorites, incoming.favorites).slice(0, LIMITS.ids)
  if (incoming.queue) out.queue = union(current.queue, incoming.queue).slice(0, LIMITS.ids)
  if (incoming.imported) {
    const have = new Set((current.imported || []).map((e) => e.id))
    out.imported = [...(current.imported || []), ...incoming.imported.filter((e) => !have.has(e.id))].slice(0, LIMITS.imported)
  }
  if (incoming.stats) out.stats = mergeStats(sanitizeStats(current.stats), incoming.stats)
  return out
}

// ------------------------------------------------------------------ QR (link com os dados compactados)
const toB64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/** Versão enxuta para o QR: só progresso (mais recentes primeiro), favoritos, fila e velocidade. */
export function compact(data, nProgress) {
  const prog = Object.entries(data.progress || {})
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, nProgress)
    .map(([id, p]) => [id, Math.round(p.pos), Math.round(p.dur), Math.round((p.at || 0) / 1000)])
  return { v: 1, p: prog, f: (data.favorites || []).slice(0, 40), q: (data.queue || []).slice(0, 20), ...(data.rate ? { r: data.rate } : {}) }
}

export async function encodeCompact(obj) {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw'))
  return toB64Url(bytes)
}

/** Decodifica o que o QR trouxe; devolve dados no mesmo formato do arquivo (validados) ou null. */
export async function decodeCompact(str) {
  try {
    if (typeof str !== 'string' || str.length > 20000) return null
    const bytes = await pipe(fromB64Url(str), new DecompressionStream('deflate-raw'))
    const o = JSON.parse(new TextDecoder().decode(bytes))
    if (!o || o.v !== 1 || !Array.isArray(o.p)) return null
    const progress = {}
    for (const row of o.p) {
      if (!Array.isArray(row)) continue
      const [id, pos, dur, at] = row
      if (isId(id)) progress[id] = { pos, dur, ...(isNum(at) && at > 0 ? { at: at * 1000 } : {}) }
    }
    const data = cleanData({ progress, favorites: o.f, queue: o.q, rate: o.r })
    return Object.keys(data).length ? data : null
  } catch {
    return null
  }
}

/**
 * Maior número de episódios com progresso cujo link cabe em `maxChars`. Devolve { url, count, total } (url null se nem o
 * mínimo cabe). `base` é o endereço do app (…/ondas-podcast/).
 */
export async function qrLink(data, base, maxChars = 1100) {
  const total = Object.keys(data.progress || {}).length
  const make = async (n) => `${base}#/backup?d=${await encodeCompact(compact(data, n))}`
  let lo = 0
  let hi = total
  let best = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const url = await make(mid)
    if (url.length <= maxChars) {
      best = { url, count: mid, total }
      lo = mid + 1
    } else hi = mid - 1
  }
  return best
}
