// Filmes (public/films.json): validação, filtros e progresso. O catálogo é curado por pipeline/films.py;
// aqui tudo é tratado como dado externo, porque o arquivo também é lido do cache do navegador.
import { slugify } from './books'

export const FILM_GENRES = ['faroeste', 'misterio', 'comedia', 'drama', 'aventura', 'guerra', 'terror', 'musical', 'animacao', 'documentario']
export const WARNINGS = ['period', 'violence', 'war', 'graphic']
const DONE = 0.95

const isHttps = (u) => typeof u === 'string' && /^https:\/\//.test(u)
const num = (v) => typeof v === 'number' && Number.isFinite(v)
const media = (m) => m && isHttps(m.url) && num(m.size) && m.size >= 0

/** Filme válido ou null. Só `https:`, só gêneros e avisos conhecidos; legendas só no próprio site (mesma origem, exigência do <track>). */
export function validateFilm(f) {
  if (!f || typeof f !== 'object') return null
  if (typeof f.id !== 'string' || !f.id || typeof f.title !== 'string' || !f.title.trim()) return null
  if (!Number.isInteger(f.year) || !media(f.video) || !num(f.duration) || f.duration <= 0) return null
  if (!FILM_GENRES.includes(f.genre)) return null
  const captions = (Array.isArray(f.captions) ? f.captions : [])
    .filter((c) => c && typeof c.lang === 'string' && /^[a-z]{2}$/.test(c.lang) && typeof c.src === 'string' && /^films\/captions\/[\w.-]+\.vtt$/.test(c.src))
    .map((c) => ({ lang: c.lang, auto: !!c.auto, src: c.src }))
  return {
    id: f.id,
    slug: typeof f.slug === 'string' && f.slug ? f.slug : slugify(f.title),
    title: f.title.trim(),
    year: f.year,
    director: typeof f.director === 'string' && f.director ? f.director : null,
    description: typeof f.description === 'string' ? f.description : '',
    duration: f.duration,
    language: typeof f.language === 'string' && /^[a-z]{2}$/.test(f.language) ? f.language : null,
    silent: !!f.silent,
    genre: f.genre,
    tags: Array.isArray(f.tags) ? f.tags.filter((x) => typeof x === 'string').slice(0, 8) : [],
    warning: WARNINGS.includes(f.warning) ? f.warning : null,
    license: isHttps(f.license) || (typeof f.license === 'string' && f.license.startsWith('http://creativecommons.org/')) ? f.license.replace(/^http:/, 'https:') : null,
    licenseName: typeof f.licenseName === 'string' ? f.licenseName : 'Licença livre',
    rights: f.rights === 'cc' ? 'cc' : 'pd',
    poster: isHttps(f.poster) ? f.poster : null,
    video: { url: f.video.url, size: f.video.size },
    hd: media(f.hd) ? { url: f.hd.url, size: f.hd.size } : null,
    archiveUrl: isHttps(f.archiveUrl) ? f.archiveUrl : null,
    captions,
  }
}

export function validFilms(list) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const f = validateFilm(raw)
    if (f && !seen.has(f.slug)) {
      seen.add(f.slug)
      out.push(f)
    }
  }
  return out
}

export const filmBySlug = (films, slug) => films.find((f) => f.slug === slug)

const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Filtros da lista: gênero, só mudos, só com legenda, texto (título, direção, ano). */
export function filterFilms(films, { genre = '', silent = false, captions = false, q = '' } = {}) {
  const terms = fold(q).split(/\s+/).filter(Boolean)
  return films.filter((f) => {
    if (genre && f.genre !== genre) return false
    if (silent && !f.silent) return false
    if (captions && f.captions.length === 0) return false
    if (!terms.length) return true
    const hay = fold(`${f.title} ${f.director || ''} ${f.year}`)
    return terms.every((w) => hay.includes(w))
  })
}

export function sortFilms(films, by = 'title') {
  const out = [...films]
  if (by === 'year') out.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title))
  else if (by === 'duration') out.sort((a, b) => a.duration - b.duration || a.title.localeCompare(b.title))
  else out.sort((a, b) => a.title.localeCompare(b.title, 'pt'))
  return out
}

/** Estado do progresso salvo: { pos, ratio, started, done }. `saved` = { pos, dur, at } ou undefined. */
export function filmProgress(saved, film) {
  const dur = saved?.dur > 0 ? saved.dur : film.duration
  const pos = saved ? Math.min(Math.max(0, saved.pos), dur) : 0
  const ratio = dur > 0 ? pos / dur : 0
  return { pos, ratio, started: pos >= 10, done: ratio >= DONE }
}

/** Filmes em andamento (iniciados e não concluídos), o assistido mais recentemente primeiro. */
export function inProgress(films, progress) {
  return films
    .map((f) => ({ f, p: filmProgress(progress[f.id], f), at: progress[f.id]?.at || 0 }))
    .filter(({ p }) => p.started && !p.done)
    .sort((a, b) => b.at - a.at)
    .map(({ f }) => f)
}

export function formatBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',')} GB`
  return `${Math.max(1, Math.round(n / 1e6))} MB`
}

export const LANG_NAMES = { en: 'inglês', pt: 'português', de: 'alemão', ru: 'russo', ja: 'japonês', zh: 'chinês', da: 'dinamarquês', fr: 'francês', es: 'espanhol', it: 'italiano' }
export const languageName = (code) => LANG_NAMES[code] || null

/** Atualiza o progresso salvo (objeto imutável). Posições muito perto do fim contam como concluído (pos = dur). */
export function withProgress(progress, id, pos, dur, now = Date.now()) {
  if (!num(pos) || !num(dur) || dur <= 0 || pos < 0) return progress
  const done = pos / dur >= DONE
  return { ...progress, [id]: { pos: done ? dur : Math.min(pos, dur), dur, at: now } }
}
