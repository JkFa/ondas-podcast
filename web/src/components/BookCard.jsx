import { Check } from 'lucide-react'
import Cover from './Cover'
import { bookStats } from '../lib/books'
import { bookPath } from '../hooks/useRoute'
import { formatDuration } from '../lib/format'

export default function BookCard({ book, progress, playing, offline = 0 }) {
  const stats = bookStats(book, progress)
  const n = book.parts.length
  const meta = book.isSeries ? `${n} ${n === 1 ? 'parte' : 'partes'}` : 'episódio'
  return (
    <a
      href={bookPath(book.slug)}
      aria-label={`${book.title}, de ${book.author}. ${meta}, ${formatDuration(book.duration)}${stats.finished ? '. Concluído' : stats.started ? '. Em andamento' : ''}${offline ? `. ${offline === book.parts.length ? 'Disponível offline' : `${offline} de ${book.parts.length} partes disponíveis offline`}` : ''}`}
      className="group fade-up flex flex-col gap-3 rounded-3xl outline-offset-4"
    >
      <div
        className="relative aspect-square overflow-hidden rounded-3xl bg-ink-800 transition duration-300 ease-out-soft group-hover:-translate-y-1"
        style={{ boxShadow: `0 22px 44px -26px ${book.accentColor || '#6d5dfc'}` }}
      >
        <Cover src={book.cover} className="h-full w-full" />
        {playing && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-signal px-2.5 py-1 text-[0.6875rem] font-semibold text-ink-950">Tocando</span>
        )}
        {offline > 0 && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-ink-950/85 px-2.5 py-1 text-[0.6875rem] font-semibold text-signal" aria-hidden="true">
            {offline === book.parts.length ? 'Offline' : `Offline ${offline}/${book.parts.length}`}
          </span>
        )}
        {stats.finished && (
          <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-signal text-ink-950" aria-hidden="true">
            <Check size={16} strokeWidth={3} />
          </span>
        )}
        {stats.started && !stats.finished && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50" aria-hidden="true">
            <span className="block h-full bg-signal" style={{ width: `${stats.ratio * 100}%` }} />
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <h3 className="font-display line-clamp-2 text-lg leading-tight">{book.title}</h3>
        <p className="mt-0.5 truncate text-sm text-ink-400">{book.author}</p>
        <p className="eyebrow mt-1 normal-case tracking-wider tabular-nums">{meta} · {formatDuration(book.duration)}</p>
      </div>
    </a>
  )
}
