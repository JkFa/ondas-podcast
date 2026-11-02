// Autores: agrupam as obras pelo nome (sem "LibriVox · "), ignorando maiúsculas, acentos e espaços repetidos.
import { slugify } from './books.js'

const key = (s) => slugify(String(s).replace(/\s+/g, ' '))

/** [{ slug, name, books, duration }] em ordem alfabética (pt-BR). Obras sem autor conhecido ficam fora. */
export function buildAuthors(books) {
  const map = new Map()
  for (const b of books) {
    const name = String(b.author || '').replace(/\s+/g, ' ').trim()
    const k = key(name)
    if (!k) continue
    if (!map.has(k)) map.set(k, { slug: k, name, books: [], duration: 0 })
    const a = map.get(k)
    a.books.push(b)
    a.duration += b.duration || 0
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export const authorSlug = (name) => key(name)
export const authorBySlug = (authors, slug) => authors.find((a) => a.slug === slug)
