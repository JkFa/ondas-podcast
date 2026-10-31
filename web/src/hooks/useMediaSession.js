import { useEffect } from 'react'

const ARTWORK_SIZES = [96, 128, 192, 256, 384, 512]
const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator

/**
 * Integra com controles de sistema (tela de bloqueio, fones, teclas de mídia).
 * `engine` é o retorno de useAudioEngine.
 */
export function useMediaSession(engine) {
  const { current, playing, position, duration, rate, audioRef } = engine
  const { toggle, skip, seek, playNext, playPrevious } = engine

  useEffect(() => {
    if (!supported() || !current) return
    // A capa não tem tamanhos distintos no archive.org: declaramos a mesma URL em vários.
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.show,
      album: current.show,
      artwork: current.cover ? ARTWORK_SIZES.map((s) => ({ src: current.cover, sizes: `${s}x${s}`, type: 'image/jpeg' })) : [],
    })
  }, [current])

  useEffect(() => {
    if (!supported()) return
    const handlers = {
      play: () => audioRef.current?.play().catch(() => {}),
      pause: () => audioRef.current?.pause(),
      seekbackward: (d) => skip(-(d?.seekOffset || 15)),
      seekforward: (d) => skip(d?.seekOffset || 15),
      seekto: (d) => seek(d.seekTime),
      previoustrack: playPrevious,
      nexttrack: playNext,
    }
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, fn)
      } catch {
        /* ação não suportada neste navegador */
      }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* idem */ }
      }
    }
  }, [audioRef, skip, seek, playNext, playPrevious, toggle])

  useEffect(() => {
    if (supported()) navigator.mediaSession.playbackState = current ? (playing ? 'playing' : 'paused') : 'none'
  }, [playing, current])

  // Posição: ao mudar duração/velocidade/play e a cada ~5s (position muda a ~4Hz; filtramos).
  const bucket = Math.floor(position / 5)
  useEffect(() => {
    if (!supported() || !current || !Number.isFinite(duration) || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: rate, position: Math.min(position, duration) })
    } catch {
      /* valores inválidos momentâneos */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, duration, rate, playing, bucket])
}
