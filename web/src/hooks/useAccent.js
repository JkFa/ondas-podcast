import { useEffect, useState } from 'react'
import { NEUTRAL_ACCENT, extractAccent, isHex } from '../lib/color'

/** Cor de destaque do episódio; sem accentColor tenta extrair da capa, senão neutro. */
export function useAccent(episode) {
  const [extracted, setExtracted] = useState({ cover: null, color: null })
  const declared = isHex(episode?.accentColor) ? episode.accentColor : null
  const cover = episode?.cover

  useEffect(() => {
    if (declared || !cover) return
    let cancelled = false
    extractAccent(cover).then((color) => !cancelled && setExtracted({ cover, color }))
    return () => { cancelled = true }
  }, [declared, cover])

  return declared ?? (extracted.cover === cover && extracted.color) ?? NEUTRAL_ACCENT
}
