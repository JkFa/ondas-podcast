import { formatTime } from '../lib/format'

function currentChapterIndex(chapters, position) {
  let idx = -1
  chapters.forEach((c, i) => { if (c.start <= position + 0.25) idx = i })
  return idx
}

export default function Chapters({ chapters, position, onSeek }) {
  if (!chapters?.length)
    return <Empty title="Sem capítulos" text="Este episódio não tem marcações de capítulos." />
  const active = currentChapterIndex(chapters, position)
  return (
    <ol className="flex flex-col gap-1">
      {chapters.map((c, i) => (
        <li key={`${c.start}-${i}`}>
          <button
            onClick={() => onSeek(c.start)}
            aria-current={i === active ? 'true' : undefined}
            className={`press flex w-full items-baseline gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${i === active ? 'bg-white/10' : ''}`}
          >
            <span className="w-14 shrink-0 text-xs tabular-nums text-ink-400">{formatTime(c.start)}</span>
            <span className={i === active ? 'font-medium text-white' : 'text-ink-300'}>{c.title}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export function Empty({ title, text }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <p className="font-display text-xl">{title}</p>
      <p className="max-w-xs text-sm text-ink-400">{text}</p>
    </div>
  )
}
