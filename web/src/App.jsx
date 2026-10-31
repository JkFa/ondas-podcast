import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AmbientBackground from './components/AmbientBackground'
import ImportModal from './components/ImportModal'
import MiniPlayer from './components/MiniPlayer'
import Nav from './components/Nav'
import PlayerSheet from './components/PlayerSheet'
import { useAccent } from './hooks/useAccent'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMediaSession } from './hooks/useMediaSession'
import { usePersistentState } from './hooks/usePersistentState'
import { navigate, paths, useRoute } from './hooks/useRoute'
import { buildBooks } from './lib/books'
import { mergeCatalog, parseCatalogJson, serializeCatalog, validEpisodes } from './lib/catalog'
import Book from './views/Book'
import Explore from './views/Explore'
import Home from './views/Home'
import Notes from './views/Notes'
import Saved from './views/Saved'

export default function App() {
  const [base, setBase] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [imported, setImported] = usePersistentState('imported', [])
  const route = useRoute()
  const mainRef = useRef(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${import.meta.env.BASE_URL}catalog.json`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data) => setBase(validEpisodes(data.episodes, 'catalog.json')))
      .catch((e) => e.name !== 'AbortError' && setError(true))
      .finally(() => !ctrl.signal.aborted && setLoading(false))
    return () => ctrl.abort()
  }, [])

  const episodes = useMemo(() => mergeCatalog(base, validEpisodes(imported, 'importados')), [base, imported])
  const engine = useAudioEngine(episodes)
  useMediaSession(engine)
  const books = useMemo(() => buildBooks(episodes), [episodes])
  const book = route.name === 'book' ? books.find((b) => b.slug === route.slug) : undefined
  const playerAccent = useAccent(engine.current)
  const pageAccent = useAccent(book?.parts[0])
  const ambient = book ? pageAccent : playerAccent

  // Cada rota lembra a própria posição de rolagem (voltar da obra reabre a biblioteca onde estava).
  const scrolls = useRef(new Map())
  useLayoutEffect(() => {
    const el = mainRef.current
    const saved = scrolls.current
    el.scrollTop = saved.get(route.key) ?? 0
    return () => saved.set(route.key, el.scrollTop)
  }, [route.key])

  const addImported = useCallback((list) => setImported((prev) => mergeCatalog(prev, list)), [setImported])

  const exportCatalog = () => {
    const url = URL.createObjectURL(new Blob([serializeCatalog(episodes)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'catalog.json' })
    a.click()
    URL.revokeObjectURL(url)
  }
  const importFile = async (file) => {
    try {
      const eps = parseCatalogJson(await file.text(), file.name)
      if (eps.length) addImported(eps)
      return eps.length
    } catch {
      return 0
    }
  }

  const view = route.name === 'book' ? 'explore' : route.name
  const wide = ['home', 'explore', 'book'].includes(route.name)
  const hasPlayer = !!engine.current

  return (
    <div className="h-dvh text-ink-50">
      <AmbientBackground color={ambient} />
      <audio ref={engine.audioRef} preload="metadata" />
      <Nav view={view} onView={(id) => navigate(paths[id])} onImport={() => setImportOpen(true)} />

      <main ref={mainRef} className={`h-full overflow-y-auto overflow-x-hidden px-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pl-28 lg:pr-8 ${hasPlayer ? 'pb-56' : 'pb-36'} lg:pb-32`}>
        <div className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
          {route.name === 'home' && <Home books={books} episodes={episodes} engine={engine} loading={loading} />}
          {route.name === 'explore' && <Explore books={books} engine={engine} loading={loading} error={error} />}
          {route.name === 'book' && <Book book={book} engine={engine} loading={loading} />}
          {route.name === 'notes' && <Notes episodes={episodes} engine={engine} />}
          {route.name === 'saved' && <Saved episodes={episodes} engine={engine} />}
        </div>
      </main>

      <MiniPlayer engine={engine} onOpen={() => setSheetOpen(true)} />
      <PlayerSheet engine={engine} accent={playerAccent} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSave={addImported} onExport={exportCatalog} onImportFile={importFile} />
    </div>
  )
}
