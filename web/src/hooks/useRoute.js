import { useMemo, useSyncExternalStore } from 'react'

// Rotas por hash (funciona em GitHub Pages sem configuração de servidor):
//   #/ → página principal · #/biblioteca · #/livro/<slug> → obra · #/notas · #/salvos
const subscribe = (cb) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const paths = { home: '#/', explore: '#/biblioteca', notes: '#/notas', saved: '#/salvos', downloads: '#/downloads', subscribe: '#/assinar', publish: '#/publicar', stats: '#/estatisticas', backup: '#/backup' }
export const bookPath = (slug) => `#/livro/${encodeURIComponent(slug)}`

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '')
  return useMemo(() => {
    const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?')
    const [a, b] = path.split('/')
    const query = Object.fromEntries(new URLSearchParams(qs))
    if (a === 'livro' && b) {
      let slug = b
      try { slug = decodeURIComponent(b) } catch { /* mantém cru */ }
      return { name: 'book', slug, key: `livro/${b}`, query }
    }
    if (a === 'biblioteca') return { name: 'explore', key: 'biblioteca' }
    if (a === 'notas') return { name: 'notes', key: 'notas' }
    if (a === 'estatisticas') return { name: 'stats', key: 'estatisticas' }
    if (a === 'backup') return { name: 'backup', key: 'backup', query }
    if (a === 'publicar') return { name: 'publish', key: 'publicar' }
    if (a === 'assinar') return { name: 'subscribe', key: 'assinar' }
    if (a === 'downloads') return { name: 'downloads', key: 'downloads' }
    if (a === 'salvos') return { name: 'saved', key: 'salvos' }
    return { name: 'home', key: '' }
  }, [hash])
}

export const navigate = (path) => { location.hash = path }
