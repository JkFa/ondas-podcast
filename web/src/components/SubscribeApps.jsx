import { Copy, ExternalLink, QrCode as QrIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { announce } from '../lib/announce'
import { launch } from '../lib/launch'
import { APPS, appsFor, detectPlatform, visiblePlatforms } from '../lib/podcastApps'
import { load, save } from '../lib/storage'
import { t } from '../strings'
import NetworkIcon from './NetworkIcon'
import QrCode from './QrCode'
import platformsConfig from '../../../config/platforms.json'

const s = t.subscribe
const btn = 'press flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--control-line)] px-3 text-sm font-medium text-ink-200 hover:bg-white/10'
const ICONS = { applepodcasts: 'applepodcasts', overcast: 'overcast', pocketcasts: 'pocketcasts', antennapod: 'antennapod', castro: 'castro', podcastaddict: 'podcastaddict', castbox: 'castbox' }

/**
 * Botões para assinar o feed no app de podcasts. `feed`: URL do feed (geral ou de uma obra); `title`: nome mostrado
 * ao app. `scope='catalog'` também mostra as plataformas configuradas em config/platforms.json.
 */
export default function SubscribeApps({ feed, title, scope = 'catalog' }) {
  const platform = useMemo(() => detectPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }), [])
  const { oneTap, manual } = useMemo(() => appsFor(platform), [platform])
  const [last, setLast] = useState(() => load('lastApp', null))
  const [fail, setFail] = useState(null) // app cujo link pareceu não abrir
  const [qr, setQr] = useState(false)
  const [note, setNote] = useState('')
  const feedRef = useRef(null)

  const lastApp = APPS.find((a) => a.id === last && a.kind === 'link' && (oneTap.includes(a) || platform === 'desktop'))
  const directory = platformsConfig.applePodcasts // link do diretório do Apple Podcasts (depois do cadastro), se houver

  const hrefFor = (app) => (app.id === 'applepodcasts' && directory && scope === 'catalog' ? directory : app.href(feed, title))
  const open = (app) => {
    save('lastApp', app.id)
    setLast(app.id)
    setFail(null)
    announce(s.opening(app.name))
    launch(hrefFor(app), { onFail: () => { setFail(app); announce(s.failTitle(app.name)) } })
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feed)
      setNote(s.feedCopied)
      announce(s.feedCopied)
    } catch {
      setNote(s.copyFail)
      feedRef.current?.select()
    }
  }
  const stores = (app) => [
    app.store?.ios && { href: app.store.ios, label: s.store(app.name, s.appStore) },
    app.store?.android && { href: app.store.android, label: s.store(app.name, s.play) },
    app.store?.fdroid && { href: app.store.fdroid, label: s.store(app.name, s.fdroid) },
  ].filter(Boolean)
  const configured = visiblePlatforms(platformsConfig)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-400">{s.detectedHint(s.detected[platform])}</p>

      {lastApp && (
        <button onClick={() => open(lastApp)} className="press flex min-h-12 w-fit items-center gap-2 rounded-full bg-signal px-5 font-semibold text-ink-950 hover:bg-signal-hover">
          <NetworkIcon id={ICONS[lastApp.id]} /> {s.again(lastApp.name)}
        </button>
      )}

      {oneTap.length > 0 && (
        <section aria-label={s.oneTap} className="flex flex-col gap-3">
          <h3 className="eyebrow">{s.oneTap}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(12rem,100%),1fr))] gap-2">
            {oneTap.map((app) => (
              <li key={app.id}>
                <button onClick={() => open(app)} aria-label={s.on(app.name)} className={`${btn} w-full`}>
                  <NetworkIcon id={ICONS[app.id]} /> {app.name}
                </button>
              </li>
            ))}
          </ul>
          {oneTap.some((a) => !a.official && a.id === 'applepodcasts') && <p className="text-xs text-ink-400">Apple Podcasts: {s.notOfficial}</p>}
        </section>
      )}

      {fail && (
        <div role="alert" className="glass flex flex-col gap-3 rounded-2xl p-4">
          <p className="font-medium">{s.failTitle(fail.name)}</p>
          <p className="text-sm text-ink-300">{s.failText}</p>
          <div className="flex flex-wrap gap-2">
            {stores(fail).map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={16} aria-hidden="true" /> {l.label}</a>
            ))}
            <button onClick={copy} className={btn}><Copy size={16} aria-hidden="true" /> {s.copyFeed}</button>
          </div>
        </div>
      )}

      <section aria-label={s.feedLabel} className="flex flex-col gap-2">
        <label htmlFor="feed-url" className="text-sm font-medium text-ink-200">{s.feedLabel}</label>
        <div className="flex gap-2">
          <input id="feed-url" ref={feedRef} readOnly value={feed} onFocus={(e) => e.target.select()} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--control-line)] bg-white/[0.04] px-3 text-sm" />
          <button onClick={copy} className={btn}><Copy size={16} aria-hidden="true" /> {s.copyFeed}</button>
        </div>
        <button onClick={() => setQr((v) => !v)} aria-expanded={qr} className={`${btn} w-fit`}><QrIcon size={16} aria-hidden="true" /> {qr ? s.qrHide : s.qrShow}</button>
        {qr && (
          <div className="flex flex-col items-start gap-2">
            <QrCode value={feed} />
            <p className="text-xs text-ink-400">{s.qrHint}</p>
          </div>
        )}
        <p role="status" className="min-h-5 text-sm text-ink-300">{note}</p>
      </section>

      {manual.length > 0 && (
        <section aria-label={s.others} className="flex flex-col gap-2">
          <h3 className="eyebrow">{s.others}</h3>
          {manual.map((app) => (
            <details key={app.id} className="glass rounded-2xl">
              <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-medium">{app.name}</summary>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300" aria-label={s.stepsFor(app.name)}>
                  {(app.steps).map((st) => <li key={st}>{st}</li>)}
                </ol>
                <div className="flex flex-wrap gap-2">
                  {stores(app).map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={16} aria-hidden="true" /> {l.label}</a>)}
                  {app.site && <a href={app.site} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={16} aria-hidden="true" /> {s.siteLink(app.name)}</a>}
                  <button onClick={copy} className={btn}><Copy size={16} aria-hidden="true" /> {s.copyFeed}</button>
                </div>
              </div>
            </details>
          ))}
        </section>
      )}

      {scope === 'catalog' && configured.length > 0 && (
        <section aria-label={s.platforms} className="flex flex-col gap-2">
          <h3 className="eyebrow">{s.platforms}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(12rem,100%),1fr))] gap-2">
            {configured.map((p) => (
              <li key={p.id}>
                <a href={platformsConfig[p.configKey]} target="_blank" rel="noopener noreferrer" aria-label={s.openOn(p.name)} className={`${btn} w-full`}>
                  <NetworkIcon id={p.id} /> {p.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
