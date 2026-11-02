import { describe, expect, it } from 'vitest'
import { addListening, dayKey, EMPTY_STATS, lastDays, mergeStats, sanitizeStats, spokenDuration, streak, summarize, tickDelta } from './stats'

const at = (s) => new Date(`${s}T12:00:00`)

describe('addListening', () => {
  it('soma por dia local e define o início', () => {
    let s = addListening(EMPTY_STATS, 10, 5, at('2026-11-01'))
    s = addListening(s, 20, 10, at('2026-11-01'))
    s = addListening(s, 7, 7, at('2026-11-02'))
    expect(s.since).toBe('2026-11-01')
    expect(s.days['2026-11-01']).toEqual({ c: 30, w: 15 })
    expect(s.days['2026-11-02']).toEqual({ c: 7, w: 7 })
  })
  it('ignora valores inválidos e não muta o original', () => {
    for (const [c, w] of [[0, 1], [-1, 1], [NaN, 1], [1, 0], [Infinity, 1]]) expect(addListening(EMPTY_STATS, c, w)).toBe(EMPTY_STATS)
    const before = JSON.stringify(EMPTY_STATS)
    addListening(EMPTY_STATS, 5, 5)
    expect(JSON.stringify(EMPTY_STATS)).toBe(before)
  })
  it('poda dias muito antigos', () => {
    let s = EMPTY_STATS
    for (let i = 0; i < 810; i++) s = addListening(s, 1, 1, new Date(2024, 0, 1 + i))
    expect(Object.keys(s.days).length).toBe(800)
    expect(s.days[dayKey(new Date(2024, 0, 1))]).toBeUndefined()
  })
})

describe('tickDelta', () => {
  it('conta reprodução contínua, inclusive acelerada', () => {
    expect(tickDelta({ media: 10, wall: 0 }, 10.25, 250, 1)).toEqual({ content: 0.25, wall: 0.25 })
    const fast = tickDelta({ media: 10, wall: 0 }, 10.5, 250, 2)
    expect(fast.content).toBeCloseTo(0.5)
  })
  it('descarta saltos (arrastar a barra), voltas e pausas longas', () => {
    expect(tickDelta({ media: 10, wall: 0 }, 300, 250, 1)).toBeNull() // pulou
    expect(tickDelta({ media: 10, wall: 0 }, 5, 250, 1)).toBeNull() // voltou
    expect(tickDelta({ media: 10, wall: 0 }, 10.2, 60000, 1)).toBeNull() // ficou parado por 60 s
    expect(tickDelta(null, 10, 0)).toBeNull()
  })
})

describe('sanitize e merge', () => {
  it('descarta lixo', () => {
    const s = sanitizeStats({ since: 'ontem', days: { '2026-11-01': { c: 5, w: 5 }, 'x': { c: 1, w: 1 }, '2026-11-02': { c: -1, w: 1 }, '2026-11-03': { c: 'a' }, '2026-11-04': { c: 1e9, w: 1 } } })
    expect(Object.keys(s.days)).toEqual(['2026-11-01'])
    expect(s.since).toBe('2026-11-01')
    expect(sanitizeStats(null)).toEqual(EMPTY_STATS)
    expect(sanitizeStats({ days: 3 })).toEqual(EMPTY_STATS)
  })
  it('mesclar pega o maior de cada dia e é idempotente', () => {
    const a = { since: '2026-11-02', days: { '2026-11-02': { c: 10, w: 10 } } }
    const b = { since: '2026-11-01', days: { '2026-11-01': { c: 5, w: 5 }, '2026-11-02': { c: 30, w: 20 } } }
    const m = mergeStats(a, b)
    expect(m.days['2026-11-02']).toEqual({ c: 30, w: 20 })
    expect(m.since).toBe('2026-11-01')
    expect(mergeStats(m, b)).toEqual(m)
  })
})

describe('resumo', () => {
  const stats = { since: '2026-10-28', days: { '2026-10-30': { c: 600, w: 400 }, '2026-10-31': { c: 1200, w: 1200 }, '2026-11-01': { c: 1800, w: 1500 } } }
  it('sequência e últimos dias', () => {
    expect(streak(stats, at('2026-11-01'))).toBe(3)
    expect(streak(stats, at('2026-11-02'))).toBe(3) // hoje sem escuta ainda não quebra
    expect(streak(stats, at('2026-11-03'))).toBe(0)
    const week = lastDays(stats, 7, at('2026-11-01'))
    expect(week).toHaveLength(7)
    expect(week.at(-1)).toMatchObject({ key: '2026-11-01', c: 1800 })
    expect(week[0].key).toBe('2026-10-26')
  })
  it('totais, média e velocidade média', () => {
    const books = [
      { slug: 'a', duration: 200, parts: [{ id: 'a1', duration: 100 }, { id: 'a2', duration: 100 }] },
      { slug: 'b', duration: 100, parts: [{ id: 'b1', duration: 100 }] },
      { slug: 'c', duration: 100, parts: [{ id: 'c1', duration: 100 }] },
    ]
    const progress = { a1: { pos: 100, dur: 100 }, a2: { pos: 100, dur: 100 }, b1: { pos: 50, dur: 100 } }
    const s = summarize(stats, progress, books, at('2026-11-01'))
    expect(s).toMatchObject({ total: 3600, today: 1800, weekTotal: 3600, activeDays: 3, avgPerActiveDay: 1200, streak: 3, episodesDone: 2, booksDone: 1, booksOngoing: 1 })
    expect(s.avgSpeed).toBeCloseTo(3600 / 3100)
  })
  it('sem dados não divide por zero', () => {
    expect(summarize(EMPTY_STATS, {}, [])).toMatchObject({ total: 0, avgPerActiveDay: 0, avgSpeed: 0, streak: 0 })
  })
})

it('spokenDuration', () => {
  expect([45, 60, 3000, 3600, 4320, 18720].map(spokenDuration)).toEqual(['45 s', '1 min', '50 min', '1 h', '1 h 12 min', '5 h 12 min'])
})
