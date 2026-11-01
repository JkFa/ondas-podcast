import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime, parseChapters, parseTimestamp } from './format'

describe('formatTime', () => {
  it('formata minutos e horas', () => {
    expect(formatTime(75)).toBe('1:15')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(-3)).toBe('0:00')
  })
})
describe('formatDuration', () => {
  it('usa min e h', () => {
    expect(formatDuration(45)).toBe('1 min')
    expect(formatDuration(3000)).toBe('50 min')
    expect(formatDuration(18720)).toBe('5 h 12 min')
    expect(formatDuration(7200)).toBe('2 h')
  })
})
describe('capítulos', () => {
  it('lê "mm:ss Título" e ordena', () => {
    expect(parseChapters('01:30 Fim\n00:00 Abertura')).toEqual([{ start: 0, title: 'Abertura' }, { start: 90, title: 'Fim' }])
    expect(parseTimestamp('1:02:03')).toBe(3723)
    expect(parseTimestamp('x')).toBeNull()
  })
})
