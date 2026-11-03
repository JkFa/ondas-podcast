import { describe, expect, it } from 'vitest'
import { filmProgress, filterFilms, formatBytes, inProgress, sortFilms, validateFilm, validFilms, withProgress } from './films'

const raw = (over = {}) => ({
  id: 'nosferatu_201508', slug: 'nosferatu', title: 'Nosferatu', year: 1922, director: 'F. W. Murnau', description: 'Vampiro.', duration: 5400,
  language: 'de', silent: true, genre: 'terror', tags: ['horror'], warning: null, license: 'http://creativecommons.org/publicdomain/mark/1.0/',
  licenseName: 'Domínio público', rights: 'pd', poster: 'https://archive.org/services/img/nosferatu_201508', video: { url: 'https://archive.org/download/x/x_512kb.mp4', size: 3e8 },
  hd: { url: 'https://archive.org/download/x/x.mp4', size: 6e8 }, archiveUrl: 'https://archive.org/details/x', captions: [{ lang: 'en', auto: false, src: 'films/captions/x.en.vtt' }], ...over,
})

describe('validateFilm', () => {
  it('aceita um filme completo e normaliza a licença para https', () => {
    const f = validateFilm(raw())
    expect(f.title).toBe('Nosferatu')
    expect(f.license).toBe('https://creativecommons.org/publicdomain/mark/1.0/')
    expect(f.hd.size).toBe(6e8)
    expect(f.captions).toEqual([{ lang: 'en', auto: false, src: 'films/captions/x.en.vtt' }])
  })

  it.each([
    ['sem id', { id: '' }],
    ['ano quebrado', { year: '1922' }],
    ['gênero desconhecido', { genre: 'pornô' }],
    ['vídeo em http', { video: { url: 'http://archive.org/x.mp4', size: 1 } }],
    ['vídeo javascript:', { video: { url: 'javascript:alert(1)', size: 1 } }],
    ['duração zero', { duration: 0 }],
  ])('rejeita %s', (_, over) => {
    expect(validateFilm(raw(over))).toBeNull()
  })

  it('descarta aviso e legendas fora do esperado, sem rejeitar o filme', () => {
    const f = validateFilm(raw({ warning: 'xss', poster: 'javascript:1', hd: { url: 'http://x', size: 1 }, captions: [{ lang: 'en', src: 'https://evil.com/a.vtt' }, { lang: 'english', src: 'films/captions/a.vtt' }, { lang: 'pt', src: 'films/captions/../../a.vtt' }] }))
    expect(f.warning).toBeNull()
    expect(f.poster).toBeNull()
    expect(f.hd).toBeNull()
    expect(f.captions).toEqual([])
  })

  it('validFilms ignora lixo e repete slug só uma vez', () => {
    const out = validFilms([raw(), raw({ id: 'outro' }), null, 'x', raw({ id: 'b', slug: 'b', title: 'B' })])
    expect(out.map((f) => f.id)).toEqual(['nosferatu_201508', 'b'])
    expect(validFilms(undefined)).toEqual([])
  })
})

describe('filtros e ordem', () => {
  const films = validFilms([
    raw(),
    raw({ id: 'm', slug: 'm', title: 'M — O Vampiro de Düsseldorf', year: 1931, director: 'Fritz Lang', genre: 'misterio', silent: false, captions: [], duration: 7000 }),
    raw({ id: 'g', slug: 'g', title: 'A Linha Geral', year: 1929, director: 'Sergei Eisenstein', genre: 'drama', duration: 3000 }),
  ])

  it('filtra por gênero, mudos, legendas e texto sem acento', () => {
    expect(filterFilms(films, { genre: 'drama' }).map((f) => f.id)).toEqual(['g'])
    expect(filterFilms(films, { silent: true }).map((f) => f.id)).toEqual(['nosferatu_201508', 'g'])
    expect(filterFilms(films, { captions: true }).map((f) => f.id)).toEqual(['nosferatu_201508', 'g'])
    expect(filterFilms(films, { q: 'dusseldorf' }).map((f) => f.id)).toEqual(['m'])
    expect(filterFilms(films, { q: 'lang 1931' }).map((f) => f.id)).toEqual(['m'])
    expect(filterFilms(films, { q: 'inexistente' })).toEqual([])
  })

  it('ordena por título, ano e duração', () => {
    expect(sortFilms(films).map((f) => f.id)).toEqual(['g', 'm', 'nosferatu_201508'])
    expect(sortFilms(films, 'year').map((f) => f.id)).toEqual(['nosferatu_201508', 'g', 'm'])
    expect(sortFilms(films, 'duration').map((f) => f.id)).toEqual(['g', 'nosferatu_201508', 'm'])
  })
})

describe('progresso', () => {
  const film = validateFilm(raw())
  it('sem registro: não começou', () => {
    expect(filmProgress(undefined, film)).toMatchObject({ pos: 0, started: false, done: false })
  })
  it('classifica em andamento e concluído', () => {
    expect(filmProgress({ pos: 600, dur: 5400 }, film)).toMatchObject({ started: true, done: false })
    expect(filmProgress({ pos: 5200, dur: 5400 }, film).done).toBe(true)
    expect(filmProgress({ pos: 5, dur: 5400 }, film).started).toBe(false)
  })
  it('withProgress marca perto do fim como concluído e ignora valores inválidos', () => {
    expect(withProgress({}, 'a', 5300, 5400, 7).a).toEqual({ pos: 5400, dur: 5400, at: 7 })
    expect(withProgress({}, 'a', 100, 5400, 7).a.pos).toBe(100)
    const p = {}
    expect(withProgress(p, 'a', NaN, 5400)).toBe(p)
    expect(withProgress(p, 'a', 10, 0)).toBe(p)
  })
  it('inProgress lista só os iniciados e não concluídos, o mais recente primeiro', () => {
    const b = validateFilm(raw({ id: 'b', slug: 'b', title: 'B' }))
    const c = validateFilm(raw({ id: 'c', slug: 'c', title: 'C' }))
    const progress = { nosferatu_201508: { pos: 100, dur: 5400, at: 1 }, b: { pos: 900, dur: 5400, at: 5 }, c: { pos: 5400, dur: 5400, at: 9 } }
    expect(inProgress([film, b, c], progress).map((f) => f.id)).toEqual(['b', 'nosferatu_201508'])
  })
})

describe('formatBytes', () => {
  it('usa MB e GB com vírgula', () => {
    expect(formatBytes(297_710_213)).toBe('298 MB')
    expect(formatBytes(1_420_000_000)).toBe('1,4 GB')
  })
})
