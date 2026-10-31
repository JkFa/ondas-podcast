import { Play, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import BookCard from '../components/BookCard'
import Cover from '../components/Cover'
import ViewCount from '../components/ViewCount'
import { bookPath } from '../hooks/useRoute'
import { bookStats, partLabel, resumeTarget } from '../lib/books'
import { formatTime } from '../lib/format'

export function Skeletons() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="skeleton aspect-square rounded-3xl" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'going', label: 'Em andamento' },
  { id: 'done', label: 'Concluídos' },
]

/** Retomar: o livro mexido mais recentemente, apontando para a parte certa. */
function ResumeCard({ book, engine }) {
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
        <div className="h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progresso da obra" aria-valuenow={Math.round(stats.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
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

export default function Explore({ books, engine, loading, error }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const q = query.trim().toLowerCase()

  const stats = useMemo(() => new Map(books.map((b) => [b.slug, bookStats(b, engine.progress)])), [books, engine.progress])
  const lastBook = useMemo(() => {
    const touched = books.filter((b) => stats.get(b.slug).lastAt > 0)
    return touched.sort((a, b) => stats.get(b.slug).lastAt - stats.get(a.slug).lastAt)[0]
  }, [books, stats])

  const results = useMemo(
    () =>
      books.filter((b) => {
        const s = stats.get(b.slug)
        if (filter === 'going' && !(s.started && !s.finished)) return false
        if (filter === 'done' && !s.finished) return false
        return !q || `${b.title} ${b.author} ${b.description} ${b.parts.map((p) => p.title).join(' ')}`.toLowerCase().includes(q)
      }),
    [books, stats, filter, q],
  )
  const playingSlug = engine.current && engine.playing ? books.find((b) => b.parts.some((p) => p.id === engine.current.id))?.slug : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-5xl sm:text-6xl">Ondas</h1>
          <p className="max-w-lg text-ink-400">Audiolivros e podcasts independentes, hospedados no Internet Archive.</p>
          <ViewCount viewKey="site" label="visitas ao site" />
        </div>
        <label className="glass flex items-center gap-3 rounded-2xl px-4 py-3 focus-within:border-white/30 sm:max-w-md">
          <Search size={18} className="text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, autor ou capítulo"
            aria-label="Buscar na biblioteca"
            className="w-full bg-transparent text-sm placeholder:text-ink-500 focus:outline-none"
          />
        </label>
      </header>

      {loading && <Skeletons />}
      {error && <p role="alert" className="text-sm text-rose-300">Não foi possível carregar o catálogo. Verifique a conexão e recarregue.</p>}

      {!q && filter === 'all' && lastBook && <ResumeCard book={lastBook} engine={engine} />}

      {!loading && !error && (
        <section aria-labelledby="lib-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="lib-h" className="eyebrow">Biblioteca · {results.length} {results.length === 1 ? 'obra' : 'obras'}</h2>
            <div role="group" aria-label="Filtrar biblioteca" className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`press rounded-full border px-3.5 py-1.5 text-sm ${filter === f.id ? 'border-signal bg-signal text-ink-950' : 'border-white/10 text-ink-300 hover:border-white/30'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {results.length === 0 ? (
            <p className="py-6 text-ink-400">
              {q ? `Nada encontrado para “${query}”.` : filter === 'all' ? 'O catálogo está vazio. Use + para importar um episódio.' : 'Nenhuma obra nesta seção ainda.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((b) => <BookCard key={b.slug} book={b} progress={engine.progress} playing={b.slug === playingSlug} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
