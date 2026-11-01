import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { announce } from '../lib/announce'
import { t } from '../strings'
import { DONE_RATIO, progressInfo } from '../lib/progress'
import { usePersistentState } from './usePersistentState'

export { DONE_RATIO, progressInfo }

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] // passos de 0,25× (0,5× a 2×)
const SAVE_EVERY_MS = 5000

/**
 * Motor de áudio: um único <audio> (o App renderiza `audioRef`), com fila,
 * favoritos, velocidade/volume e progresso persistidos.
 * `episodes` é o catálogo mesclado, usado para resolver ids → episódio.
 */
export function useAudioEngine(episodes, { isPlayable } = {}) {
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
  const [muted, setMuted] = useState(false)
  const [sleep, setSleepState] = useState({ mode: 'off', endsAt: 0, minutes: 0 }) // 'off' | 'time' | 'end'

  const byId = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes])
  const current = byId.get(currentId) ?? null

  // Refs para handlers do <audio> não ficarem com valores velhos.
  const live = useRef({ volume })
  useLayoutEffect(() => {
    live.current = { currentId, progress, queue, rate, volume, byId, sleep, isPlayable }
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

  // Fila explícita primeiro; sem fila, segue para a próxima parte da mesma obra (audiolivros).
  // `isPlayable` (offline): só avança para o que dá para tocar agora, ou seja, o que foi baixado.
  const playNext = useCallback(() => {
    const { queue: q, byId: map, currentId: id, isPlayable: playable } = live.current
    const ok = (e) => !playable || playable(e)
    const nextId = q.find((qid) => map.get(qid) && ok(map.get(qid)))
    if (nextId) return select(map.get(nextId))
    if (q.length && !q.some((qid) => map.get(qid))) return setQueue((rest) => rest.slice(1)) // ids órfãos (episódio removido)
    const cur = map.get(id)
    if (!cur?.series || !cur.part) return
    const following = [...map.values()]
      .filter((e) => e.series === cur.series && e.part > cur.part)
      .sort((a, b) => a.part - b.part)
      .find(ok)
    if (following) select(following)
    else if ([...map.values()].some((e) => e.series === cur.series && e.part > cur.part)) announce(t.downloads.endOfOffline)
  }, [select, setQueue])

  const playPrevious = useCallback(() => seek(0), [seek])

  const setPlaybackRate = useCallback(
    (r) => {
      setRate(r)
      if (audioRef.current) audioRef.current.playbackRate = r
    },
    [setRate],
  )
  /** dir = +1 / -1: um passo de 0,25× (para nos limites 0,5× e 2×). */
  const stepRate = useCallback(
    (dir) => {
      const i = RATES.indexOf(live.current.rate)
      const next = RATES[Math.min(Math.max((i < 0 ? RATES.indexOf(1) : i) + dir, 0), RATES.length - 1)]
      setPlaybackRate(next)
      announce(t.live.speed(next))
    },
    [setPlaybackRate],
  )

  const setVolume = useCallback(
    (v) => {
      const clamped = Math.min(1, Math.max(0, v))
      setVolumeState(clamped)
      if (audioRef.current) audioRef.current.volume = clamped
    },
    [setVolumeState],
  )
  const adjustVolume = useCallback(
    (delta) => {
      const v = Math.round(Math.min(1, Math.max(0, live.current.volume + delta)) * 100) / 100
      setVolume(v)
      announce(t.live.volume(Math.round(v * 100)))
    },
    [setVolume],
  )
  const toggleMute = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.muted = !a.muted
    setMuted(a.muted)
    announce(a.muted ? t.live.muted : t.live.unmuted)
  }, [])

  /** Soneca: mode 'off' | 'time' (minutes) | 'end' (ao fim da parte atual). */
  const setSleep = useCallback((mode, minutes = 0) => {
    const next = mode === 'time' ? { mode, endsAt: Date.now() + minutes * 60000, minutes } : { mode, endsAt: 0, minutes: 0 }
    setSleepState(next)
    announce(mode === 'off' ? t.sleep.cleared : t.sleep.set(mode === 'time' ? t.sleep.min(minutes) : t.sleep.endOfPart))
  }, [])
  useEffect(() => {
    if (sleep.mode !== 'time') return
    const id = setTimeout(() => {
      audioRef.current?.pause()
      setSleepState({ mode: 'off', endsAt: 0, minutes: 0 })
      announce(t.sleep.fired)
    }, Math.max(0, sleep.endsAt - Date.now()))
    return () => clearTimeout(id)
  }, [sleep])

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
        if (live.current.sleep.mode === 'end') {
          setSleepState({ mode: 'off', endsAt: 0, minutes: 0 })
          announce(t.sleep.fired)
          return
        }
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

  return {
    audioRef, current, playing, buffering, error, position, duration, rate, volume, muted, sleep,
    progress, favorites, queue,
    select, toggle, seek, skip, playNext, playPrevious, stepRate, setPlaybackRate, setVolume, adjustVolume, toggleMute, setSleep, retry,
    toggleFavorite, enqueue, dequeue, moveInQueue,
  }
}
