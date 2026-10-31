// Agrupa episódios em "livros" (obras com várias partes) para a biblioteca.
// Episódio sem `series` vira um livro de uma parte só.
import { progressInfo } from '../hooks/useAudioEngine'

const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export const authorOf = (ep) => ep.show.replace(/^LibriVox\s*·\s*/i, '')

/** Rótulo curto de uma parte: tira o prefixo "<Obra> — " do título. */
export function partLabel(book, ep) {
  const prefix = `${book.title} — `
  return ep.title.startsWith(prefix) ? ep.title.slice(prefix.length) : ep.title
}

/** Mantém a ordem de aparição do catálogo; partes ordenadas por `part`. */
export function buildBooks(episodes) {
  const groups = new Map()
  for (const ep of episodes) {
    const key = ep.series ? `s:${ep.series}` : `e:${ep.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ep)
  }
  const used = new Set()
  return [...groups.values()].map((parts) => {
    if (parts[0].series) parts = [...parts].sort((a, b) => (a.part || 0) - (b.part || 0))
    const first = parts[0]
    const title = first.series ?? first.title
    let slug = slugify(title) || slugify(first.id) || 'obra'
    for (let n = 2; used.has(slug); n++) slug = `${slugify(title)}-${n}`
    used.add(slug)
    return {
      slug,
      title,
      author: authorOf(first),
      cover: first.cover,
      accentColor: first.accentColor,
      description: first.description || '',
      license: first.license,
      publishedAt: first.publishedAt,
      isSeries: !!first.series,
      parts,
      duration: parts.reduce((t, p) => t + (p.duration || 0), 0),
    }
  })
}

/** {done, started, finished, ratio, lastAt}: andamento do livro inteiro. */
export function bookStats(book, progress) {
  let done = 0
  let listened = 0
  let lastAt = 0
  let started = false
  for (const p of book.parts) {
    const info = progressInfo(progress, p)
    if (info.done) done += 1
    if (info.done || info.resumeAt > 0) started = true
    listened += info.ratio * (p.duration || 0)
    lastAt = Math.max(lastAt, progress[p.id]?.at || 0)
  }
  return {
    done,
    started,
    finished: done === book.parts.length,
    ratio: book.duration ? Math.min(listened / book.duration, 1) : 0,
    lastAt,
  }
}

/**
 * Para onde o botão principal leva: a parte em andamento, a próxima ainda não
 * concluída depois da última ouvida, ou o começo.
 * state: 'start' | 'resume' | 'next' | 'again'
 */
export function resumeTarget(book, progress) {
  const touched = book.parts.filter((p) => progress[p.id]?.at)
  if (!touched.length) return { part: book.parts[0], state: 'start', resumeAt: 0 }
  const last = touched.reduce((a, b) => (progress[b.id].at > progress[a.id].at ? b : a))
  const info = progressInfo(progress, last)
  if (!info.done) return { part: last, state: info.resumeAt > 0 ? 'resume' : 'start', resumeAt: info.resumeAt }
  const i = book.parts.indexOf(last)
  const pending = (p) => !progressInfo(progress, p).done
  const next = book.parts.slice(i + 1).find(pending) ?? book.parts.slice(0, i).find(pending)
  return next ? { part: next, state: 'next', resumeAt: 0 } : { part: book.parts[0], state: 'again', resumeAt: 0 }
}
