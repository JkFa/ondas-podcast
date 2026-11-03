import Cover from './Cover'
import { t } from '../strings'
import { Loader2, Pause, Play } from 'lucide-react'

export default function MiniPlayer({ engine, onOpen }) {
  const { current, playing, buffering, position, duration, toggle } = engine
  if (!current) return null
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 fade-up desk:inset-x-0 desk:bottom-0 desk:px-2 desk:pb-2"
    >
      <div className="glass relative mx-auto flex max-w-3xl items-center gap-3 overflow-hidden rounded-lg bg-ink-900/85 p-2 pr-3 shadow-2xl shadow-black/40 desk:h-[5.25rem] desk:max-w-none desk:rounded-lg desk:border-0 desk:bg-transparent desk:px-3 desk:shadow-none desk:backdrop-blur-none">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10 desk:inset-x-[33%] desk:bottom-2 desk:top-auto desk:h-1 desk:overflow-hidden desk:rounded-full" aria-hidden="true">
          <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
        </div>
        <button
          onClick={onOpen}
          aria-label={t.player.open(current.title)}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-md text-left desk:flex-none desk:basis-1/3"
        >
          <Cover src={current.cover} className="h-11 w-11 shrink-0 rounded-md desk:h-14 desk:w-14" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{current.title}</span>
            <span className="eyebrow block truncate">{current.show}</span>
          </span>
        </button>
        <button
          onClick={toggle}
          aria-label={playing ? t.player.pause : t.player.play}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-ink-950 hover:scale-105 hover:bg-signal-hover desk:mx-auto desk:-translate-y-1"
        >
          {buffering && playing ? <Loader2 size={18} className="animate-spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
        </button>
        <div aria-hidden="true" className="hidden desk:block desk:basis-1/3" />
      </div>
    </div>
  )
}
