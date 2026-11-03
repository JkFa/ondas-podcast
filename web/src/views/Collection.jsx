import { ArrowLeft, Share2 } from 'lucide-react'
import BookCard from '../components/BookCard'
import { useDownloads } from '../hooks/useDownloads'
import { paths } from '../hooks/useRoute'
import { t } from '../strings'

/** Lista de obras de um autor ou de um gênero. `data` = null quando o catálogo ainda carrega; undefined = não existe. */
export default function Collection({ eyebrow, title, lead, books, engine, loading, onShare }) {
  const { meta: downloads } = useDownloads()
  const playingSlug = engine.current && engine.playing ? books?.find((b) => b.parts.some((p) => p.id === engine.current.id))?.slug : null
  return (
    <div className="flex flex-col gap-8">
      <a href={paths.explore} className="press -ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-300 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" /> {t.browse.backLibrary}
      </a>
      {!books ? (
        <h1 className="font-display text-3xl">{loading ? 'Carregando…' : t.browse.notFound}</h1>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
            <p className="max-w-2xl text-ink-300">{lead}</p>
            <button onClick={onShare} aria-haspopup="dialog" className="press mt-1 flex min-h-11 w-fit items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-[0.9375rem] font-medium text-ink-200 hover:bg-white/10">
              <Share2 size={18} aria-hidden="true" /> {t.share.button}
            </button>
          </header>
          <section aria-label={title}>
            <div className="shelf">
              {books.map((b) => <BookCard key={b.slug} book={b} engine={engine} progress={engine.progress} playing={b.slug === playingSlug} offline={b.parts.filter((p) => downloads[p.id]).length} />)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
