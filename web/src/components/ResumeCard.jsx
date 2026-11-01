import { Play } from 'lucide-react'
import Cover from './Cover'
import { bookPath } from '../hooks/useRoute'
import { bookStats, partLabel, resumeTarget } from '../lib/books'
import { formatTime } from '../lib/format'

/** Retomar: o livro mexido mais recentemente, apontando para a parte certa. */
export default function ResumeCard({ book, engine }) {
  const target = resumeTarget(book, engine.progress)
  const { part } = target
  const isCurrent = engine.current?.id === part.id
  const label = { resume: `Continuar · ${formatTime(target.resumeAt)}`, next: 'Ouvir próxima parte', start: 'Ouvir', again: 'Ouvir de novo' }[target.state]
  const stats = bookStats(book, engine.progress)
  return (
    <section aria-labelledby="resume-h" className="glass fade-up flex items-center gap-4 rounded-3xl p-3 sm:gap-5 sm:p-4">
      <a href={bookPath(book.slug)} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <Cover src={book.cover} className="h-24 w-24 rounded-2xl sm:h-28 sm:w-28" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 id="resume-h" className="eyebrow">Continue de onde parou</h2>
        <a href={bookPath(book.slug)} className="font-display line-clamp-2 text-xl leading-tight sm:text-2xl">{book.title}</a>
        <p className="truncate text-sm text-ink-400">{book.isSeries ? partLabel(book, part) : book.author}</p>
        <p className="sr-only">{Math.round(stats.ratio * 100)}% da obra ouvido</p>
        <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full bg-signal" style={{ width: `${stats.ratio * 100}%` }} />
        </div>
        <button
          onClick={() => (isCurrent ? engine.toggle() : engine.select(part))}
          className="press mt-1 flex w-fit items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-hover"
        >
          <Play size={16} fill="currentColor" aria-hidden="true" />
          {isCurrent && engine.playing ? 'Pausar' : label}
        </button>
      </div>
    </section>
  )
}
