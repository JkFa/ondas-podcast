import { useEffect, useLayoutEffect, useRef } from 'react'
import { announce } from '../lib/announce'
import { t } from '../strings'

const SKIP = 15
const VOLUME_STEP = 0.1

/**
 * Atalhos de teclado globais (documentados em strings.help). Regras de acessibilidade:
 * - desligados por completo pelo interruptor "Atalhos de teclado" do painel (WCAG 2.1.4);
 * - ignorados em campos de texto, seletores e quando há Ctrl/Alt/Cmd;
 * - Espaço não age sobre botões/links/sliders (já tem função nativa);
 * - ↑/↓ só mexem no volume com o player aberto ou com Shift (senão tiram a rolagem por teclado);
 * - ←/→ não agem em sliders (ajustam o próprio slider).
 */
export function useShortcuts({ engine, enabled, sheetOpen, onToggleTranscript, onHelp }) {
  const live = useRef({})
  useLayoutEffect(() => {
    live.current = { engine, sheetOpen, onToggleTranscript, onHelp }
  })

  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      const tag = target.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target.isContentEditable) return
      const onControl = ['BUTTON', 'A', 'SUMMARY'].includes(tag) || target.getAttribute?.('role') === 'tab'
      const { engine: eng, sheetOpen: sheet, onToggleTranscript: toggleT, onHelp: help } = live.current
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === '?') { help(); e.preventDefault(); return }
      if (!eng.current) return

      switch (key) {
        case ' ':
          if (onControl) return
          eng.toggle()
          break
        case 'k':
          eng.toggle()
          break
        case 'j':
        case 'ArrowLeft':
          eng.skip(-SKIP)
          break
        case 'l':
        case 'ArrowRight':
          eng.skip(SKIP)
          break
        case 'ArrowUp':
        case 'ArrowDown':
          if (!sheet && !e.shiftKey) return
          eng.adjustVolume(key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)
          break
        case '>':
          eng.stepRate(1)
          break
        case '<':
          eng.stepRate(-1)
          break
        case 'm':
          eng.toggleMute()
          break
        case 't':
          toggleT()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  // Avisa quando a pessoa liga/desliga os atalhos (só depois da primeira renderização).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    announce(enabled ? t.live.shortcutsOn : t.live.shortcutsOff)
  }, [enabled])
}
