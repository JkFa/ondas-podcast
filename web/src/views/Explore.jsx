import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import EpisodeCard from '../components/EpisodeCard'
import { progressInfo } from '../hooks/useAudioEngine'

export function Skeletons() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="skeleton h-64" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}
    </div>
  )
}

export default function Explore({ episodes, engine, loading, error }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const results = useMemo(
    () => (q ? episodes.filter((e) => `${e.title} ${e.show} ${e.description}`.toLowerCase().includes(q)) : episodes),
    [episodes, q],
  )
  const continuing = useMemo(
    () =>
      episodes
        .filter((e) => { const i = progressInfo(engine.progress, e); return i.resumeAt > 0 && !i.done })
        .sort((a, b) => (engine.progress[b.id].at || 0) - (engine.progress[a.id].at || 0)),
    [episodes, engine.progress],
  )

  const [featured, ...rest] = results

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-5xl sm:text-6xl">Ondas</h1>
        <p className="-mt-2 max-w-md text-zinc-400">Podcasts independentes, hospedados no Internet Archive.</p>
        <label className="glass flex items-center gap-3 rounded-2xl px-4 py-3 focus-within:border-white/30">
          <Search size={18} className="text-zinc-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou descrição"
            aria-label="Buscar episódios"
            className="w-full bg-transparent text-sm placeholder:text-zinc-500 focus:outline-none"
          />
        </label>
      </header>

      {loading && <Skeletons />}
      {error && <p role="alert" className="text-sm text-rose-300">Não foi possível carregar o catálogo. Verifique a conexão e recarregue.</p>}
      {!loading && !error && !results.length && (
        <p className="text-zinc-400">{q ? `Nenhum episódio encontrado para “${query}”.` : 'O catálogo está vazio. Use + para importar um episódio.'}</p>
      )}

      {!q && continuing.length > 0 && (
        <section aria-labelledby="continue-h" className="flex flex-col gap-3">
          <h2 id="continue-h" className="eyebrow">Continuar ouvindo</h2>
          {continuing.map((e) => <EpisodeCard key={e.id} ep={e} engine={engine} />)}
        </section>
      )}

      {featured && (
        <section aria-labelledby="all-h" className="flex flex-col gap-3">
          <h2 id="all-h" className="eyebrow">{q ? `${results.length} resultado(s)` : 'Episódios'}</h2>
          <EpisodeCard ep={featured} engine={engine} featured={!q} />
          {rest.map((e) => <EpisodeCard key={e.id} ep={e} engine={engine} />)}
        </section>
      )}
    </div>
  )
}
