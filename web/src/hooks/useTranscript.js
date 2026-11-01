import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseVtt } from '../lib/vtt'
import { resolveUrl, toParagraphs } from '../lib/transcript'

const cache = new Map() // url → Promise<segments>

function load(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(resolveUrl(url))
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then(parseVtt)
        .catch((e) => { cache.delete(url); throw e }),
    )
  }
  return cache.get(url)
}

/**
 * Transcrição de um episódio: `ep.transcripts.vtt` (arquivo) ou `ep.transcript` (segmentos no catálogo).
 * status: 'none' (sem transcrição) | 'loading' | 'ready' | 'error'.
 */
export function useTranscript(ep, enabled = true) {
  const inline = ep?.transcript?.length ? ep.transcript : null
  const url = !inline ? ep?.transcripts?.vtt ?? null : null
  const [state, setState] = useState({ key: null, status: 'loading', segments: [] })
  const [attempt, setAttempt] = useState(0)
  const key = `${ep?.id}|${url}|${attempt}`

  useEffect(() => {
    if (!url || !enabled) return
    let cancelled = false
    load(url).then(
      (segments) => !cancelled && setState({ key, status: 'ready', segments }),
      () => !cancelled && setState({ key, status: 'error', segments: [] }),
    )
    return () => { cancelled = true }
  }, [url, key, enabled])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const ready = state.key === key
  const segments = inline ?? (ready ? state.segments : EMPTY)
  const paragraphs = useMemo(() => toParagraphs(segments), [segments]) // pesado em obras longas: só recalcula quando os segmentos mudam
  const status = !ep || (!inline && !url) ? 'none' : inline ? 'ready' : !enabled ? 'idle' : ready ? state.status : 'loading'
  return { status, segments, paragraphs, retry }
}

const EMPTY = []
