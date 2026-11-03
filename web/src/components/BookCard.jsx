import { Check, Pause, Play } from 'lucide-react'
import Cover from './Cover'
import { bookStats, resumeTarget } from '../lib/books'
import { bookPath } from '../hooks/useRoute'
import { formatDuration } from '../lib/format'

export default function BookCard({ book, progress, playing, offline = 0, engine }) {
  const stats = bookStats(book, progress)
  const n = book.parts.length
  const meta = book.isSeries ? `${n} ${n === 1 ? 'parte' : 'partes'}` : 'episódio'
  // Tocar direto do cartão: pausa/retoma se a obra já está carregada, senão começa pela parte certa.
  const onPlay = () => {
    if (book.parts.some((p) => p.id === engine.current?.id)) engine.toggle()
    else engine.select(resumeTarget(book, progress).part)
  }
  return (
    <div className="group fade-up relative flex flex-col gap-3 rounded-lg p-3 transition-colors duration-200 hover:bg-white/10 focus-within:bg-white/10">
      <div
        className="relative aspect-square overflow-hidden rounded-md bg-ink-800"
        style={{ boxShadow: `0 16px 32px -16px ${book.accentColor || '#6d5dfc'}` }}
      >
        <Cover src={book.cover} className="h-full w-full" />
        {playing && (
          <span className="absolute left-2 top-2 rounded-full bg-signal px-2.5 py-1 text-[0.6875rem] font-semibold text-ink-950">Tocando</span>
        )}
        {offline > 0 && (
          <span className="absolute bottom-2 left-2 rounded-full bg-ink-950/85 px-2.5 py-1 text-[0.6875rem] font-semibold text-signal" aria-hidden="true">
            {offline === book.parts.length ? 'Offline' : `Offline ${offline}/${book.parts.length}`}
          </span>
        )}
        {stats.finished && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-signal text-ink-950" aria-hidden="true">
            <Check size={16} strokeWidth={3} />
          </span>
        )}
        {stats.started && !stats.finished && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50" aria-hidden="true">
            <span className="block h-full bg-signal" style={{ width: `${stats.ratio * 100}%` }} />
          </span>
        )}
        {engine && (
          <button
            type="button"
            onClick={onPlay}
            data-on={playing || undefined}
            aria-label={`${playing ? 'Pausar' : 'Tocar'} ${book.title}`}
            className="card-play absolute bottom-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-signal text-ink-950 shadow-xl shadow-black/40 hover:scale-105 hover:bg-signal-hover"
          >
            {playing ? <Pause size={22} fill="currentColor" aria-hidden="true" /> : <Play size={22} fill="currentColor" className="translate-x-px" aria-hidden="true" />}
          </button>
        )}
      </div>
      <a
        href={bookPath(book.slug)}
        aria-label={`${book.title}, de ${book.author}. ${meta}, ${formatDuration(book.duration)}${stats.finished ? '. Concluído' : stats.started ? '. Em andamento' : ''}${offline ? `. ${offline === book.parts.length ? 'Disponível offline' : `${offline} de ${book.parts.length} partes disponíveis offline`}` : ''}`}
        className="block min-w-0 after:absolute after:inset-0 after:rounded-lg"
      >
        <span className="block truncate text-base font-bold">{book.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-ink-400">{book.author}</span>
        <span className="eyebrow mt-1 block tabular-nums">{meta} · {formatDuration(book.duration)}</span>
      </a>
    </div>
  )
}
