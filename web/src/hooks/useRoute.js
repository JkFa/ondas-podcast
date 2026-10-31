import { useMemo, useSyncExternalStore } from 'react'

// Rotas por hash (funciona em GitHub Pages sem configuração de servidor):
//   #/  → biblioteca · #/livro/<slug> → obra · #/notas · #/salvos
const subscribe = (cb) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const paths = { explore: '#/', notes: '#/notas', saved: '#/salvos' }
export const bookPath = (slug) => `#/livro/${encodeURIComponent(slug)}`

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '')
  return useMemo(() => {
    const [a, b] = hash.replace(/^#\/?/, '').split('/')
    if (a === 'livro' && b) {
      let slug = b
      try { slug = decodeURIComponent(b) } catch { /* mantém cru */ }
      return { name: 'book', slug, key: `livro/${b}` }
    }
    if (a === 'notas') return { name: 'notes', key: 'notas' }
    if (a === 'salvos') return { name: 'saved', key: 'salvos' }
    return { name: 'explore', key: '' }
  }, [hash])
}

export const navigate = (path) => { location.hash = path }
