import { ArrowLeft, Bookmark, ListPlus, Pause, Play, Share2 } from 'lucide-react'
import { useState } from 'react'
import BookDownload from '../components/BookDownload'
import Cover from '../components/Cover'
import DownloadButton from '../components/DownloadButton'
import { useDownloads } from '../hooks/useDownloads'
import { useOnline } from '../hooks/useOnline'
import ViewCount from '../components/ViewCount'
import { progressInfo } from '../hooks/useAudioEngine'
import { paths } from '../hooks/useRoute'
import { bookStats, partLabel, resumeTarget } from '../lib/books'
import { viewKey } from '../lib/views'
import { t } from '../strings'
import { formatDuration, formatTime } from '../lib/format'

function Part({ book, ep, index, engine }) {
  const { current, playing, progress, queue } = engine
  const isCurrent = current?.id === ep.id
  const isPlaying = isCurrent && playing
  const info = progressInfo(progress, ep)
  const { meta } = useDownloads()
  const online = useOnline()
  const offlineReady = !!meta[ep.id]
  const blocked = !online && !offlineReady && !isCurrent // sem rede e sem arquivo baixado: não há como tocar
  const queued = queue.includes(ep.id)
  const label = partLabel(book, ep)
  return (
    <li className={`flex items-center gap-1 rounded-2xl pr-1 ${isCurrent ? 'bg-white/10' : 'hover:bg-white/5'}`}>
      <button
        onClick={() => (isCurrent ? engine.toggle() : engine.select(ep))}
        disabled={blocked}
        aria-label={`${isPlaying ? 'Pausar' : 'Tocar'} ${ep.title}${info.done ? '. Concluída' : ''}${offlineReady ? `. ${t.downloads.available}` : ''}${blocked ? `. ${t.downloads.unavailable}` : ''}`}
        className="press flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left disabled:opacity-50"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm tabular-nums ${isCurrent ? 'bg-signal text-ink-950' : 'bg-white/10 text-ink-300'}`}>
          {isPlaying ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : isCurrent ? <Play size={16} fill="currentColor" aria-hidden="true" /> : info.done ? '✓' : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[0.9375rem] font-medium ${info.done && !isCurrent ? 'text-ink-400' : ''}`}>{label}</span>
          <span className="mt-0.5 flex items-center gap-2 text-xs tabular-nums text-ink-400">
            {formatDuration(ep.duration)}
            {offlineReady && <span className="rounded-full border border-[color:var(--control-line)] px-2 py-0.5 text-[0.6875rem] font-medium text-signal" aria-hidden="true">{t.downloads.available}</span>}
            {blocked && <span className="text-[0.6875rem]" aria-hidden="true">{t.downloads.unavailable}</span>}
            {info.resumeAt > 0 && !info.done && (
              <>
                <span className="h-0.5 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <span className="block h-full bg-signal" style={{ width: `${info.ratio * 100}%` }} />
                </span>
                {formatTime(info.resumeAt)}
              </>
            )}
          </span>
        </span>
      </button>
      <DownloadButton ep={ep} />
      <button
        onClick={() => (queued ? engine.dequeue(ep.id) : engine.enqueue(ep.id))}
        aria-pressed={queued}
        aria-label={queued ? `Remover ${label} da fila` : `Adicionar ${label} à fila`}
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white"
      >
        {queued ? <Bookmark size={18} fill="currentColor" /> : <ListPlus size={18} />}
      </button>
    </li>
  )
}

export default function Book({ book, engine, loading, onShare }) {
  const [expanded, setExpanded] = useState(false)

  if (!book) {
    return (
      <div className="flex flex-col gap-4 pt-8">
        <p className="text-ink-300">{loading ? 'Carregando…' : 'Não encontramos esta obra no catálogo.'}</p>
        {!loading && <a href={paths.explore} className="text-signal underline-offset-4 hover:underline">Voltar à biblioteca</a>}
      </div>
    )
  }

  const stats = bookStats(book, engine.progress)
  const target = resumeTarget(book, engine.progress)
  const inBook = engine.current && book.parts.some((p) => p.id === engine.current.id)
  const n = book.parts.length
  const cta = inBook
    ? engine.playing ? 'Pausar' : 'Continuar'
    : { start: 'Ouvir', resume: `Continuar · ${formatTime(target.resumeAt)}`, next: 'Ouvir próxima parte', again: 'Ouvir de novo' }[target.state]
  const sub = inBook ? partLabel(book, engine.current) : target.state === 'start' ? null : partLabel(book, target.part)
  const paragraphs = book.description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)

  return (
    <article className="flex flex-col gap-8">
      <a href={paths.explore} className="press -ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-300 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" /> Biblioteca
      </a>

      <header className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div
          className="aspect-square w-56 max-w-full shrink-0 overflow-hidden rounded-3xl bg-ink-800 sm:w-60"
          style={{ boxShadow: `0 30px 70px -28px ${book.accentColor || '#6d5dfc'}` }}
        >
          <Cover src={book.cover} alt={t.player.cover(book.title, book.author)} className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-3 sm:items-start">
          <p className="eyebrow">{book.author}</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{book.title}</h1>
          <p className="text-sm tabular-nums text-ink-300">
            {book.isSeries ? `${n} ${n === 1 ? 'parte' : 'partes'} · ` : ''}{formatDuration(book.duration)}
            {stats.done > 0 && book.isSeries && ` · ${stats.done} de ${n} concluídas`}
          </p>
          <ViewCount viewKey={viewKey('livro', book.slug)} label="acessos a esta obra" />
          <div className="mt-1 flex flex-col items-center gap-2 sm:items-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button
              onClick={() => (inBook ? engine.toggle() : engine.select(target.part))}
              className="press flex items-center gap-2.5 rounded-full bg-signal px-6 py-3 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover"
            >
              {inBook && engine.playing ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
              {cta}
            </button>
            <button onClick={() => onShare(book)} aria-haspopup="dialog" className="press flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-[0.9375rem] font-medium text-ink-200 hover:bg-white/10">
              <Share2 size={18} aria-hidden="true" /> {t.share.button}
            </button>
            </div>
            <BookDownload book={book} />
            {sub && book.isSeries && <p className="max-w-xs truncate text-xs text-ink-400">{sub}</p>}
          </div>
        </div>
      </header>

      {paragraphs.length > 0 && (
        <section aria-labelledby="about-h" className="flex flex-col gap-3">
          <h2 id="about-h" className="eyebrow">Sobre</h2>
          <div className={`flex max-w-2xl flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-300 ${expanded ? '' : 'line-clamp-5'}`}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="press min-h-11 w-fit text-sm font-medium text-signal hover:underline">
            {expanded ? 'Mostrar menos' : 'Ler mais'}
          </button>
        </section>
      )}

      <section aria-labelledby="parts-h" className="flex flex-col gap-3">
        <h2 id="parts-h" className="eyebrow">{book.isSeries ? 'Partes' : 'Episódio'}</h2>
        <ol className="flex flex-col gap-1">
          {book.parts.map((ep, i) => <Part key={ep.id} book={book} ep={ep} index={i} engine={engine} />)}
        </ol>
      </section>

      <p className="text-xs text-ink-400">
        Fonte: Internet Archive{book.license && <> · <a href={book.license} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink-300">licença</a></>}
      </p>
    </article>
  )
}
