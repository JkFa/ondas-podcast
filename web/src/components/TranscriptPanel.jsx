import { ChevronDown, ChevronUp, Captions, Copy, Download, Link2, LocateFixed, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrefs } from '../hooks/usePrefs'
import { announce } from '../lib/announce'
import { buildMd, buildTxt, downloadText, findActive, highlight, searchParagraphs, slugForFile } from '../lib/transcript'
import { formatTime } from '../lib/format'
import { t } from '../strings'

const tr = t.transcript
const btn = 'press flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--control-line)] px-3 text-sm font-medium text-ink-200 hover:bg-white/10'

/**
 * Transcrição sincronizada com o áudio.
 * Acessibilidade: o destaque do trecho atual (`aria-current`) nunca move o foco nem usa aria-live,
 * então não interrompe quem usa leitor de tela; "parar de seguir" desliga a rolagem automática.
 */
export default function TranscriptPanel({ transcript, position, onSeek, linkFor, meta }) {
  const { status, paragraphs, retry } = transcript
  const [prefs, setPrefs] = usePrefs()
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [picked, setPicked] = useState(null) // parágrafo escolhido por clique, usado ao copiar o trecho
  const listRef = useRef(null)
  const activeRef = useRef(null)

  const active = findActive(paragraphs, position)
  const hits = useMemo(() => searchParagraphs(paragraphs, query), [paragraphs, query])
  const hitSet = useMemo(() => new Set(hits), [hits])
  const hitAt = hits.length ? hits[Math.min(matchIdx, hits.length - 1)] : -1

  const scrollTo = useCallback((el) => {
    const box = listRef.current
    if (!box || !el) return
    const reduce = document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  // Segue o trecho atual (só dentro da lista; nada de foco ou scrollIntoView da página).
  useEffect(() => {
    if (follow && !query && activeRef.current) scrollTo(activeRef.current)
  }, [active, follow, query, scrollTo])

  // Roda, toque ou teclado na lista são ações da pessoa: param de seguir e oferecem "Voltar ao trecho atual".
  // (Não usamos o evento `scroll`, que também dispara na rolagem automática.)
  const onUserScroll = () => setFollow(false)

  const goToMatch = (i) => {
    const next = (i + hits.length) % hits.length
    setMatchIdx(next)
    setFollow(false)
    const el = listRef.current?.querySelector(`[data-p="${hits[next]}"]`)
    scrollTo(el)
  }

  const copyLink = async () => {
    const i = picked ?? (active >= 0 ? active : 0)
    const p = paragraphs[i]
    if (!p) return
    const text = `“${p.text}”\n— ${meta.title} (${formatTime(p.start)})\n${linkFor(p.start)}`
    try {
      await navigator.clipboard.writeText(text)
      announce(tr.copied)
    } catch {
      announce(tr.copyFail)
    }
  }
  const base = slugForFile(meta.title)
  const download = (kind) => {
    if (kind === 'txt') downloadText(`${base}.txt`, buildTxt(paragraphs))
    else downloadText(`${base}.md`, buildMd({ ...meta, episodeUrl: linkFor(0) }, paragraphs, linkFor), 'text/markdown')
  }

  if (status === 'none') {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <p className="font-medium">{tr.soon}</p>
        <p className="mt-1 text-sm text-ink-400">{tr.soonHint}</p>
      </div>
    )
  }
  if (status === 'loading') return <p role="status" className="text-sm text-ink-400">{tr.loading}</p>
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-rose-300">
        {tr.error} <button onClick={retry} className="min-h-11 underline underline-offset-2 hover:text-white">{tr.retry}</button>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="glass flex min-w-0 flex-1 items-center gap-2 rounded-xl border-[color:var(--control-line)] px-3 sm:max-w-xs">
          <Search size={16} className="shrink-0 text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMatchIdx(0) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && hits.length) { e.preventDefault(); goToMatch(matchIdx + (e.shiftKey ? -1 : 1)) } }}
            placeholder={tr.searchPlaceholder}
            aria-label={tr.searchLabel}
            className="min-h-11 w-full min-w-0 bg-transparent text-sm placeholder:text-ink-400"
          />
        </label>
        {query.trim() && (
          <div className="flex items-center gap-1">
            <button onClick={() => goToMatch(matchIdx - 1)} disabled={!hits.length} aria-label={tr.prev} className={`${btn} px-2 disabled:opacity-40`}><ChevronUp size={16} aria-hidden="true" /></button>
            <button onClick={() => goToMatch(matchIdx + 1)} disabled={!hits.length} aria-label={tr.next} className={`${btn} px-2 disabled:opacity-40`}><ChevronDown size={16} aria-hidden="true" /></button>
            <span role="status" aria-live="polite" className="text-xs tabular-nums text-ink-300">
              {hits.length ? tr.results(Math.min(matchIdx, hits.length - 1) + 1, hits.length) : tr.noResults}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => (follow ? setFollow(false) : (setFollow(true), setQuery('')))} aria-pressed={follow} className={btn}>
          <LocateFixed size={16} aria-hidden="true" /> {follow ? tr.stopFollow : tr.follow}
        </button>
        <button onClick={() => setPrefs({ captions: !prefs.captions })} aria-pressed={prefs.captions} className={btn}>
          <Captions size={16} aria-hidden="true" /> {tr.captions}
        </button>
        <button onClick={copyLink} className={btn}><Link2 size={16} aria-hidden="true" /> {tr.copyLink}</button>
        <button onClick={() => download('txt')} className={btn}><Download size={16} aria-hidden="true" /> {tr.downloadTxt}</button>
        <button onClick={() => download('md')} className={btn}><Copy size={16} aria-hidden="true" /> {tr.downloadMd}</button>
      </div>

      {!follow && active >= 0 && (
        <button onClick={() => { setFollow(true); setQuery(''); scrollTo(activeRef.current) }} className={`${btn} w-fit`}>
          <LocateFixed size={16} aria-hidden="true" /> {tr.backToCurrent}
        </button>
      )}

      <ol
        ref={listRef}
        aria-label={tr.listLabel}
        tabIndex={0}
        onWheel={onUserScroll}
        onTouchMove={onUserScroll}
        onKeyDown={(e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && onUserScroll()}
        className="relative flex max-h-[45vh] flex-col gap-1 overflow-y-auto overscroll-contain rounded-2xl border border-[color:var(--line)] p-1"
      >
        {paragraphs.map((p, i) => (
          <li key={`${p.start}-${i}`} data-p={i} ref={i === active ? activeRef : undefined}>
            <button
              onClick={() => { setPicked(i); onSeek(p.start) }}
              aria-current={i === active ? 'true' : undefined}
              aria-label={`${tr.seekTo(formatTime(p.start))}: ${p.text.slice(0, 80)}`}
              className={`press flex min-h-11 w-full gap-3 rounded-xl px-3 py-2 text-left leading-relaxed transition-colors hover:bg-white/5 ${
                i === active ? 'bg-white/10 text-white' : picked === i ? 'bg-white/5 text-ink-200' : 'text-ink-300'
              } ${i === hitAt ? 'ring-2 ring-signal' : ''}`}
            >
              <span aria-hidden="true" className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-ink-400">{formatTime(p.start)}</span>
              <span aria-hidden="true">
                {hitSet.has(i) && query
                  ? highlight(p.text, query).map((part, k) => (part.hit ? <mark key={k} className="rounded bg-signal px-0.5 text-ink-950">{part.text}</mark> : part.text))
                  : p.text}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-400">{tr.machineNote}</p>
    </div>
  )
}
