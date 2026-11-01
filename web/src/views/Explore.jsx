import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import BookCard from '../components/BookCard'
import ResumeCard from '../components/ResumeCard'
import { useDownloads } from '../hooks/useDownloads'
import { bookStats, lastListened } from '../lib/books'

export function Skeletons() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(10.5rem,100%),1fr))] gap-x-4 gap-y-8" aria-hidden="true">
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
  { id: 'offline', label: 'Baixados' },
]

export default function Explore({ books, engine, loading, error }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const { meta: downloads } = useDownloads()
  const q = query.trim().toLowerCase()

  const stats = useMemo(() => new Map(books.map((b) => [b.slug, bookStats(b, engine.progress)])), [books, engine.progress])
  const lastBook = useMemo(() => lastListened(books, engine.progress), [books, engine.progress])

  const results = useMemo(
    () =>
      books.filter((b) => {
        const s = stats.get(b.slug)
        if (filter === 'going' && !(s.started && !s.finished)) return false
        if (filter === 'done' && !s.finished) return false
        if (filter === 'offline' && !b.parts.some((p) => downloads[p.id])) return false
        return !q || `${b.title} ${b.author} ${b.description} ${b.parts.map((p) => p.title).join(' ')}`.toLowerCase().includes(q)
      }),
    [books, stats, filter, q, downloads],
  )
  const playingSlug = engine.current && engine.playing ? books.find((b) => b.parts.some((p) => p.id === engine.current.id))?.slug : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-5xl sm:text-6xl">Biblioteca</h1>
          <p className="max-w-lg text-ink-400">Áudios e podcasts indies arquivados e prontos para ouvir.</p>
        </div>
        <label className="glass flex items-center gap-3 rounded-2xl border-[color:var(--control-line)] px-4 sm:max-w-md">
          <Search size={18} className="text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, autor ou capítulo"
            aria-label="Buscar na biblioteca"
            className="min-h-12 w-full bg-transparent text-sm placeholder:text-ink-400"
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
            <div role="group" aria-label="Filtrar biblioteca" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`press min-h-11 rounded-full border px-4 py-2 text-sm ${filter === f.id ? 'border-signal bg-signal text-ink-950' : 'border-[color:var(--control-line)] text-ink-300 hover:bg-white/10'}`}
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(10.5rem,100%),1fr))] gap-x-4 gap-y-8">
              {results.map((b) => <BookCard key={b.slug} book={b} progress={engine.progress} playing={b.slug === playingSlug} offline={b.parts.filter((p) => downloads[p.id]).length} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
