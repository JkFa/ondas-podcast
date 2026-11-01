import Cover from './Cover'
import { t } from '../strings'
import { Loader2, Pause, Play } from 'lucide-react'

export default function MiniPlayer({ engine, onOpen }) {
  const { current, playing, buffering, position, duration, toggle } = engine
  if (!current) return null
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 fade-up lg:bottom-5 lg:left-20 lg:right-0 lg:px-8"
    >
      <div className="glass relative mx-auto max-w-3xl bg-ink-900/85 flex items-center gap-3 overflow-hidden rounded-2xl p-2 pr-3 shadow-2xl shadow-black/40">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10" aria-hidden="true">
          <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
        </div>
        <button
          onClick={onOpen}
          aria-label={t.player.open(current.title)}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
        >
          <Cover src={current.cover} className="h-11 w-11 shrink-0 rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{current.title}</span>
            <span className="eyebrow block truncate">{current.show}</span>
          </span>
        </button>
        <button
          onClick={toggle}
          aria-label={playing ? t.player.pause : t.player.play}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-ink-950 hover:bg-signal-hover"
        >
          {buffering && playing ? <Loader2 size={18} className="animate-spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
        </button>
      </div>
    </div>
  )
}
