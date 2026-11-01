import { Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Cover from '../components/Cover'
import DownloadButton from '../components/DownloadButton'
import { useDownloads } from '../hooks/useDownloads'
import { useOnline } from '../hooks/useOnline'
import { iosInfo } from '../hooks/usePwa'
import { paths } from '../hooks/useRoute'
import { formatBytes, removeAll, requestPersist, storageInfo, supported, totalBytes } from '../lib/downloads'
import { formatDuration } from '../lib/format'
import { t } from '../strings'

const d = t.downloads

/** "Meus downloads": o que está salvo para ouvir offline, espaço usado, proteção do armazenamento e instalação. */
export default function Downloads({ episodes, engine, pwa }) {
  const { meta, jobs, persisted } = useDownloads()
  const online = useOnline()
  const [info, setInfo] = useState({ usage: 0, quota: 0 })
  const [confirm, setConfirm] = useState(false)
  const { canInstall, install } = pwa
  const { ios, standalone } = iosInfo()

  useEffect(() => { storageInfo().then(setInfo) }, [meta])

  const byId = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes])
  // agrupa por obra, na ordem das partes
  const groups = useMemo(() => {
    const map = new Map()
    for (const [id, m] of Object.entries(meta)) {
      const key = m.series || m.title
      if (!map.has(key)) map.set(key, { title: key, cover: m.cover, items: [] })
      map.get(key).items.push({ id, ...m, ep: byId.get(id) })
    }
    for (const g of map.values()) g.items.sort((a, b) => (a.part || 0) - (b.part || 0))
    return [...map.values()]
  }, [meta, byId])
  const pending = Object.entries(jobs)
  const total = totalBytes(meta)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl">{d.title}</h1>
        <p className="flex items-center gap-2 text-sm text-ink-300" role="status" aria-label={t.pwa.status}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-signal' : 'bg-rose-400'}`} />
          {online ? t.pwa.online : t.pwa.offline}
        </p>
        {!supported() && <p role="alert" className="text-sm text-rose-300">{d.unsupported}</p>}
      </header>

      <section aria-labelledby="storage-h" className="glass flex flex-col gap-3 rounded-3xl p-5">
        <h2 id="storage-h" className="eyebrow">{d.storage}</h2>
        <p className="text-sm text-ink-200">{d.downloadsSize(Object.keys(meta).length, formatBytes(total))}</p>
        {info.quota > 0 && <p className="text-xs text-ink-400">{d.storageUsed(formatBytes(info.usage), formatBytes(info.quota))}</p>}
        {persisted !== null && <p className="text-xs text-ink-400">{persisted ? d.persisted : d.notPersisted}</p>}
        {persisted === false && (
          <button onClick={() => requestPersist()} className="press min-h-11 w-fit rounded-xl border border-[color:var(--control-line)] px-4 text-sm font-medium hover:bg-white/10">{d.askPersist}</button>
        )}
      </section>

      {ios && !standalone && (
        <section aria-labelledby="ios-h" className="glass rounded-3xl p-5">
          <h2 id="ios-h" className="font-display text-xl">{d.iosTitle}</h2>
          <p className="mt-1 text-sm text-ink-300">{d.iosText}</p>
        </section>
      )}

      {(canInstall || standalone) && (
        <section aria-labelledby="install-h" className="glass flex flex-col items-start gap-2 rounded-3xl p-5">
          <h2 id="install-h" className="font-display text-xl">{d.installTitle}</h2>
          <p className="text-sm text-ink-300">{standalone ? d.installed : d.installText}</p>
          {canInstall && <button onClick={install} className="press min-h-11 rounded-xl bg-signal px-5 font-semibold text-ink-950 hover:bg-signal-hover">{d.install}</button>}
        </section>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-h" className="flex flex-col gap-2">
          <h2 id="pending-h" className="eyebrow">{d.queued}</h2>
          <ul className="flex flex-col gap-1">
            {pending.map(([id, job]) => {
              const ep = byId.get(id)
              return ep ? (
                <li key={id} className="flex items-center gap-3 rounded-2xl px-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{ep.title}</span>
                  <span aria-hidden="true" className="text-xs tabular-nums text-ink-400">{job.status === 'error' ? '!' : job.total ? `${Math.min(99, Math.round((job.loaded / job.total) * 100))}%` : ''}</span>
                  <DownloadButton ep={ep} />
                </li>
              ) : null
            })}
          </ul>
        </section>
      )}

      {groups.length === 0 && pending.length === 0 ? (
        <p className="text-ink-300">{d.empty} <a href={paths.explore} className="text-signal underline-offset-4 hover:underline">{t.nav.library}</a></p>
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-label={d.group(g.title)} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Cover src={g.cover} className="h-12 w-12 shrink-0 rounded-xl" />
              <h2 className="font-display min-w-0 flex-1 truncate text-xl">{g.title}</h2>
            </div>
            <ul className="flex flex-col gap-1">
              {g.items.map((it) => {
                const ep = it.ep
                const current = ep && engine.current?.id === ep.id
                const playing = current && engine.playing
                return (
                  <li key={it.id} className={`flex items-center gap-1 rounded-2xl pr-1 ${current ? 'bg-white/10' : ''}`}>
                    <button
                      onClick={() => ep && (current ? engine.toggle() : engine.select(ep))}
                      disabled={!ep}
                      aria-label={playing ? d.pause(it.title) : d.play(it.title)}
                      className="press flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${current ? 'bg-signal text-ink-950' : 'bg-white/10 text-ink-300'}`}>
                        {playing ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">{it.title}</span>
                        <span className="text-xs tabular-nums text-ink-400">{formatBytes(it.bytes)}{ep?.duration ? ` · ${formatDuration(ep.duration)}` : ''}</span>
                      </span>
                    </button>
                    {ep && <DownloadButton ep={ep} />}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {groups.length > 0 && (
        <div>
          {!confirm ? (
            <button onClick={() => setConfirm(true)} className="press flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--control-line)] px-4 text-sm font-medium text-ink-200 hover:bg-white/10">
              <Trash2 size={16} aria-hidden="true" /> {d.removeAll}
            </button>
          ) : (
            <button autoFocus onClick={() => { removeAll(); setConfirm(false) }} onBlur={() => setConfirm(false)} className="press flex min-h-11 items-center gap-2 rounded-xl bg-rose-400 px-4 text-sm font-semibold text-ink-950">
              <Trash2 size={16} aria-hidden="true" /> {d.confirmRemoveAll}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
