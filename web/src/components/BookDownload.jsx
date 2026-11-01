import { Download, Trash2, X } from 'lucide-react'
import { useDownloads } from '../hooks/useDownloads'
import { useOnline } from '../hooks/useOnline'
import { cancelDownload, downloadEpisodes, estimateBytes, formatBytes, removeEpisodes, supported } from '../lib/downloads'
import { t } from '../strings'

const d = t.downloads
const btn = 'press flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-[0.9375rem] font-medium text-ink-200 hover:bg-white/10 disabled:opacity-40'

/** Baixar / acompanhar / remover a obra inteira (todas as partes). */
export default function BookDownload({ book }) {
  const { meta, jobs } = useDownloads()
  const online = useOnline()
  if (!supported()) return null
  const parts = book.parts
  const done = parts.filter((p) => meta[p.id])
  const active = parts.filter((p) => jobs[p.id]?.status === 'downloading' || jobs[p.id]?.status === 'queued')
  const missing = parts.filter((p) => !meta[p.id] && !active.includes(p))
  const missingSize = formatBytes(missing.reduce((n, p) => n + estimateBytes(p), 0))

  if (active.length) {
    const finished = done.length
    const loaded = parts.reduce((n, p) => n + (meta[p.id] ? estimateBytes(p) : jobs[p.id]?.loaded || 0), 0)
    const total = parts.reduce((n, p) => n + (meta[p.id] ? estimateBytes(p) : jobs[p.id]?.total || estimateBytes(p)), 0)
    const pct = Math.min(99, Math.round((loaded / total) * 100))
    return (
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <button onClick={() => active.forEach((p) => cancelDownload(p.id))} className={btn}>
          <X size={18} aria-hidden="true" /> {d.bookCancel}
        </button>
        <p className="text-xs tabular-nums text-ink-300">{d.bookProgress(finished, parts.length, pct)}</p>
        <span role="status" className="sr-only">{d.bookProgress(finished, parts.length, Math.floor(pct / 25) * 25)}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        {missing.length > 0 && (
          <button onClick={() => downloadEpisodes(missing)} disabled={!online} className={btn} title={online ? undefined : d.unavailable}>
            <Download size={18} aria-hidden="true" />
            {done.length ? d.bookRest(missing.length, missingSize) : d.bookAll(parts.length, missingSize)}
          </button>
        )}
        {done.length > 0 && (
          <button onClick={() => removeEpisodes(done.map((p) => p.id), book.title)} className={btn}>
            <Trash2 size={18} aria-hidden="true" /> {d.bookRemove}
          </button>
        )}
      </div>
      {done.length > 0 && <p className="text-xs text-ink-400">{d.bookStatus(done.length, parts.length)}</p>}
    </div>
  )
}
