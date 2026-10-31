import { useCallback, useEffect, useMemo, useState } from 'react'
import AmbientBackground from './components/AmbientBackground'
import ImportModal from './components/ImportModal'
import MiniPlayer from './components/MiniPlayer'
import Nav from './components/Nav'
import PlayerSheet from './components/PlayerSheet'
import { useAccent } from './hooks/useAccent'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMediaSession } from './hooks/useMediaSession'
import { usePersistentState } from './hooks/usePersistentState'
import { mergeCatalog, parseCatalogJson, serializeCatalog, validEpisodes } from './lib/catalog'
import Explore from './views/Explore'
import Notes from './views/Notes'
import Saved from './views/Saved'

export default function App() {
  const [base, setBase] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [imported, setImported] = usePersistentState('imported', [])
  const [view, setView] = useState('explore')
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
  const accent = useAccent(engine.current)

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

  const View = { explore: Explore, notes: Notes, saved: Saved }[view]
  const hasPlayer = !!engine.current

  return (
    <div className="h-dvh text-zinc-50">
      <AmbientBackground color={accent} />
      <audio ref={engine.audioRef} preload="metadata" />
      <Nav view={view} onView={setView} onImport={() => setImportOpen(true)} />

      <main className={`h-full overflow-y-auto overflow-x-hidden px-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pl-28 lg:pr-8 ${hasPlayer ? 'pb-56' : 'pb-36'} lg:pb-32`}>
        <div className="mx-auto max-w-3xl">
          <View episodes={episodes} engine={engine} loading={loading} error={error} />
        </div>
      </main>

      <MiniPlayer engine={engine} onOpen={() => setSheetOpen(true)} />
      <PlayerSheet engine={engine} accent={accent} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSave={addImported} onExport={exportCatalog} onImportFile={importFile} />
    </div>
  )
}
