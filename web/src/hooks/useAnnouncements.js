import { useEffect, useRef } from 'react'
import { announce } from '../lib/announce'
import { t } from '../strings'

/** Anuncia "Tocando: título" ao começar/trocar de episódio e "Pausado" ao pausar (nunca no carregamento). */
export function useAnnouncements({ current, playing }) {
  const prev = useRef({ id: null, playing: false })
  useEffect(() => {
    const p = prev.current
    const id = current?.id ?? null
    if (id && playing && (!p.playing || p.id !== id)) announce(t.live.playing(current.title))
    else if (id && !playing && p.playing && p.id === id) announce(t.live.paused)
    prev.current = { id, playing }
  }, [current, playing])
}
