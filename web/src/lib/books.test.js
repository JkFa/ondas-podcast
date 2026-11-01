import { describe, expect, it } from 'vitest'
import { bookStats, buildBooks, lastListened, partLabel, resumeTarget } from './books'

const ep = (id, part, extra = {}) => ({ id, title: `Obra — Parte ${part}`, show: 'LibriVox · Autora', series: 'Obra', part, duration: 100, audioUrl: `https://x/${id}.mp3`, publishedAt: '2020-01-01T00:00:00Z', ...extra })
const episodes = [ep('a2', 2), ep('a1', 1), ep('a3', 3), { id: 'solo', title: 'Avulso', show: 'Fulano', duration: 50, audioUrl: 'https://x/solo.mp3' }]
const books = buildBooks(episodes)
const at = (n) => Date.now() + n

describe('buildBooks', () => {
  it('agrupa por obra, ordena as partes e cria obra de uma parte para avulsos', () => {
    expect(books).toHaveLength(2)
    expect(books[0].parts.map((p) => p.id)).toEqual(['a1', 'a2', 'a3'])
    expect(books[0]).toMatchObject({ title: 'Obra', author: 'Autora', duration: 300, slug: 'obra' })
    expect(books[1]).toMatchObject({ title: 'Avulso', isSeries: false, slug: 'avulso' })
  })
  it('tira o prefixo da obra do rótulo da parte', () => {
    expect(partLabel(books[0], books[0].parts[1])).toBe('Parte 2')
  })
})

describe('progresso', () => {
  it('começa no início sem histórico', () => {
    expect(resumeTarget(books[0], {})).toMatchObject({ state: 'start', part: { id: 'a1' } })
  })
  it('retoma a parte em andamento', () => {
    const progress = { a1: { pos: 100, dur: 100, at: at(1) }, a2: { pos: 40, dur: 100, at: at(2) } }
    expect(resumeTarget(books[0], progress)).toMatchObject({ state: 'resume', resumeAt: 40, part: { id: 'a2' } })
  })
  it('vai para a próxima parte quando a última ouvida acabou', () => {
    const progress = { a1: { pos: 100, dur: 100, at: at(1) } }
    expect(resumeTarget(books[0], progress)).toMatchObject({ state: 'next', part: { id: 'a2' } })
  })
  it('oferece "ouvir de novo" quando tudo foi concluído', () => {
    const progress = Object.fromEntries(['a1', 'a2', 'a3'].map((id, i) => [id, { pos: 100, dur: 100, at: at(i) }]))
    expect(resumeTarget(books[0], progress).state).toBe('again')
    expect(bookStats(books[0], progress)).toMatchObject({ done: 3, finished: true, ratio: 1 })
  })
  it('acha a obra ouvida por último', () => {
    const progress = { a1: { pos: 30, dur: 100, at: at(1) }, solo: { pos: 20, dur: 50, at: at(9) } }
    expect(lastListened(books, progress).slug).toBe('avulso')
    expect(lastListened(books, {})).toBeUndefined()
  })
})
