import { Bookmark, Heart, ListPlus, Pause, Play } from 'lucide-react'
import Cover from './Cover'
import { progressInfo } from '../hooks/useAudioEngine'
import { formatDate, formatTime } from '../lib/format'

export default function EpisodeCard({ ep, engine, featured = false }) {
  const { current, playing, progress, favorites, queue } = engine
  const isCurrent = current?.id === ep.id
  const isPlaying = isCurrent && playing
  const info = progressInfo(progress, ep)
  const fav = favorites.includes(ep.id)
  const queued = queue.includes(ep.id)

  const onPlay = () => (isCurrent ? engine.toggle() : engine.select(ep))
  const icon = 'press flex h-9 w-9 items-center justify-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white'

  return (
    <article className={`group fade-up glass flex gap-4 rounded-3xl p-3 ${featured ? 'flex-col sm:flex-row sm:p-4' : 'items-center'}`}>
      <button
        onClick={onPlay}
        aria-label={`${isPlaying ? 'Pausar' : 'Tocar'} ${ep.title}`}
        className={`press relative shrink-0 overflow-hidden rounded-2xl bg-ink-800 ${featured ? 'aspect-square w-52 self-center sm:w-56 sm:self-auto' : 'h-20 w-20'}`}
        style={featured ? { boxShadow: `0 24px 60px -20px ${ep.accentColor || '#6d5dfc'}99` } : undefined}
      >
        <Cover src={ep.cover} className="h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100">
          {isPlaying ? <Pause size={featured ? 36 : 24} fill="currentColor" /> : <Play size={featured ? 36 : 24} fill="currentColor" />}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <p className="eyebrow truncate">{featured ? 'Em destaque · ' : ''}{ep.show}</p>
        <h3 className={`font-display leading-tight ${featured ? 'text-3xl sm:text-4xl' : 'line-clamp-2 text-xl'}`}>{ep.title}</h3>
        {featured && <p className="line-clamp-3 text-sm text-ink-400">{ep.description.replace(/[*#[\]]|\(http[^)]*\)/g, '')}</p>}
        <p className="eyebrow tabular-nums normal-case tracking-wider">
          {formatDate(ep.publishedAt)}{ep.publishedAt ? ' · ' : ''}{formatTime(ep.duration)}
          {info.done && ' · Concluído'}
        </p>
        {info.resumeAt > 0 && (
          <div className="mt-1 flex items-center gap-3">
            <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progresso" aria-valuenow={Math.round(info.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-signal" style={{ width: `${info.ratio * 100}%` }} />
            </div>
            <button onClick={() => engine.select(ep)} className="press text-xs font-medium tabular-nums text-ink-300 hover:text-white">
              Continuar de {formatTime(info.resumeAt)}
            </button>
          </div>
        )}
      </div>

      <div className={`flex shrink-0 ${featured ? 'self-end sm:flex-col' : 'flex-col'}`}>
        <button onClick={() => engine.toggleFavorite(ep.id)} aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Favoritar'} className={icon}>
          <Heart size={18} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-rose-400' : ''} />
        </button>
        <button
          onClick={() => (queued ? engine.dequeue(ep.id) : engine.enqueue(ep.id))}
          aria-pressed={queued}
          aria-label={queued ? 'Remover da fila' : 'Adicionar à fila'}
          className={icon}
        >
          {queued ? <Bookmark size={18} fill="currentColor" /> : <ListPlus size={18} />}
        </button>
      </div>
    </article>
  )
}
