import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePersistentState } from './usePersistentState'

export const RATES = [1, 1.25, 1.5, 2]
const SKIP = 15
const SAVE_EVERY_MS = 5000
export const DONE_RATIO = 0.95

/** Estado de progresso de um episódio: {ratio, resumeAt, done}. */
export function progressInfo(progress, ep) {
  const p = progress[ep.id]
  if (!p || !p.dur) return { ratio: 0, resumeAt: 0, done: false }
  const ratio = Math.min(p.pos / p.dur, 1)
  const done = ratio >= DONE_RATIO
  return { ratio: done ? 1 : ratio, resumeAt: done || p.pos < 5 ? 0 : p.pos, done }
}

/**
 * Motor de áudio: um único <audio> (o App renderiza `audioRef`), com fila,
 * favoritos, velocidade/volume e progresso persistidos.
 * `episodes` é o catálogo mesclado, usado para resolver ids → episódio.
 */
export function useAudioEngine(episodes) {
  const audioRef = useRef(null)
  const [currentId, setCurrentId] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [progress, setProgress] = usePersistentState('progress', {}) // id → {pos, dur}
  const [favorites, setFavorites] = usePersistentState('favorites', [])
  const [queue, setQueue] = usePersistentState('queue', [])
  const [rate, setRate] = usePersistentState('rate', 1)
  const [volume, setVolumeState] = usePersistentState('volume', 1)

  const byId = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes])
  const current = byId.get(currentId) ?? null

  // Refs para handlers do <audio> não ficarem com valores velhos.
  const live = useRef({ volume })
  useLayoutEffect(() => {
    live.current = { currentId, progress, queue, rate, volume, byId }
  })
  const lastSave = useRef(0)
  const pendingSeek = useRef(0)

  const persistPosition = useCallback(() => {
    const a = audioRef.current
    const { currentId: id } = live.current
    if (!a || !id || !Number.isFinite(a.duration) || a.duration <= 0) return
    lastSave.current = Date.now()
    setProgress((p) => ({ ...p, [id]: { pos: a.currentTime, dur: a.duration, at: Date.now() } }))
  }, [setProgress])

  const safePlay = useCallback(() => {
    // Autoplay bloqueado/interrompido não é erro de mídia.
    audioRef.current?.play().catch(() => {})
  }, [])

  /** Posiciona o áudio (chamado ao soltar o slider, em cliques de capítulo etc.). */
  const seek = useCallback((t) => {
    const a = audioRef.current
    if (!a) return
    const max = Number.isFinite(a.duration) ? a.duration : t
    a.currentTime = Math.min(Math.max(0, t), max)
    setPosition(a.currentTime)
  }, [])

  /**
   * Carrega um episódio; retoma da posição salva (reinicia se já concluído).
   * `startAt` (segundos) força a posição inicial, ex.: clique num capítulo.
   */
  const select = useCallback(
    (ep, { autoplay = true, startAt = null } = {}) => {
      const a = audioRef.current
      if (!a || !ep) return
      if (ep.id === live.current.currentId) {
        if (startAt !== null) seek(startAt)
        if (autoplay) safePlay()
        return
      }
      persistPosition()
      const saved = live.current.progress[ep.id]
      pendingSeek.current =
        startAt ?? (saved && !(saved.dur > 0 && saved.pos / saved.dur >= DONE_RATIO) ? saved.pos : 0)
      setError(false)
      setPosition(pendingSeek.current)
      setDuration(ep.duration || 0)
      setCurrentId(ep.id)
      setQueue((q) => q.filter((id) => id !== ep.id))
      a.src = ep.audioUrl
      a.playbackRate = live.current.rate
      if (autoplay) safePlay()
    },
    [persistPosition, safePlay, seek, setQueue],
  )

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !a.src) return
    if (a.paused) safePlay()
    else a.pause()
  }, [safePlay])

  const skip = useCallback((delta) => seek((audioRef.current?.currentTime ?? 0) + delta), [seek])

  const playNext = useCallback(() => {
    const nextId = live.current.queue[0]
    const ep = live.current.byId.get(nextId)
    if (ep) select(ep)
    else if (nextId) setQueue((q) => q.slice(1)) // id órfão (episódio removido)
  }, [select, setQueue])

  const playPrevious = useCallback(() => seek(0), [seek])

  const setPlaybackRate = useCallback(
    (r) => {
      setRate(r)
      if (audioRef.current) audioRef.current.playbackRate = r
    },
    [setRate],
  )
  const cycleRate = useCallback(() => {
    const i = RATES.indexOf(live.current.rate)
    setPlaybackRate(RATES[(i + 1) % RATES.length])
  }, [setPlaybackRate])

  const setVolume = useCallback(
    (v) => {
      setVolumeState(v)
      if (audioRef.current) audioRef.current.volume = v
    },
    [setVolumeState],
  )

  const retry = useCallback(() => {
    const a = audioRef.current
    const ep = live.current.byId.get(live.current.currentId)
    if (!a || !ep) return
    pendingSeek.current = a.currentTime || pendingSeek.current
    setError(false)
    a.src = ep.audioUrl
    a.load()
    safePlay()
  }, [safePlay])

  const toggleFavorite = useCallback(
    (id) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f])),
    [setFavorites],
  )
  const enqueue = useCallback(
    (id) => setQueue((q) => (q.includes(id) || id === live.current.currentId ? q : [...q, id])),
    [setQueue],
  )
  const dequeue = useCallback((id) => setQueue((q) => q.filter((x) => x !== id)), [setQueue])
  const moveInQueue = useCallback(
    (id, dir) =>
      setQueue((q) => {
        const i = q.indexOf(id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= q.length) return q
        const copy = [...q]
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
        return copy
      }),
    [setQueue],
  )

  // Eventos do <audio>: registrados uma vez.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = live.current.volume ?? 1
    const on = {
      loadedmetadata: () => {
        setDuration(a.duration)
        a.playbackRate = live.current.rate
        if (pendingSeek.current > 0 && pendingSeek.current < a.duration) a.currentTime = pendingSeek.current
        pendingSeek.current = 0
      },
      timeupdate: () => {
        setPosition(a.currentTime)
        if (!a.paused && Date.now() - lastSave.current > SAVE_EVERY_MS) persistPosition()
      },
      play: () => setPlaying(true),
      playing: () => { setPlaying(true); setBuffering(false) },
      pause: () => { setPlaying(false); persistPosition() },
      seeked: persistPosition,
      waiting: () => setBuffering(true),
      canplay: () => setBuffering(false),
      error: () => { setError(true); setBuffering(false); setPlaying(false) },
      ended: () => {
        const { currentId: id } = live.current
        if (Number.isFinite(a.duration)) setProgress((p) => ({ ...p, [id]: { pos: a.duration, dur: a.duration, at: Date.now() } }))
        setPlaying(false)
        playNext()
      },
    }
    for (const [ev, fn] of Object.entries(on)) a.addEventListener(ev, fn)
    window.addEventListener('pagehide', persistPosition)
    return () => {
      for (const [ev, fn] of Object.entries(on)) a.removeEventListener(ev, fn)
      window.removeEventListener('pagehide', persistPosition)
    }
  }, [persistPosition, playNext, setProgress])

  // Atalhos de desktop. Ignora campos de texto, sliders e botões (espaço já ativa o botão).
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !live.current.currentId) return
      const tag = e.target.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return
      if (e.key === ' ' && ['BUTTON', 'A'].includes(tag)) return
      if (e.key === ' ') toggle()
      else if (e.key === 'ArrowLeft') skip(-SKIP)
      else if (e.key === 'ArrowRight') skip(SKIP)
      else if (e.key === '>') setPlaybackRate(RATES[Math.min(RATES.indexOf(live.current.rate) + 1, RATES.length - 1)])
      else if (e.key === '<') setPlaybackRate(RATES[Math.max(RATES.indexOf(live.current.rate) - 1, 0)])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, skip, setPlaybackRate])

  return {
    audioRef, current, playing, buffering, error, position, duration, rate, volume,
    progress, favorites, queue,
    select, toggle, seek, skip, playNext, playPrevious, cycleRate, setVolume, retry,
    toggleFavorite, enqueue, dequeue, moveInQueue,
  }
}
