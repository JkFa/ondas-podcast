import { ArrowDown, ArrowUp, X } from 'lucide-react'
import Cover from '../components/Cover'
import EpisodeCard from '../components/EpisodeCard'
import { formatTime } from '../lib/format'

export default function Saved({ episodes, engine }) {
  const byId = new Map(episodes.map((e) => [e.id, e]))
  const favs = engine.favorites.map((id) => byId.get(id)).filter(Boolean)
  const queue = engine.queue.map((id) => byId.get(id)).filter(Boolean)
  const btn = 'press flex h-9 w-9 items-center justify-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-5xl">Salvos</h1>

      <section aria-labelledby="queue-h" className="flex flex-col gap-3">
        <h2 id="queue-h" className="eyebrow">A seguir</h2>
        {queue.length === 0 && <p className="text-sm text-ink-400">A fila está vazia. Adicione episódios com o botão de fila.</p>}
        <ol className="flex flex-col gap-2">
          {queue.map((ep, i) => (
            <li key={ep.id} className="glass flex items-center gap-3 rounded-2xl p-2 pr-3">
              <Cover src={ep.cover} className="h-12 w-12 shrink-0 rounded-lg" />
              <button onClick={() => engine.select(ep)} className="press min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{ep.title}</span>
                <span className="eyebrow block truncate tabular-nums normal-case tracking-wider">{ep.show} · {formatTime(ep.duration)}</span>
              </button>
              <button onClick={() => engine.moveInQueue(ep.id, -1)} disabled={i === 0} aria-label={`Subir ${ep.title}`} className={btn}><ArrowUp size={16} /></button>
              <button onClick={() => engine.moveInQueue(ep.id, 1)} disabled={i === queue.length - 1} aria-label={`Descer ${ep.title}`} className={btn}><ArrowDown size={16} /></button>
              <button onClick={() => engine.dequeue(ep.id)} aria-label={`Remover ${ep.title} da fila`} className={btn}><X size={16} /></button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fav-h" className="flex flex-col gap-3">
        <h2 id="fav-h" className="eyebrow">Favoritos</h2>
        {favs.length === 0 && <p className="text-sm text-ink-400">Nenhum favorito ainda. Toque no coração de um episódio.</p>}
        {favs.map((ep) => <EpisodeCard key={ep.id} ep={ep} engine={engine} />)}
      </section>
    </div>
  )
}
