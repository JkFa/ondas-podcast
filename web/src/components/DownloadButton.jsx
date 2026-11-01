import { AlertCircle, Download, Trash2, X } from 'lucide-react'
import { useDownloads } from '../hooks/useDownloads'
import { useOnline } from '../hooks/useOnline'
import { cancelDownload, downloadEpisode, removeEpisode, supported } from '../lib/downloads'
import { t } from '../strings'

const d = t.downloads
const round = 'press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white disabled:opacity-40'

/** Anel de progresso (decorativo: o texto "Baixando, 40%" vai num aviso à parte, em passos de 25%). */
function Ring({ pct }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="-rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--color-signal)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  )
}

/** Botão de ícone de 44 px para baixar / acompanhar / cancelar / remover o download de UM episódio. */
export default function DownloadButton({ ep }) {
  const { meta, jobs } = useDownloads()
  const online = useOnline()
  if (!supported()) return null
  const job = jobs[ep.id]
  const done = !!meta[ep.id]

  if (job?.status === 'downloading' || job?.status === 'queued') {
    const pct = job.total ? Math.min(99, Math.round((job.loaded / job.total) * 100)) : 0
    const step = Math.floor(pct / 25) * 25 // o leitor de tela ouve só 0, 25, 50 e 75%
    return (
      <>
        <button onClick={() => cancelDownload(ep.id)} aria-label={d.cancelFor(ep.title)} className={round}>
          {job.status === 'queued' ? <X size={18} aria-hidden="true" /> : <Ring pct={pct} />}
        </button>
        <span role="status" className="sr-only">{job.status === 'queued' ? d.queued : d.progress(step)}</span>
      </>
    )
  }
  if (job?.status === 'error') {
    return (
      <button onClick={() => downloadEpisode(ep)} aria-label={d.retryFor(ep.title)} title={job.error} className={`${round} text-rose-300`}>
        <AlertCircle size={18} aria-hidden="true" />
      </button>
    )
  }
  if (done) {
    return (
      <button onClick={() => removeEpisode(ep.id)} aria-label={d.removeFor(ep.title)} className={round}>
        <Trash2 size={18} aria-hidden="true" />
      </button>
    )
  }
  return (
    <button onClick={() => downloadEpisode(ep)} disabled={!online} aria-label={d.buttonFor(ep.title)} title={online ? d.button : d.unavailable} className={round}>
      <Download size={18} aria-hidden="true" />
    </button>
  )
}
