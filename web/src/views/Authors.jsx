import { ArrowLeft } from 'lucide-react'
import { authorPath, paths } from '../hooks/useRoute'
import { formatDuration } from '../lib/format'
import { t } from '../strings'

export default function Authors({ authors, loading }) {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <a href={paths.explore} className="press -ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-300 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" /> {t.browse.backLibrary}
      </a>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl">{t.browse.authorsTitle}</h1>
        {!loading && <p className="text-ink-300">{t.browse.authorsLead(authors.length)}</p>}
      </header>
      <ul className="grid gap-2 sm:grid-cols-2">
        {authors.map((a) => (
          <li key={a.slug}>
            <a href={authorPath(a.slug)} className="glass press flex min-h-14 flex-col justify-center rounded-lg px-4 py-3 hover:bg-white/10">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-ink-400">{t.browse.worksCount(a.books.length)} · {formatDuration(a.duration)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
