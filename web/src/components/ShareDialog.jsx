import { Code2, Download, Image as ImageIcon, Link2, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import { announce } from '../lib/announce'
import { formatTime } from '../lib/format'
import { NETWORKS, STORY_NETWORKS, bookShareUrl, embedCode, episodeShareUrl, shareText } from '../lib/share'
import { renderStoryCard } from '../lib/storyCard'
import { slugForFile } from '../lib/transcript'
import { t } from '../strings'
import NetworkIcon from './NetworkIcon'

const s = t.share
const siteBase = () => new URL(import.meta.env.BASE_URL, location.origin).href
const action = 'press flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--control-line)] px-3 text-sm font-medium text-ink-200 hover:bg-white/10'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Janela de compartilhamento. `target`: { kind: 'book'|'episode'|'site', title, author, part?, cover?, accentColor?,
 * slug?, id?, position? }. Monte com `key` diferente para cada alvo (o estado é reiniciado).
 */
export default function ShareDialog({ target, onClose, embedEpisode }) {
  const ref = useRef(null)
  const open = !!target
  useDialog(ref, open, onClose)
  const [fromTime, setFromTime] = useState(false)
  const [card, setCard] = useState({ status: 'idle', url: null, blob: null })
  const [note, setNote] = useState('')
  const cardHeading = useRef(null)

  const base = siteBase()
  const canStart = target?.kind === 'episode' && (target.position ?? 0) >= 5
  const startSec = canStart && fromTime ? Math.floor(target.position) : 0
  const url = !target ? '' : target.kind === 'episode' ? episodeShareUrl(base, target.id, startSec) : target.kind === 'book' ? bookShareUrl(base, target.slug) : base
  const text = useMemo(
    () => (target ? shareText({ kind: target.kind, title: target.title, author: target.author, part: target.part, startSec }) : ''),
    [target, startSec],
  )
  const subject = target?.kind === 'site' ? 'Ondas' : target?.title ?? ''
  const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => () => card.url && URL.revokeObjectURL(card.url), [card.url])

  if (!open) return null

  const say = (msg) => { setNote(msg); announce(msg) }
  const copy = async (value, okMsg) => say((await copyText(value)) ? okMsg : s.copyFail)

  const doNative = async () => {
    try {
      await navigator.share({ title: subject, text, url })
    } catch (e) {
      if (e?.name !== 'AbortError') say(s.copyFail)
    }
  }

  const makeCard = async () => {
    setCard({ status: 'loading', url: null, blob: null })
    try {
      const blob = await renderStoryCard({ title: subject, author: target.author, cover: target.cover, accent: target.accentColor, host: new URL(base).host + new URL(base).pathname.replace(/\/$/, '') })
      setCard({ status: 'ready', url: URL.createObjectURL(blob), blob })
      setTimeout(() => cardHeading.current?.focus(), 50)
    } catch {
      setCard({ status: 'error', url: null, blob: null })
    }
  }
  const story = async () => {
    await copy(url, s.storyCopied) // o link vai para a área de transferência já, para colar no adesivo de link do Story
    if (card.status !== 'ready') await makeCard()
  }
  const fileName = `ondas-${slugForFile(subject)}.png`
  const downloadCard = () => {
    const a = Object.assign(document.createElement('a'), { href: card.url, download: fileName })
    document.body.appendChild(a); a.click(); a.remove()
  }
  const shareCard = async () => {
    const file = new File([card.blob], fileName, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: subject, text: s.storyCopied }) } catch (e) { if (e?.name !== 'AbortError') downloadCard() }
    } else downloadCard()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="share-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-t-3xl border border-[color:var(--line)] bg-ink-900 p-5 pb-8 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="share-title" className="font-display text-2xl">{s.title}</h2>
            <p className="mt-1 truncate text-sm text-ink-400">{subject}</p>
          </div>
          <button onClick={onClose} aria-label={s.close} data-autofocus className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {canStart && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-200">
            <input type="checkbox" checked={fromTime} onChange={(e) => setFromTime(e.target.checked)} className="h-5 w-5 accent-[var(--color-signal)]" />
            {s.fromTime(formatTime(target.position))}
          </label>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="share-link" className="text-sm font-medium text-ink-200">{s.linkLabel}</label>
          <div className="flex gap-2">
            <input id="share-link" readOnly value={url} onFocus={(e) => e.target.select()} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--control-line)] bg-white/[0.04] px-3 text-sm" />
            <button onClick={() => copy(url, s.linkCopied)} className={action}><Link2 size={16} aria-hidden="true" /> {s.copyLink}</button>
          </div>
          {nativeShare && (
            <>
              <button onClick={doNative} className="press flex min-h-12 items-center justify-center gap-2 rounded-xl bg-signal px-4 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover">
                <Share2 size={18} aria-hidden="true" /> {s.native}
              </button>
              <p className="text-xs text-ink-400">{s.nativeHint}</p>
            </>
          )}
        </div>

        <section aria-labelledby="share-networks" className="flex flex-col gap-3">
          <h3 id="share-networks" className="eyebrow">{s.networks}</h3>
          <ul className="grid grid-cols-2 gap-2">
            {NETWORKS.map((n) => (
              <li key={n.id}>
                <a
                  href={n.build({ url, text, title: subject })}
                  target={n.external === false ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  aria-label={n.id === 'email' ? s.byEmail : s.on(n.name)}
                  className={`${action} w-full`}
                >
                  <NetworkIcon id={n.id} /> {n.name}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="share-stories" className="flex flex-col gap-3">
          <h3 id="share-stories" className="eyebrow">{s.stories}</h3>
          <p className="text-xs text-ink-400">{s.storiesHint}</p>
          <ul className="grid grid-cols-2 gap-2">
            {STORY_NETWORKS.map((n) => (
              <li key={n.id}>
                <button onClick={story} aria-label={s.storyOn(n.name)} className={`${action} w-full`}>
                  <NetworkIcon id={n.id} /> {n.name}
                </button>
              </li>
            ))}
          </ul>
          {card.status === 'loading' && <p role="status" className="text-sm text-ink-300">{s.cardGenerating}</p>}
          {card.status === 'error' && <p role="alert" className="text-sm text-rose-300">{s.cardFail}</p>}
          {card.status === 'ready' && (
            <div className="flex flex-col items-center gap-3">
              <h4 ref={cardHeading} tabIndex={-1} className="sr-only">{s.cardPreview(subject)}</h4>
              <img src={card.url} alt={s.cardPreview(subject)} className="max-h-72 w-auto rounded-2xl border border-[color:var(--line)]" />
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={downloadCard} className={action}><Download size={16} aria-hidden="true" /> {s.cardDownload}</button>
                <button onClick={shareCard} className={action}><ImageIcon size={16} aria-hidden="true" /> {s.cardShare}</button>
              </div>
            </div>
          )}
        </section>

        {embedEpisode && (
          <section aria-labelledby="share-embed" className="flex flex-col gap-2">
            <h3 id="share-embed" className="eyebrow">{s.embedTitle}</h3>
            <p className="text-xs text-ink-400">{s.embedHint}</p>
            <textarea readOnly aria-label={s.embedLabel} value={embedCode(base, embedEpisode)} rows={4} onFocus={(e) => e.target.select()} className="rounded-xl border border-[color:var(--control-line)] bg-white/[0.04] p-3 font-mono text-xs" />
            <button onClick={() => copy(embedCode(base, embedEpisode), s.embedCopied)} className={`${action} w-fit`}><Code2 size={16} aria-hidden="true" /> {s.embedCopy}</button>
          </section>
        )}

        <p role="status" className="min-h-5 text-sm text-ink-300">{note}</p>
      </div>
    </div>
  )
}
