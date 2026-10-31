// Contrato entre o pipeline (publish.py) e o front. Mantenha em sincronia com
// pipeline/publish.py (build_episode) e com o README.
export const SCHEMA_VERSION = 1

const isStr = (v) => typeof v === 'string' && v.trim() !== ''
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isHttps = (v) => {
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

/** Retorna lista de problemas (vazia = válido). */
export function validateEpisode(ep) {
  const errs = []
  if (!ep || typeof ep !== 'object') return ['não é um objeto']
  if (ep.schemaVersion !== SCHEMA_VERSION) errs.push('schemaVersion deve ser 1')
  if (!isStr(ep.id)) errs.push('id ausente')
  if (!isStr(ep.title)) errs.push('title ausente')
  if (!isStr(ep.show)) errs.push('show ausente')
  if (!isStr(ep.audioUrl) || !isHttps(ep.audioUrl)) errs.push('audioUrl inválida (https)')
  if (ep.cover && !isHttps(ep.cover)) errs.push('cover inválida (https)')
  if (ep.accentColor && !/^#[0-9a-f]{6}$/i.test(ep.accentColor)) errs.push('accentColor inválida')
  if (!isNum(ep.duration)) errs.push('duration inválida')
  if (ep.publishedAt && Number.isNaN(Date.parse(ep.publishedAt))) errs.push('publishedAt inválida')
  if (ep.chapters && !(Array.isArray(ep.chapters) && ep.chapters.every((c) => isNum(c?.start) && isStr(c?.title))))
    errs.push('chapters inválido')
  if (ep.transcript && !(Array.isArray(ep.transcript) && ep.transcript.every((s) => isNum(s?.start) && isNum(s?.end) && typeof s?.text === 'string')))
    errs.push('transcript inválido')
  return errs
}

/** Filtra entradas válidas; as inválidas geram aviso no console. */
export function validEpisodes(list, origin = 'catálogo') {
  if (!Array.isArray(list)) return []
  return list.filter((ep) => {
    const errs = validateEpisode(ep)
    if (errs.length) console.warn(`[ondas] episódio ignorado (${origin}, id=${ep?.id ?? '?'}):`, errs.join('; '))
    return errs.length === 0
  })
}

/** Importados com o mesmo id sobrescrevem os da base. Ordena do mais recente. */
export function mergeCatalog(base, imported) {
  const map = new Map(base.map((e) => [e.id, e]))
  for (const e of imported) map.set(e.id, e)
  return [...map.values()].sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
}

/** Aceita {schemaVersion, episodes:[...]} ou um episódio avulso. */
export function parseCatalogJson(text, origin) {
  const data = JSON.parse(text)
  const list = Array.isArray(data?.episodes) ? data.episodes : [data]
  return validEpisodes(list, origin)
}

export function serializeCatalog(episodes) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, episodes }, null, 2)
}
