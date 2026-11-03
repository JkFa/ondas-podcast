import { ArrowLeft, Share2 } from 'lucide-react'
import FilmPlayer from '../components/FilmPlayer'
import { paths } from '../hooks/useRoute'
import { languageName } from '../lib/films'
import { formatDuration } from '../lib/format'
import { t } from '../strings'

function Detail({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-[0.9375rem] text-ink-100">{children}</dd>
    </div>
  )
}

export default function Film({ film, status, progress, onProgress, pauseAudio, captionsOn, onShare }) {
  if (!film) {
    return (
      <div className="flex flex-col gap-4 pt-8">
        <h1 className="font-display text-3xl">{status === 'ready' || status === 'error' ? t.films.notFound : t.films.loading}</h1>
        {(status === 'ready' || status === 'error') && <a href={paths.films} className="inline-flex min-h-11 w-fit items-center text-signal underline-offset-4 hover:underline">{t.films.back}</a>}
      </div>
    )
  }
  const lang = languageName(film.language)
  const paragraphs = film.description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  const captionNames = film.captions.map((c) => `${t.films.captionsLangs[c.lang] || c.lang}${c.auto ? ` (${t.films.captionsAuto})` : ''}`)
  return (
    <article className="flex flex-col gap-8">
      <a href={paths.films} className="press -ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-300 hover:text-white">
        <ArrowLeft size={16} aria-hidden="true" /> {t.films.back}
      </a>

      <header className="flex flex-col gap-3">
        <p className="eyebrow">{film.year}{film.director ? ` · ${film.director}` : ''}</p>
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{film.title}</h1>
        <p className="text-sm tabular-nums text-ink-300">
          {formatDuration(film.duration)} · {t.films.genres[film.genre]}{film.silent ? ` · ${t.films.silent}` : ''} · {lang ? t.films.language(lang) : t.films.languageUnknown}
        </p>
        <div>
          <button onClick={() => onShare(film)} aria-haspopup="dialog" className="press flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-[0.9375rem] font-medium text-ink-200 hover:bg-white/10">
            <Share2 size={18} aria-hidden="true" /> {t.share.button}
          </button>
        </div>
      </header>

      <FilmPlayer key={film.id} film={film} saved={progress[film.id]} onProgress={onProgress} pauseAudio={pauseAudio} captionsOn={captionsOn} />

      <section aria-labelledby="film-captions-h" className="flex max-w-2xl flex-col gap-2 text-sm text-ink-300">
        <h2 id="film-captions-h" className="sr-only">{t.films.captions}</h2>
        <p>{captionNames.length ? t.films.captionsAvailable(captionNames.join(', ')) : t.films.noCaptionsNote}</p>
        {film.silent && <p>{t.films.silentNote}</p>}
      </section>

      {paragraphs.length > 0 && (
        <section aria-labelledby="film-about-h" className="flex flex-col gap-3">
          <h2 id="film-about-h" className="eyebrow">{t.films.about}</h2>
          <div className="flex max-w-2xl flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-300">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>
      )}

      <section aria-labelledby="film-details-h" className="flex flex-col gap-3">
        <h2 id="film-details-h" className="eyebrow">{t.films.details}</h2>
        <dl className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label={t.films.year}>{film.year}</Detail>
          <Detail label={t.films.duration}>{formatDuration(film.duration)}</Detail>
          <Detail label={t.films.genre}><a href={`${paths.films}?g=${film.genre}`} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white">{t.films.genres[film.genre]}</a></Detail>
          <Detail label={t.films.license}>
            {film.license ? <a href={film.license} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white">{film.licenseName}</a> : film.licenseName}
          </Detail>
          {film.archiveUrl && (
            <Detail label={t.films.source}><a href={film.archiveUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white">{t.films.sourceLink}</a></Detail>
          )}
        </dl>
        <p className="max-w-2xl text-xs text-ink-400">{t.films.rightsBody[0]}</p>
      </section>
    </article>
  )
}
