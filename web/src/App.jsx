import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import A11yPanel from './components/A11yPanel'
import LiveRegion from './components/LiveRegion'
import ShareDialog from './components/ShareDialog'
import StatusBar from './components/StatusBar'
import ShortcutsHelp from './components/ShortcutsHelp'
import AmbientBackground from './components/AmbientBackground'
import ImportModal from './components/ImportModal'
import CaptionBar from './components/CaptionBar'
import MiniPlayer from './components/MiniPlayer'
import Nav from './components/Nav'
import PlayerSheet from './components/PlayerSheet'
import { useAccent } from './hooks/useAccent'
import { useAnnouncements } from './hooks/useAnnouncements'
import { useDownloads } from './hooks/useDownloads'
import { useMonoAudio } from './hooks/useMonoAudio'
import { useOnline } from './hooks/useOnline'
import { usePrefs } from './hooks/usePrefs'
import { usePwa } from './hooks/usePwa'
import { useShortcuts } from './hooks/useShortcuts'
import { useTranscript } from './hooks/useTranscript'
import { useVLibras } from './hooks/useVLibras'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMediaSession } from './hooks/useMediaSession'
import { usePersistentState } from './hooks/usePersistentState'
import { navigate, paths, useRoute } from './hooks/useRoute'
import { authorOf, buildBooks, partLabel } from './lib/books'
import { episodeShareUrl } from './lib/share'
import { announce } from './lib/announce'
import { formatTime } from './lib/format'
import { t } from './strings'
import { mergeCatalog, parseCatalogJson, serializeCatalog, validEpisodes } from './lib/catalog'
import Book from './views/Book'
import Downloads from './views/Downloads'
import Explore from './views/Explore'
import Home from './views/Home'
import Notes from './views/Notes'
import Publish from './views/Publish'
import Saved from './views/Saved'
import Subscribe from './views/Subscribe'

