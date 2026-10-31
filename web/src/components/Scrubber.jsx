import { useState } from 'react'
import { formatTime, spokenProgress } from '../lib/format'

/**
 * Slider de posição. Durante o arraste só o visual muda (draft); o
 * `currentTime` real é ajustado ao soltar (ou ao soltar a tecla).
 */
export default function Scrubber({ position, duration, onCommit }) {
  const [draft, setDraft] = useState(null)
  const value = draft ?? position
  const max = duration || 0
  const commit = () => {
    if (draft !== null) onCommit(draft)
    setDraft(null)
  }

  return (
    <div>
      <input
        type="range"
        className="scrubber"
        min={0}
        max={max || 1}
        step={1}
        value={Math.min(value, max || 1)}
        disabled={!max}
        aria-label="Posição do episódio"
        aria-valuetext={spokenProgress(value, max)}
        style={{ '--fill': `${max ? (value / max) * 100 : 0}%` }}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onPointerCancel={() => setDraft(null)}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="mt-1 flex justify-between text-xs tabular-nums text-zinc-400">
        <span>{formatTime(value)}</span>
        <span>-{formatTime(Math.max(0, max - value))}</span>
      </div>
    </div>
  )
}
