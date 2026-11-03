import { useEffect, useMemo, useRef, useState } from 'react'
import FilmCard from '../components/FilmCard'
import { announce } from '../lib/announce'
import { FILM_GENRES, filterFilms, inProgress, sortFilms } from '../lib/films'
import { t } from '../strings'

const chip = (on) =>
  `press flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${on ? 'border-signal bg-signal text-ink-950' : 'border-transparent bg-white/10 text-ink-100 hover:bg-white/20'}`

export default function Films({ catalog, progress, online, initialGenre = '' }) {
  const [genre, setGenre] = useState(FILM_GENRES.includes(initialGenre) ? initialGenre : '')
  const [silent, setSilent] = useState(false)
  const [captions, setCaptions] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('title')
  const films = catalog.films
  const filtered = useMemo(() => sortFilms(filterFilms(films, { genre, silent, captions, q }), sort), [films, genre, silent, captions, q, sort])
  const continuing = useMemo(() => inProgress(films, progress), [films, progress])
  const filtering = !!(genre || silent || captions || q.trim())
  const genres = useMemo(() => FILM_GENRES.filter((g) => films.some((f) => f.genre === g)), [films])

  // Anuncia a contagem depois que a pessoa para de digitar/filtrar (não a cada tecla).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const id = setTimeout(() => announce(t.films.resultsCount(filtered.length)), 600)
    return () => clearTimeout(id)
  }, [filtered.length])

  const clear = () => { setGenre(''); setSilent(false); setCaptions(false); setQ('') }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl sm:text-5xl">{t.films.title}</h1>
        {catalog.status === 'ready' && <p className="max-w-2xl text-ink-300">{t.films.lead(films.length)}</p>}
        <p className="max-w-2xl text-sm text-ink-400">{t.films.rightsNote} <button onClick={() => { const el = document.getElementById('direitos-filmes'); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }) }} className="min-h-6 underline underline-offset-2 hover:text-ink-200">{t.films.rightsTitle}</button>.</p>
        {!online && <p role="status" className="max-w-2xl rounded-lg border border-[color:var(--control-line)] px-4 py-3 text-sm text-ink-200">{t.films.offline}</p>}
      </header>

      {catalog.status === 'loading' && <p className="text-ink-300" role="status">{t.films.loading}</p>}
      {catalog.status === 'error' && <p role="alert" className="max-w-2xl rounded-lg border border-[color:var(--control-line)] px-4 py-3 text-ink-200">{t.films.loadError}</p>}

      {catalog.status === 'ready' && (
        <>
          <section aria-label={t.films.search} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t.films.search}
                placeholder={t.films.search}
                autoComplete="off"
                className="min-h-11 w-full max-w-md rounded-full border border-[color:var(--control-line)] bg-transparent px-5 text-[0.9375rem] placeholder:text-ink-400"
              />
              <label className="flex items-center gap-2 text-sm text-ink-300">
                {t.films.sort}
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-11 rounded-full border border-[color:var(--control-line)] bg-ink-900 px-4 text-sm text-ink-50">
                  <option value="title">{t.films.sortTitle}</option>
                  <option value="year">{t.films.sortYear}</option>
                  <option value="duration">{t.films.sortDuration}</option>
                </select>
              </label>
            </div>
            <div role="group" aria-label={t.films.genresLabel} className="flex flex-wrap gap-2">
              <button aria-pressed={genre === ''} onClick={() => setGenre('')} className={chip(genre === '')}>{t.films.allGenres}</button>
              {genres.map((g) => <button key={g} aria-pressed={genre === g} onClick={() => setGenre(genre === g ? '' : g)} className={chip(genre === g)}>{t.films.genres[g]}</button>)}
              <button aria-pressed={silent} onClick={() => setSilent((v) => !v)} className={chip(silent)}>{t.films.silentOnly}</button>
              <button aria-pressed={captions} onClick={() => setCaptions((v) => !v)} className={chip(captions)}>{t.films.captionsOnly}</button>
            </div>
          </section>

          {continuing.length > 0 && !filtering && (
            <section aria-labelledby="films-continue-h" className="flex flex-col gap-4">
              <h2 id="films-continue-h" className="eyebrow">{t.films.continueTitle}</h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-x-4 gap-y-8">
                {continuing.map((f) => <li key={f.id}><FilmCard film={f} saved={progress[f.id]} /></li>)}
              </ul>
            </section>
          )}

          <section aria-labelledby="films-all-h" className="flex flex-col gap-4">
            <h2 id="films-all-h" className="eyebrow">{filtering ? t.films.resultsCount(filtered.length) : t.films.allTitle}</h2>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-ink-300">{t.films.none}</p>
                <button onClick={clear} className="press min-h-11 rounded-full border border-[color:var(--control-line)] px-5 text-sm font-medium text-ink-200 hover:bg-white/10">{t.films.clear}</button>
              </div>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-x-4 gap-y-8">
                {filtered.map((f) => <li key={f.id}><FilmCard film={f} saved={progress[f.id]} /></li>)}
              </ul>
            )}
          </section>

          <section id="direitos-filmes" tabIndex={-1} aria-labelledby="films-rights-h" className="flex max-w-2xl flex-col gap-3 outline-none">
            <h2 id="films-rights-h" className="eyebrow">{t.films.rightsTitle}</h2>
            {t.films.rightsBody.map((p) => <p key={p} className="text-sm leading-relaxed text-ink-300">{p}</p>)}
            <a href="https://github.com/JkFa/ondas-podcast/issues/new" target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-signal underline-offset-4 hover:underline">{t.films.removeLink}</a>
          </section>
        </>
      )}
    </div>
  )
}
