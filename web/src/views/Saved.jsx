import { ArrowDown, ArrowUp, BarChart3, Download, Repeat2, X } from 'lucide-react'
import { useDownloads } from '../hooks/useDownloads'
import { paths } from '../hooks/useRoute'
import { formatBytes, totalBytes } from '../lib/downloads'
import { t } from '../strings'
import Cover from '../components/Cover'
import EpisodeCard from '../components/EpisodeCard'
import { formatTime } from '../lib/format'

export default function Saved({ episodes, engine }) {
  const byId = new Map(episodes.map((e) => [e.id, e]))
  const favs = engine.favorites.map((id) => byId.get(id)).filter(Boolean)
  const queue = engine.queue.map((id) => byId.get(id)).filter(Boolean)
  const { meta } = useDownloads()
  const nDownloads = Object.keys(meta).length
  const btn = 'press flex h-11 w-11 items-center justify-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-5xl">Salvos</h1>

      <a href={paths.downloads} className="glass press flex min-h-11 items-center gap-3 rounded-2xl p-4 hover:bg-white/5">
        <Download size={20} className="text-signal" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t.downloads.link}</span>
          <span className="block text-xs text-ink-400">{nDownloads ? t.downloads.downloadsSize(nDownloads, formatBytes(totalBytes(meta))) : t.downloads.empty.split('.')[0] + '.'}</span>
        </span>
      </a>

      <div className="grid gap-3 sm:grid-cols-2">
        <a href={paths.stats} className="glass press flex min-h-11 items-center gap-3 rounded-2xl p-4 hover:bg-white/5">
          <BarChart3 size={20} className="text-signal" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-medium">{t.stats.link}</span><span className="block text-xs text-ink-400">{t.stats.linkHint}</span></span>
        </a>
        <a href={paths.backup} className="glass press flex min-h-11 items-center gap-3 rounded-2xl p-4 hover:bg-white/5">
          <Repeat2 size={20} className="text-signal" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-medium">{t.backup.link}</span><span className="block text-xs text-ink-400">{t.backup.linkHint}</span></span>
        </a>
      </div>

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
