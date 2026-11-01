import { useMemo } from 'react'
import { findActive } from '../lib/transcript'

/**
 * Modo legenda: a frase atual em fonte grande, numa faixa fixa sobre o player (para pessoas surdas
 * ou ensurdecidas). Fica fora da árvore de acessibilidade (aria-hidden): quem usa leitor de tela ouve
 * o áudio e não precisa que a legenda seja falada de novo.
 */
export default function CaptionBar({ transcript, position, lifted }) {
  const { segments } = transcript
  const idx = useMemo(() => findActive(segments, position, 0.1), [segments, position])
  const seg = idx >= 0 ? segments[idx] : null
  const visible = seg && position <= seg.end + 1.5 // some alguns segundos depois do fim da fala
  if (!visible) return null
  return (
    <div
      aria-hidden="true"
      data-testid="caption-bar"
      className={`pointer-events-none fixed inset-x-3 z-[45] flex justify-center lg:left-20 ${lifted ? 'bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] lg:bottom-28' : 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]'}`}
    >
      <p className="max-w-3xl rounded-2xl bg-ink-950/90 px-5 py-3 text-center text-[clamp(1.25rem,4.5vw,2rem)] font-semibold leading-snug text-ink-50 shadow-2xl ring-1 ring-[color:var(--control-line)]">
        {seg.text}
      </p>
    </div>
  )
}
