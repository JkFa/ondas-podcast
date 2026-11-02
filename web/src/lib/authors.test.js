import { describe, expect, it } from 'vitest'
import { authorBySlug, authorSlug, buildAuthors } from './authors'

const book = (title, author, duration = 100) => ({ slug: title, title, author, duration, parts: [] })

describe('buildAuthors', () => {
  it('agrupa por nome ignorando acento, caixa e espaços; soma a duração', () => {
    const a = buildAuthors([book('A', 'Machado de Assis', 100), book('B', 'machado  de  assis', 50), book('C', 'José de Alencar', 10), book('D', '', 5)])
    expect(a.map((x) => x.name)).toEqual(['José de Alencar', 'Machado de Assis'])
    expect(a[1]).toMatchObject({ slug: 'machado-de-assis', duration: 150 })
    expect(a[1].books.map((b) => b.title)).toEqual(['A', 'B'])
  })
  it('ordena em pt-BR (Á depois de A, antes de B)', () => {
    expect(buildAuthors([book('1', 'Bocage'), book('2', 'Álvares de Azevedo'), book('3', 'Alencar')]).map((x) => x.name)).toEqual(['Alencar', 'Álvares de Azevedo', 'Bocage'])
  })
  it('slug estável e busca por slug', () => {
    const list = buildAuthors([book('x', 'Eça de Queirós')])
    expect(authorSlug('Eça de Queirós')).toBe('eca-de-queiros')
    expect(authorBySlug(list, 'eca-de-queiros').name).toBe('Eça de Queirós')
    expect(authorBySlug(list, 'nao-existe')).toBeUndefined()
  })
})
