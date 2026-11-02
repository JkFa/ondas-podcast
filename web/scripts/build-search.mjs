// Gera dist/search-index.json (MiniSearch) a partir de public/catalog.json e das transcrições em public/transcripts/.
// Roda depois do `vite build`; não usa a rede. Uso: node scripts/build-search.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { buildBooks } from '../src/lib/books.js'
import { buildDocuments, buildIndex, serializeIndex } from '../src/lib/search.js'
import { parseVtt } from '../src/lib/vtt.js'

const root = new URL('../', import.meta.url)
const { episodes } = JSON.parse(await readFile(new URL('public/catalog.json', root), 'utf8'))
const books = buildBooks(episodes)

// Transcrição de cada episódio: arquivo .vtt local (transcripts.vtt relativo ao site) ou segmentos antigos dentro do catálogo.
const segments = new Map()
for (const ep of episodes) {
  const rel = ep.transcripts?.vtt
  if (rel && !/^https?:/i.test(rel)) {
    try { segments.set(ep.id, parseVtt(await readFile(new URL(`public/${rel.replace(/^\//, '')}`, root), 'utf8'))) } catch { console.warn(`[busca] não consegui ler ${rel}`) }
  } else if (ep.transcript?.length) segments.set(ep.id, ep.transcript)
}

const docs = buildDocuments(books, (ep) => segments.get(ep.id) || [])
const json = JSON.stringify(serializeIndex(buildIndex(docs)))
await writeFile(new URL('dist/search-index.json', root), json)
const kinds = docs.reduce((m, d) => ({ ...m, [d.kind]: (m[d.kind] || 0) + 1 }), {})
console.log(`[busca] dist/search-index.json: ${(json.length / 1024).toFixed(0)} kB · ${docs.length} documentos (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}) · ${segments.size} transcrições`)
