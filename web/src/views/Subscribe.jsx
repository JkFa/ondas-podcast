import { Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import SubscribeApps from '../components/SubscribeApps'
import { feedUrl } from '../lib/podcastApps'
import { t } from '../strings'

const s = t.subscribe
const base = () => new URL(import.meta.env.BASE_URL, location.origin).href

/** "Ouça no seu app": assinar o feed geral (ou o de uma obra) com um toque no app de podcasts. */
export default function Subscribe({ books, onShare }) {
  const [slug, setSlug] = useState('')
  const book = useMemo(() => books.find((b) => b.slug === slug), [books, slug])
  const feed = feedUrl(base(), book?.slug)
  const title = book ? book.title : 'Ondas'

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl">{s.title}</h1>
        <p className="max-w-xl text-ink-300">{s.intro}</p>
        <button onClick={onShare} aria-haspopup="dialog" className="press flex min-h-11 w-fit items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-[0.9375rem] font-medium text-ink-200 hover:bg-white/10">
          <Share2 size={18} aria-hidden="true" /> {s.share}
        </button>
      </header>

      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor="pick-feed" className="text-sm font-medium text-ink-200">{s.pickLabel}</label>
        <select
          id="pick-feed"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="min-h-11 rounded-xl border border-[color:var(--control-line)] bg-ink-900 px-3 text-sm text-ink-50"
        >
          <option value="">{s.whole}</option>
          {[...books].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')).map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
        </select>
        <p className="text-xs text-ink-400">{s.pickHint}</p>
      </div>

      <section aria-labelledby="apps-h" className="flex flex-col gap-3">
        <h2 id="apps-h" className="font-display text-2xl">{s.for(title)}</h2>
        <SubscribeApps key={feed} feed={feed} title={title} scope={book ? 'book' : 'catalog'} />
      </section>
    </div>
  )
}
