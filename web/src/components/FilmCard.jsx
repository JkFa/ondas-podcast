import { Check } from 'lucide-react'
import { useState } from 'react'
import { filmPath } from '../hooks/useRoute'
import { filmProgress } from '../lib/films'
import { formatDuration } from '../lib/format'
import { t } from '../strings'

/** Pôster do archive.org: <img> simples (sem CORS, não precisamos ler os pixels); se falhar, fica o fundo liso. */
function Poster({ src }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div aria-hidden="true" className="h-full w-full bg-ink-800" />
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full bg-ink-800 object-cover" />
}

export default function FilmCard({ film, saved }) {
  const p = filmProgress(saved, film)
  const genre = t.films.genres[film.genre]
  const flags = [film.silent && t.films.silent, film.captions.length > 0 && t.films.captions].filter(Boolean)
  const label = `${film.title}, ${film.year}. ${genre}, ${formatDuration(film.duration)}${film.silent ? `. ${t.films.silent}` : ''}${film.captions.length ? `. ${t.films.captions}` : `. ${t.films.noCaptions}`}${p.done ? '. Concluído' : p.started ? '. Em andamento' : ''}`
  return (
    <a href={filmPath(film.slug)} aria-label={label} className="group fade-up flex flex-col gap-3 rounded-lg p-3 transition-colors duration-200 hover:bg-white/10 focus-visible:bg-white/10">
      <div className="relative aspect-video overflow-hidden rounded-md bg-ink-800 shadow-lg shadow-black/30">
        <Poster src={film.poster} />
        {flags.length > 0 && (
          <span className="absolute left-2 top-2 flex gap-1" aria-hidden="true">
            {flags.map((f) => <span key={f} className="rounded-full bg-ink-950/85 px-2 py-0.5 text-[0.6875rem] font-semibold text-signal">{f}</span>)}
          </span>
        )}
        {p.done && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-signal text-ink-950" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        )}
        {p.started && !p.done && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50" aria-hidden="true">
            <span className="block h-full bg-signal" style={{ width: `${p.ratio * 100}%` }} />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-base font-bold leading-snug">{film.title}</h3>
        <p className="eyebrow mt-1 tabular-nums">{film.year} · {genre} · {formatDuration(film.duration)}</p>
      </div>
    </a>
  )
}
