import { Search } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import BookCard from '../components/BookCard'
import ResumeCard from '../components/ResumeCard'
import { useDownloads } from '../hooks/useDownloads'
import { useSearchIndex } from '../hooks/useSearchIndex'
import { genrePath, paths } from '../hooks/useRoute'
import { announce } from '../lib/announce'
import { bookStats, lastListened, partLabel } from '../lib/books'
import { formatTime } from '../lib/format'
import { search, snippetParts } from '../lib/search'
import { t } from '../strings'

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

export default function Explore({ books, engine, loading, error, genres = [] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [wantIndex, setWantIndex] = useState(false)
  const { meta: downloads } = useDownloads()
  const q = useDeferredValue(query.trim().toLowerCase())
  const { status, index } = useSearchIndex(wantIndex || !!q)
  const hits = useMemo(() => (q && index ? search(index, query) : null), [q, index, query])
  const bySlug = useMemo(() => new Map(books.map((b) => [b.slug, b])), [books])
  const coverage = useMemo(() => {
    const eps = books.flatMap((b) => b.parts)
    return { n: eps.filter((e) => e.transcripts || e.transcript?.length).length, total: eps.length }
  }, [books])

  const stats = useMemo(() => new Map(books.map((b) => [b.slug, bookStats(b, engine.progress)])), [books, engine.progress])
  const lastBook = useMemo(() => lastListened(books, engine.progress), [books, engine.progress])

  const rank = useMemo(() => new Map((hits?.works ?? []).map((w) => [w.slug, w.score])), [hits])
  const results = useMemo(
    () =>
      books.filter((b) => {
        const s = stats.get(b.slug)
        if (filter === 'going' && !(s.started && !s.finished)) return false
        if (filter === 'done' && !s.finished) return false
        if (filter === 'offline' && !b.parts.some((p) => downloads[p.id])) return false
        if (!q) return true
        if (hits) return rank.has(b.slug)
        return `${b.title} ${b.author} ${b.description} ${b.parts.map((p) => p.title).join(' ')}`.toLowerCase().includes(q) // índice ainda não chegou (ou falhou)
      }).sort((a, b) => (hits ? (rank.get(b.slug) ?? 0) - (rank.get(a.slug) ?? 0) : 0)),
    [books, stats, filter, q, downloads, hits, rank],
  )
  const passages = useMemo(() => (hits ? hits.passages.filter((p) => bySlug.has(p.slug)) : []), [hits, bySlug])

  // Avisa leitores de tela do total depois que a pessoa para de digitar (a lista muda sozinha, sem botão de buscar).
  useEffect(() => {
    if (!q || (status === 'loading' && !hits)) return
    const id = setTimeout(() => announce(results.length || passages.length ? t.search.count(results.length, passages.length) : t.search.none(query.trim())), 600)
    return () => clearTimeout(id)
  }, [q, results.length, passages.length, hits, status, query])
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
            onFocus={() => setWantIndex(true)}
            placeholder={t.search.placeholder}
            aria-label={t.search.label}
            className="min-h-12 w-full bg-transparent text-sm placeholder:text-ink-400"
          />
        </label>
        {genres.length > 0 && (
          <nav aria-label={t.browse.genres} className="flex flex-col gap-2">
            <p className="eyebrow">{t.browse.genres}</p>
            <ul className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <li key={g.id}>
                  <a href={genrePath(g.id)} className="press flex min-h-11 items-center rounded-full border border-[color:var(--control-line)] px-4 text-sm text-ink-300 hover:bg-white/10 hover:text-white">
                    {g.label} <span className="ml-1.5 text-xs text-ink-400" aria-label={`, ${t.browse.worksCount(g.books.length)}`}>{g.books.length}</span>
                  </a>
                </li>
              ))}
              <li>
                <a href={paths.authors} className="press flex min-h-11 items-center rounded-full border border-signal px-4 text-sm text-signal hover:bg-white/10">{t.browse.allAuthors}</a>
              </li>
            </ul>
          </nav>
        )}
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
              {q ? t.search.none(query.trim()) : filter === 'all' ? 'O catálogo está vazio. Use + para importar um episódio.' : 'Nenhuma obra nesta seção ainda.'}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(10.5rem,100%),1fr))] gap-x-4 gap-y-8">
              {results.map((b) => <BookCard key={b.slug} book={b} progress={engine.progress} playing={b.slug === playingSlug} offline={b.parts.filter((p) => downloads[p.id]).length} />)}
            </div>
          )}
        </section>
      )}

      {q && status === 'loading' && !hits && <p className="text-sm text-ink-400">{t.search.loading}</p>}
      {q && status === 'error' && <p className="text-sm text-ink-400">{t.search.fallback}</p>}

      {q && passages.length > 0 && (
        <section aria-labelledby="pass-h" className="flex flex-col gap-3">
          <h2 id="pass-h" className="eyebrow">{t.search.passagesTitle} · {passages.length}</h2>
          <ol className="flex flex-col gap-2">
            {passages.map((p) => {
              const book = bySlug.get(p.slug)
              const ep = book.parts.find((e) => e.id === p.ep)
              const at = formatTime(p.start)
              const where = book.isSeries && ep ? `${book.title} — ${partLabel(book, ep)}` : book.title
              return (
                <li key={`${p.kind}:${p.ep}:${p.start}`}>
                  <a
                    href={`#/livro/${encodeURIComponent(p.slug)}?ep=${encodeURIComponent(p.ep)}&t=${p.start}`}
                    aria-label={`${p.kind === 'chapter' ? t.search.chapterTag : t.search.spokenTag}: ${p.snippet}. ${t.search.open(where, at)}`}
                    className="glass press flex min-h-11 flex-col gap-1 rounded-2xl px-4 py-3 hover:bg-white/5"
                  >
                    <span className="text-xs text-ink-400">
                      <span className="font-medium text-ink-300">{where}</span> · {p.kind === 'chapter' ? t.search.chapterTag : t.search.spokenTag} · <span className="tabular-nums">{at}</span>
                    </span>
                    <span className="text-sm text-ink-200" aria-hidden="true">
                      {snippetParts(p.snippet, p.terms).map((part, i) => (part.hit ? <mark key={i} className="rounded bg-signal px-0.5 text-ink-950">{part.text}</mark> : part.text))}
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {q && hits && coverage.n < coverage.total && <p className="text-xs text-ink-400">{t.search.coverage(coverage.n, coverage.total)}</p>}
    </div>
  )
}
