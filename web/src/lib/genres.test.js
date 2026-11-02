import { describe, expect, it } from 'vitest'
import { GENRES, genresOfBook, groupByGenre, norm } from './genres'

const book = (title, tags = []) => ({ slug: title, title, parts: [{ tags }] })

describe('gêneros', () => {
  it('norm tira acento, caixa e pontuação', () => expect(norm('Crônicas — Á, Ç!')).toBe('cronicas a c'))
  it('casa por palavra (prefixo), pelas tags e pelo título', () => {
    expect(genresOfBook(book('Dom X', ['romance', 'realismo']))).toEqual(['romance'])
    expect(genresOfBook(book('Sonetos de Amor'))).toEqual(['poesia']) // título
    expect(genresOfBook(book('X', ['Short Stories', 'Fábulas']))).toEqual(['contos-e-fabulas'])
    expect(genresOfBook(book('Auto', ['teatro', 'Portuguese']))).toEqual(['teatro'])
  })
  it('uma obra pode ter mais de um gênero e nunca fica sem nenhum', () => {
    expect(genresOfBook(book('Pérolas', ['contos de fadas', 'mistério']))).toEqual(['contos-e-fabulas', 'misterio-e-aventura'])
    expect(genresOfBook(book('Sem pistas', ['xyz']))).toEqual(['outros'])
  })
  it('não casa no meio da palavra', () => {
    expect(genresOfBook(book('Romântico demais'))).toEqual(['outros']) // "romance" não é prefixo de "romantico"
    expect(genresOfBook(book('Dramaturgia'))).toEqual(['teatro']) // "drama" é prefixo de "dramaturgia"
  })
  it('groupByGenre só devolve gêneros com obras, na ordem da configuração', () => {
    const g = groupByGenre([book('A', ['poesia']), book('B', ['romance']), book('C', ['romance']), book('D', [])])
    expect(g.map((x) => [x.id, x.books.length])).toEqual([['romance', 2], ['poesia', 1], ['outros', 1]])
    expect(GENRES.at(-1).id).toBe('outros')
  })
})
