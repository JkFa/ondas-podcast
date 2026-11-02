import { describe, expect, it } from 'vitest'
import { buildDocuments, buildIndex, fold, loadIndex, search, serializeIndex, snippetParts } from './search'

const ep = (id, title, extra = {}) => ({ id, title, show: 'LibriVox · Machado de Assis', description: '', duration: 100, ...extra })
const books = [
  { slug: 'o-alienista', title: 'O Alienista', author: 'Machado de Assis', description: 'O doutor Bacamarte funda a Casa Verde para loucos em Itaguaí.', parts: [ep('al-1', 'O Alienista — Capítulo 1', { tags: ['romance'], chapters: [{ start: 20, title: 'A chegada a Itaguaí' }] })] },
  { slug: 'iracema', title: 'Iracema', author: 'José de Alencar', description: 'Lenda do Ceará.', parts: [ep('ir-1', 'Iracema')] },
  { slug: 'sermoes', title: 'Sermões', author: 'Padre Antônio Vieira', description: 'Sermão do bom ladrão.', parts: [ep('se-1', 'Sermão da Sexagésima')] },
]
const transcripts = {
  'al-1': [{ start: 0, end: 4, text: 'Era uma vez um médico muito famoso.' }, { start: 4.2, end: 9, text: 'Ele construiu um hospício em Itaguaí e prendeu os loucos.' }, { start: 30, end: 36, text: 'O barbeiro Porfírio liderou a revolta.' }],
}
const index = buildIndex(buildDocuments(books, (e) => transcripts[e.id] || []))

describe('documentos', () => {
  it('uma obra por livro, capítulos e trechos com o tempo certo', () => {
    const docs = buildDocuments(books, (e) => transcripts[e.id] || [])
    expect(docs.filter((d) => d.kind === 'work')).toHaveLength(3)
    expect(docs.filter((d) => d.kind === 'chapter')).toEqual([expect.objectContaining({ ep: 'al-1', start: 20, text: 'A chegada a Itaguaí' })])
    const passages = docs.filter((d) => d.kind === 'passage')
    expect(passages.map((p) => p.start)).toEqual([0, 30]) // os dois primeiros segmentos ficam no mesmo parágrafo
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length)
  })
})

describe('busca', () => {
  it('ignora acento e maiúsculas, em obra, autor e descrição', () => {
    expect(search(index, 'ALIENISTA').works[0].slug).toBe('o-alienista')
    expect(search(index, 'jose alencar').works.map((w) => w.slug)).toEqual(['iracema'])
    expect(search(index, 'bacamarte').works[0].slug).toBe('o-alienista')
    expect(search(index, 'sermao').works[0].slug).toBe('sermoes') // "Sermões"/"Sermão" por prefixo
  })
  it('acha o trecho falado e leva ao segundo certo', () => {
    const r = search(index, 'barbeiro revolta')
    expect(r.passages[0]).toMatchObject({ kind: 'passage', ep: 'al-1', start: 30 })
    expect(r.works.map((w) => w.slug)).toContain('o-alienista') // a obra entra por causa do trecho
  })
  it('acha capítulo pelo título', () => {
    expect(search(index, 'chegada itaguai').passages.find((p) => p.kind === 'chapter')).toMatchObject({ ep: 'al-1', start: 20 })
  })
  it('tolera erro de digitação e prefixo; palavras comuns não atrapalham', () => {
    expect(search(index, 'alienitsa').works[0]?.slug).toBe('o-alienista')
    expect(search(index, 'alien').works[0].slug).toBe('o-alienista')
    expect(search(index, 'o médico de itaguaí').passages.length).toBeGreaterThan(0)
  })
  it('consulta vazia ou só pontuação não devolve nada; sem resultado devolve listas vazias', () => {
    expect(search(index, '   ')).toEqual({ works: [], passages: [] })
    expect(search(index, '?!')).toEqual({ works: [], passages: [] })
    expect(search(index, 'xyzabc')).toEqual({ works: [], passages: [] })
  })
  it('o índice serializado volta igual (é o que o navegador baixa)', () => {
    const copy = loadIndex(JSON.parse(JSON.stringify(serializeIndex(index))))
    expect(search(copy, 'barbeiro').passages[0]).toMatchObject({ ep: 'al-1', start: 30 })
    expect(search(copy, 'Machado').works[0].slug).toBe('o-alienista')
  })
})

describe('snippetParts', () => {
  const text = 'Ele construiu um hospício em Itaguaí e prendeu os loucos da vila inteira durante muitos meses seguidos, sem direito a defesa.'
  it('marca as palavras que casaram, sem acento', () => {
    const parts = snippetParts(text, ['itaguai', 'loucos'])
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Itaguaí', 'loucos'])
    expect(parts.map((p) => p.text).join('')).toBe(text)
  })
  it('recorta texto longo em torno do primeiro acerto, com reticências', () => {
    const long = `${'palavra '.repeat(60)}ALVO ${'resto '.repeat(60)}`
    const parts = snippetParts(long, ['alvo'], 120)
    const joined = parts.map((p) => p.text).join('')
    expect(joined.length).toBeLessThan(160)
    expect(joined.startsWith('… ') && joined.endsWith(' …')).toBe(true)
    expect(parts.find((p) => p.hit).text).toBe('ALVO')
  })
  it('fold mantém o comprimento', () => expect(fold('Itaguaí').length).toBe('Itaguaí'.length))
})
