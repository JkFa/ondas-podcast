// Downloads para ouvir sem internet: baixa o MP3 (e a capa e a transcrição, se houver) para o Cache Storage
// ("ondas-offline-v1"). O service worker (src/sw.js) serve esses arquivos, inclusive com Range.
//
// Por que fetch + cache.put e não o cache automático do navegador: os MP3 têm dezenas de MB, o cache HTTP os
// descarta quando quer, e só o Cache Storage permite saltar na barra de progresso com o arquivo local.
// O archive.org envia CORS (access-control-allow-origin: *) e aceita Range, verificado em 2026-10-31, então o
// fetch lê o corpo normalmente (resposta "cors", não "opaca": não paga a "taxa" de 7 MB por arquivo da cota).
import { announce } from './announce'
import { AUDIO_CACHE, META_KEY } from './offline-constants'
import { load, save } from './storage'
import { t } from '../strings'

let snapshot = { meta: load(META_KEY, {}), jobs: {}, persisted: null }
const listeners = new Set()
const emit = (patch) => {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((fn) => fn())
}
export const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getSnapshot = () => snapshot

export const supported = () => typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/** Tamanho estimado a 128 kbps (o real vem do servidor ao baixar). */
export const estimateBytes = (ep) => Math.round((ep.duration || 0) * 16000)

const setMeta = (meta) => {
  save(META_KEY, meta)
  emit({ meta })
}
const setJob = (id, job) => {
  const jobs = { ...snapshot.jobs }
  if (job) jobs[id] = job
  else delete jobs[id]
  emit({ jobs })
}

export async function storageInfo() {
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {}
    const persisted = (await navigator.storage?.persisted?.()) ?? null
    return { usage, quota, persisted }
  } catch {
    return { usage: 0, quota: 0, persisted: null }
  }
}

/** Pede ao navegador para NÃO apagar os downloads sob pressão de espaço (quando suportado). */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null
    const ok = (await navigator.storage.persisted?.()) || (await navigator.storage.persist())
    emit({ persisted: ok })
    return ok
  } catch {
    return null
  }
}

const queue = []
let running = false
const controllers = new Map()

async function putExtra(cache, url) {
  if (!url || (await cache.match(url))) return
  try {
    const res = await fetch(url)
    if (res.ok) await cache.put(url, res)
  } catch {
    /* capa/transcrição são extras: o áudio é o que importa */
  }
}

async function runJob(ep) {
  const controller = new AbortController()
  controllers.set(ep.id, controller)
  const need = estimateBytes(ep)
  setJob(ep.id, { status: 'downloading', loaded: 0, total: need, error: null })
  try {
    const { usage, quota } = await storageInfo()
    if (quota && quota - usage < need * 1.2) throw new Error(t.downloads.noSpace)
    const res = await fetch(ep.audioUrl, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || need
    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0
    let last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      if (Date.now() - last > 200) {
        last = Date.now()
        setJob(ep.id, { status: 'downloading', loaded, total, error: null })
      }
    }
    const type = res.headers.get('content-type') || 'audio/mpeg'
    const blob = new Blob(chunks, { type })
    const cache = await caches.open(AUDIO_CACHE)
    // Resposta nova (não "redirected"): o service worker a entrega ao <audio>, que pode pedir Range.
    await cache.put(ep.audioUrl, new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(blob.size) } }))
    await putExtra(cache, ep.cover)
    await putExtra(cache, ep.transcripts?.vtt ? new URL(ep.transcripts.vtt, new URL(import.meta.env.BASE_URL, location.origin)).href : null)
    setMeta({
      ...snapshot.meta,
      [ep.id]: { url: ep.audioUrl, bytes: blob.size, at: Date.now(), title: ep.title, series: ep.series ?? null, part: ep.part ?? null, cover: ep.cover ?? null, vtt: ep.transcripts?.vtt ?? null, show: ep.show },
    })
    setJob(ep.id, null)
    requestPersist()
    announce(t.downloads.done(ep.title))
  } catch (e) {
    if (controller.signal.aborted) {
      setJob(ep.id, null)
      announce(t.downloads.cancelled(ep.title))
    } else {
      setJob(ep.id, { status: 'error', loaded: 0, total: need, error: e.message })
      announce(t.downloads.failed(ep.title))
    }
  } finally {
    controllers.delete(ep.id)
  }
}

async function pump() {
  if (running) return
  running = true
  while (queue.length) await runJob(queue.shift())
  running = false
}

/** Coloca episódios na fila (um por vez). Ignora os já baixados ou em andamento. */
export function downloadEpisodes(eps) {
  for (const ep of eps) {
    if (snapshot.meta[ep.id] || snapshot.jobs[ep.id]?.status === 'downloading' || queue.some((q) => q.id === ep.id)) continue
    queue.push(ep)
    setJob(ep.id, { status: 'queued', loaded: 0, total: estimateBytes(ep), error: null })
  }
  pump()
}
export const downloadEpisode = (ep) => downloadEpisodes([ep])

export function cancelDownload(id) {
  const i = queue.findIndex((q) => q.id === id)
  if (i >= 0) {
    queue.splice(i, 1)
    setJob(id, null)
  } else controllers.get(id)?.abort()
}
export const cancelAll = () => {
  for (const ep of queue.splice(0)) setJob(ep.id, null)
  controllers.forEach((c) => c.abort())
}

export async function removeEpisode(id, { silent = false } = {}) {
  const m = snapshot.meta[id]
  if (!m) return
  const cache = await caches.open(AUDIO_CACHE)
  await cache.delete(m.url)
  if (m.vtt) await cache.delete(new URL(m.vtt, new URL(import.meta.env.BASE_URL, location.origin)).href) // por episódio
  const meta = { ...snapshot.meta }
  delete meta[id]
  setMeta(meta)
  // a capa é da obra: só sai com a última parte (decidido DEPOIS de atualizar o registro)
  if (m.cover && !Object.values(meta).some((o) => o.cover === m.cover)) await cache.delete(m.cover)
  if (!silent) announce(t.downloads.removed(m.title))
}
/** Remove vários, um de cada vez (cada remoção confere se a capa ainda é usada por outra parte). */
export async function removeEpisodes(ids, title) {
  for (const id of ids) await removeEpisode(id, { silent: true })
  announce(title ? t.downloads.removed(title) : t.downloads.removedAll)
}
export async function removeAll() {
  cancelAll()
  await caches.delete(AUDIO_CACHE)
  setMeta({})
  announce(t.downloads.removedAll)
}

/** Ao abrir o app: descarta registros cujo arquivo sumiu (o navegador pode ter limpado o cache). */
export async function reconcile() {
  if (!supported()) return
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const urls = new Set((await cache.keys()).map((r) => r.url))
    const meta = Object.fromEntries(Object.entries(snapshot.meta).filter(([, m]) => urls.has(m.url)))
    if (Object.keys(meta).length !== Object.keys(snapshot.meta).length) setMeta(meta)
    const persisted = (await navigator.storage?.persisted?.()) ?? null
    emit({ persisted })
  } catch {
    /* sem Cache Storage (modo privado de alguns navegadores): downloads indisponíveis */
  }
}

export const totalBytes = (meta = snapshot.meta) => Object.values(meta).reduce((n, m) => n + (m.bytes || 0), 0)
export const formatBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
