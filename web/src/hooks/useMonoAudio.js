import { useEffect, useLayoutEffect, useRef } from 'react'
import { announce } from '../lib/announce'
import { setPrefs } from '../lib/prefs'
import { t } from '../strings'

/**
 * Áudio mono (Web Audio): mistura os dois canais num só.
 * - O <audio> só passa pelo AudioContext se `crossOrigin` estiver definido ANTES de carregar o arquivo;
 *   o archive.org envia CORS (access-control-allow-origin: *), então funciona; hosts sem CORS ficariam
 *   mudos, por isso, em caso de erro de mídia com mono ligado, voltamos ao estéreo e avisamos.
 * - createMediaElementSource é irreversível: depois de criado, "desligar" só volta o nó para estéreo.
 */
export function useMonoAudio(engine, enabled) {
  const graph = useRef(null) // { ctx, node }
  const { audioRef, error, retry } = engine
  const retryRef = useRef(retry)
  useLayoutEffect(() => {
    retryRef.current = retry
  })

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (enabled && !graph.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) {
        setPrefs({ mono: false })
        announce(t.live.monoFail)
        return
      }
      const wasLoaded = !!a.src
      a.crossOrigin = 'anonymous'
      const ctx = new Ctx()
      const node = ctx.createGain()
      node.channelCount = 1
      node.channelCountMode = 'explicit'
      node.channelInterpretation = 'speakers'
      ctx.createMediaElementSource(a).connect(node)
      node.connect(ctx.destination)
      graph.current = { ctx, node }
      if (wasLoaded) retryRef.current() // recarrega a faixa atual já com CORS, na mesma posição
    }
    const g = graph.current
    if (g) {
      g.node.channelCount = enabled ? 1 : 2
      g.node.channelCountMode = enabled ? 'explicit' : 'max'
      if (enabled) g.ctx.resume().catch(() => {})
    }
    announce(enabled ? t.live.monoOn : t.live.monoOff)
  }, [enabled, audioRef])

  // Só reage a um erro NOVO (false → true) depois de ligar o mono; um erro antigo, de antes, não conta.
  const prevError = useRef(error)
  useEffect(() => {
    if (enabled && error && !prevError.current) {
      setPrefs({ mono: false })
      announce(t.live.monoFail)
    }
    prevError.current = error
  }, [enabled, error])

  // O contexto pode ficar suspenso até um gesto; retoma ao tocar.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const resume = () => graph.current?.ctx.state === 'suspended' && graph.current.ctx.resume().catch(() => {})
    a.addEventListener('play', resume)
    return () => a.removeEventListener('play', resume)
  }, [audioRef])
}
