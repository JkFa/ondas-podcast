// Gêneros por palavras-chave. Separado de genres.js (que importa o JSON pelo Vite) para os scripts de build, que rodam no Node puro,
// poderem usar a mesma lógica com o JSON lido do disco.

/** minúsculas, sem acento, só letras/números/espaços. */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function createGenres(config) {
  const GENRES = [...config.genres, config.other]
  const OTHER = config.other.id
  const compiled = config.genres.map((g) => ({
    id: g.id,
    // cada palavra-chave casa no começo de uma palavra do texto (romance → romances, romântico não; "short stor" → "short stories")
    res: g.keywords.map((k) => new RegExp(`(^| )${norm(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)),
  }))
  const genreById = (id) => GENRES.find((g) => g.id === id)

  /** Ids de gênero de uma obra (`book` de buildBooks: title, parts[].tags). Sempre devolve ao menos um (`outros`). */
  function genresOfBook(book) {
    const text = norm([book.title, ...book.parts.flatMap((p) => p.tags || [])].join(' | '))
    const ids = compiled.filter((g) => g.res.some((re) => re.test(text))).map((g) => g.id)
    return ids.length ? ids : [OTHER]
  }

  /** [{...gênero, books}] só com os gêneros que têm obra, na ordem do arquivo de configuração. */
  function groupByGenre(books) {
    const map = new Map(GENRES.map((g) => [g.id, []]))
    for (const b of books) for (const id of genresOfBook(b)) map.get(id).push(b)
    return GENRES.filter((g) => map.get(g.id).length).map((g) => ({ ...g, books: map.get(g.id) }))
  }

  return { GENRES, OTHER, genreById, genresOfBook, groupByGenre }
}