export default function App() {
  const [base, setBase] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [imported, setImported] = usePersistentState('imported', [])
  const route = useRoute()
  const mainRef = useRef(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState('chapters')
  const [helpOpen, setHelpOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState(null)
  const [prefs] = usePrefs()
  const pwa = usePwa()
  const [transcriptOn, setTranscriptOn] = usePersistentState('transcript-on', false) // "Ver transcrição": desligada por padrão, lembrada
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
  const online = useOnline()
  const { meta: downloaded } = useDownloads()
  // Sem internet só dá para tocar o que foi baixado; o motor usa isso para escolher a "próxima parte".
  const engine = useAudioEngine(episodes, { isPlayable: (ep) => online || !!downloaded[ep.id] })
  useMediaSession(engine)
  useAnnouncements(engine)
  useMonoAudio(engine, prefs.mono)
  useVLibras(prefs.vlibras)
  useShortcuts({
    engine,
    enabled: prefs.shortcuts,
    sheetOpen,
    // T: mostra/oculta a transcrição; ao mostrar, abre o player se estiver fechado.
    onToggleTranscript: () => {
      const next = !transcriptOn
      setTranscriptOn(next)
      if (next) setSheetOpen(true)
    },
    onHelp: () => setHelpOpen(true),
  })
  const books = useMemo(() => buildBooks(episodes), [episodes])
  const book = route.name === 'book' ? books.find((b) => b.slug === route.slug) : undefined
  const transcript = useTranscript(engine.current, transcriptOn || prefs.captions)
  /** Link compartilhável de um episódio (e ponto, em segundos): página estática com prévia nas redes que redireciona ao app. */
  const linkFor = useCallback((ep, sec = 0) => episodeShareUrl(new URL(import.meta.env.BASE_URL, location.origin).href, ep.id, sec), [])
  const bookOfEp = useMemo(() => new Map(books.flatMap((b) => b.parts.map((p) => [p.id, b]))), [books])
  const shareEpisode = useCallback(
    (ep, position = 0) => {
      const book = bookOfEp.get(ep.id)
      setShareTarget({
        key: `ep:${ep.id}`, kind: 'episode', id: ep.id, title: book?.isSeries ? book.title : ep.title, part: book?.isSeries ? partLabel(book, ep) : null,
        author: authorOf(ep), cover: ep.cover, accentColor: ep.accentColor, position, episode: ep,
      })
    },
    [bookOfEp],
  )
  const shareBook = useCallback((b) => setShareTarget({ key: `book:${b.slug}`, kind: 'book', slug: b.slug, title: b.title, author: b.author, cover: b.cover, accentColor: b.accentColor }), [])
  const shareSubscribe = useCallback(() => setShareTarget({ key: 'subscribe', kind: 'subscribe', title: t.subscribe.title, cover: `${import.meta.env.BASE_URL}cover-1400.png`, accentColor: '#6d5dfc' }), [])
  const shareSite = useCallback(() => setShareTarget({ key: 'site', kind: 'site', title: 'Ondas', cover: `${import.meta.env.BASE_URL}cover-1400.png`, accentColor: '#6d5dfc' }), [])

  const playerAccent = useAccent(engine.current)
  const pageAccent = useAccent(book?.parts[0])
  const ambient = book ? pageAccent : playerAccent

  // Link com ponto (#/livro/<obra>?ep=<id>&t=<s>): carrega o episódio nesse ponto, sem tocar sozinho.
  const appliedLink = useRef('')
  useEffect(() => {
    const { ep: epId, t: at } = route.query ?? {}
    if (route.name !== 'book' || !epId || loading) return
    const sig = `${route.key}|${epId}|${at}`
    if (appliedLink.current === sig) return
    const target = episodes.find((e) => e.id === epId)
    if (!target) return
    appliedLink.current = sig
    const start = Math.max(0, Number(at) || 0)
    engine.select(target, { autoplay: false, startAt: start })
    announce(`${target.title}, pronto para tocar a partir de ${formatTime(start)}`)
  }, [route, loading, episodes, engine])

  // Título da página por rota (leitores de tela anunciam) e foco no conteúdo ao navegar.
  const firstRoute = useRef(true)
  useEffect(() => {
    document.title = route.name === 'book' ? (book ? t.titles.book(book.title) : t.titles.notFound) : t.titles[route.name]
  }, [route.name, route.key, book])
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return }
    document.getElementById('conteudo')?.focus({ preventScroll: true })
  }, [route.key])

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

  const view = route.name === 'book' ? 'explore' : route.name === 'downloads' ? 'saved' : ['subscribe', 'publish'].includes(route.name) ? 'home' : route.name
  const wide = ['home', 'explore', 'book', 'subscribe', 'publish'].includes(route.name)
  const hasPlayer = !!engine.current

  return (
    <div className="h-dvh text-ink-50">
      <a
        href="#conteudo"
        onClick={(e) => {
          // O hash faz parte das rotas do app: foca o conteúdo sem navegar.
          e.preventDefault()
          document.getElementById('conteudo')?.focus()
        }}
        className="sr-only-focusable fixed left-3 top-3 z-[60] rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-ink-950">
        {t.skip}
      </a>
      <AmbientBackground color={ambient} />
      <audio ref={engine.audioRef} preload="metadata" />
      <LiveRegion />
      <Nav view={view} onView={(id) => navigate(paths[id])} onImport={() => setImportOpen(true)} />
      <A11yPanel onShowShortcuts={() => setHelpOpen(true)} />
      <StatusBar needRefresh={pwa.needRefresh} onUpdate={pwa.update} />

      <div ref={mainRef} className={`h-full overflow-y-auto overflow-x-hidden px-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pl-28 lg:pr-8 ${hasPlayer ? 'pb-56' : 'pb-36'} lg:pb-32`}>
        <div className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <header className="sr-only">
            <p>{t.site.name}: {t.site.tagline}</p>
          </header>
          <main id="conteudo" tabIndex={-1} aria-label={t.main} className="outline-none focus-visible:outline-none">
            {route.name === 'home' && <Home books={books} episodes={episodes} engine={engine} loading={loading} />}
            {route.name === 'explore' && <Explore books={books} engine={engine} loading={loading} error={error} />}
            {route.name === 'book' && <Book book={book} engine={engine} loading={loading} onShare={shareBook} />}
            {route.name === 'notes' && <Notes episodes={episodes} engine={engine} />}
            {route.name === 'saved' && <Saved episodes={episodes} engine={engine} />}
            {route.name === 'publish' && <Publish />}
            {route.name === 'subscribe' && <Subscribe books={books} onShare={shareSubscribe} />}
            {route.name === 'downloads' && <Downloads episodes={episodes} engine={engine} pwa={pwa} />}
          </main>
          <footer aria-label={t.footer.label} className="mt-16 flex flex-col gap-2 border-t border-[color:var(--line)] pt-6 text-xs text-ink-400">
            <p>{t.footer.credits}</p>
            <p>
              {t.footer.openSource}{' '}
              <a href="https://github.com/JkFa/ondas-podcast" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink-200">github.com/JkFa/ondas-podcast</a>
              {' · '}
              <button onClick={() => setHelpOpen(true)} className="min-h-6 underline underline-offset-2 hover:text-ink-200">{t.footer.shortcuts}</button>
              {' · '}
              <a href={paths.publish} className="underline underline-offset-2 hover:text-ink-200">{t.publish.link2}</a>
              {' · '}
              <a href={paths.subscribe} className="underline underline-offset-2 hover:text-ink-200">{t.subscribe.link}</a>
              {' · '}
              <a href={paths.downloads} className="underline underline-offset-2 hover:text-ink-200">{t.downloads.link}</a>
              {' · '}
              <button onClick={shareSite} className="min-h-6 underline underline-offset-2 hover:text-ink-200">{t.share.shareSite}</button>
            </p>
          </footer>
        </div>
      </div>

      <MiniPlayer engine={engine} onOpen={() => setSheetOpen(true)} />
      {prefs.captions && !sheetOpen && <CaptionBar transcript={transcript} position={engine.position} lifted />}
      <PlayerSheet
        engine={engine} accent={playerAccent} open={sheetOpen} onClose={() => setSheetOpen(false)} tab={sheetTab} onTab={setSheetTab}
        transcriptOn={transcriptOn} onToggleTranscript={() => setTranscriptOn((v) => !v)} transcript={transcript} linkFor={linkFor}
        onShare={() => engine.current && shareEpisode(engine.current, engine.position)}
      />
      {prefs.captions && sheetOpen && <CaptionBar transcript={transcript} position={engine.position} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSave={addImported} onExport={exportCatalog} onImportFile={importFile} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {shareTarget && <ShareDialog key={shareTarget.key} target={shareTarget} onClose={() => setShareTarget(null)} embedEpisode={shareTarget.kind === 'episode' ? shareTarget.episode : null} />}
    </div>
  )
}
