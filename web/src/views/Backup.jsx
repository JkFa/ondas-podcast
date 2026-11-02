import { Copy, Download, FileUp, QrCode as QrIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import QrCode from '../components/QrCode'
import { announce } from '../lib/announce'
import { MAX_FILE_BYTES, applyData, backupFilename, buildBackup, decodeCompact, KEYS, parseBackup, qrLink, summarizeData } from '../lib/backup'
import { spokenDuration } from '../lib/stats'
import { freezeWrites, load, save } from '../lib/storage'
import { downloadText } from '../lib/transcript'
import { t } from '../strings'

const b = t.backup
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })
const btn = 'press flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--control-line)] px-5 text-sm font-medium text-ink-200 hover:bg-white/10'
const primary = 'press flex min-h-12 items-center gap-2 rounded-full bg-signal px-6 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover disabled:opacity-60'
const readLocal = (k, fb) => load(k, fb)
const base = () => new URL(import.meta.env.BASE_URL, location.origin).href

function Preview({ summary }) {
  const items = [
    summary.progress && b.items.progress(summary.progress),
    summary.favorites && b.items.favorites(summary.favorites),
    summary.queue && b.items.queue(summary.queue),
    summary.imported && b.items.imported(summary.imported),
    summary.statsDays && b.items.stats(summary.statsDays, spokenDuration(summary.statsSeconds)),
    summary.hasSettings && b.items.settings,
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{b.willImport}</p>
      <ul className="list-disc pl-5 text-sm text-ink-300">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}

/** Exportar/importar o progresso sem conta: arquivo JSON ou QR code (link com dados compactados). */
export default function Backup({ route }) {
  const uid = useId()
  const [error, setError] = useState(null)
  const [incoming, setIncoming] = useState(null) // { data, summary, exportedAt, source }
  const [mode, setMode] = useState('merge')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState({ state: 'off' }) // off | busy | none | ready
  const [copied, setCopied] = useState(false)
  const fileRef = useRef(null)
  const previewRef = useRef(null)
  const done = route.query?.ok === '1'
  const sent = route.query?.d

  const mine = useMemo(() => buildBackup(readLocal), [])
  const mySummary = useMemo(() => summarizeData(mine.data), [mine])

  // Link vindo do QR code (#/backup?d=…): decodifica e mostra a prévia; só importa depois da confirmação.
  useEffect(() => {
    if (!sent) return
    let cancelled = false
    decodeCompact(sent).then((data) => {
      if (cancelled) return
      if (!data) return setError(b.errors.qr)
      setIncoming({ data, summary: summarizeData(data), exportedAt: null, source: b.fromQr })
      setError(null)
    })
    return () => { cancelled = true }
  }, [sent])

  useEffect(() => { if (incoming) previewRef.current?.focus() }, [incoming])
  useEffect(() => { if (done) announce(b.done) }, [done])

  const exportFile = () => {
    const name = backupFilename()
    downloadText(name, JSON.stringify(buildBackup(readLocal), null, 2) + '\n', 'application/json')
    announce(b.exported(name))
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIncoming(null)
    if (file.size > MAX_FILE_BYTES) return setError(b.errors.big)
    let text
    try { text = await file.text() } catch { return setError(b.errors.read) }
    const r = parseBackup(text)
    if (!r.ok) return setError(b.errors[r.error])
    setError(null)
    setIncoming({ data: r.data, summary: r.summary, exportedAt: r.exportedAt, source: b.fromFile(file.name) })
  }

  const toggleQr = async () => {
    if (qr.state === 'ready' || qr.state === 'none') return setQr({ state: 'off' })
    setQr({ state: 'busy' })
    try {
      const r = await qrLink(mine.data, base())
      setQr(r ? { state: 'ready', ...r } : { state: 'none' })
    } catch {
      setQr({ state: 'none' })
    }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(qr.url); setCopied(true); announce(b.qrCopied) } catch { /* sem permissão: o QR continua valendo */ }
  }

  const apply = () => {
    setBusy(true)
    announce(b.applying)
    try {
      const current = Object.fromEntries(KEYS.map((k) => [k, load(k, undefined)]).filter(([, v]) => v !== undefined))
      const next = applyData(current, incoming.data, mode)
      freezeWrites() // o app antigo ainda está na memória: não pode sobrescrever o que chegou
      for (const [k, v] of Object.entries(next)) save(k, v, { force: true })
      history.replaceState(null, '', `${location.pathname}${location.search}#/backup?ok=1`)
      location.reload()
    } catch {
      setBusy(false)
      setError(b.errors.write)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl">{b.title}</h1>
        <p className="text-ink-300">{b.lead}</p>
      </header>

      {done && <p role="status" className="rounded-2xl border border-signal p-4 text-sm">{b.done}</p>}
      {error && <p role="alert" className="rounded-2xl border border-rose-400 p-4 text-sm text-rose-300">{error}</p>}

      {incoming && (
        <section ref={previewRef} tabIndex={-1} aria-labelledby={`${uid}-in-h`} className="glass flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
          <h2 id={`${uid}-in-h`} className="font-display text-2xl">{incoming.source}</h2>
          {incoming.exportedAt && <p className="text-sm text-ink-300">{b.exportedAt(dateFmt.format(new Date(incoming.exportedAt)))}</p>}
          <Preview summary={incoming.summary} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{b.modeLabel}</legend>
            {[['merge', b.merge, b.mergeHint], ['replace', b.replace, b.replaceHint]].map(([v, label, hint]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input type="radio" name={`${uid}-mode`} value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-signal)]" aria-describedby={`${uid}-${v}-hint`} />
                <span><span className="block text-ink-200">{label}</span><span id={`${uid}-${v}-hint`} className="block text-xs text-ink-400">{hint}</span></span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-ink-400">{b.reloadNote}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={apply} disabled={busy} className={primary}>{busy ? b.applying : b.apply}</button>
            <button onClick={() => { setIncoming(null); if (sent) location.hash = '#/backup' }} disabled={busy} className={btn}>{b.cancel}</button>
          </div>
        </section>
      )}

      <section aria-labelledby={`${uid}-ex-h`} className="flex flex-col gap-4">
        <h2 id={`${uid}-ex-h`} className="eyebrow">{b.exportTitle}</h2>
        <p className="text-sm text-ink-300">{b.exportWhat(mySummary)}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportFile} className={primary}><Download size={18} aria-hidden="true" /> {b.exportFile}</button>
          <button onClick={toggleQr} aria-expanded={qr.state === 'ready' || qr.state === 'none'} disabled={qr.state === 'busy'} className={btn}>
            <QrIcon size={18} aria-hidden="true" /> {qr.state === 'busy' ? b.qrBusy : qr.state === 'ready' || qr.state === 'none' ? b.qrHide : b.qrShow}
          </button>
        </div>
        {qr.state === 'none' && <p className="text-sm text-ink-400">{b.qrNone}</p>}
        {qr.state === 'ready' && (
          <div className="glass flex flex-col items-center gap-4 rounded-3xl p-5 sm:flex-row sm:items-start">
            <QrCode value={qr.url} size={232} label={b.qrAlt} />
            <div className="flex flex-col gap-3 text-sm text-ink-300">
              <p>{b.qrNote(qr.count, qr.total)}</p>
              <p>{b.qrHow}</p>
              <button onClick={copyLink} className={`${btn} w-fit`}><Copy size={16} aria-hidden="true" /> {copied ? b.qrCopied : b.qrCopy}</button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-im-h`} className="flex flex-col gap-3">
        <h2 id={`${uid}-im-h`} className="eyebrow">{b.importTitle}</h2>
        <p className="text-sm text-ink-300">{b.importLead}</p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} aria-label={b.fileLabel} className="sr-only" tabIndex={-1} />
        <button onClick={() => fileRef.current?.click()} className={`${btn} w-fit`}><FileUp size={18} aria-hidden="true" /> {b.chooseFile}</button>
      </section>
    </div>
  )
}
