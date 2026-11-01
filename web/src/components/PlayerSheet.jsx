import { ChevronDown, FileText, Heart, ListPlus, Share2, Loader2, Minus, MoonStar, Pause, Play, Plus, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import { authorOf } from '../lib/books'
import { t } from '../strings'
import SleepTimer from './SleepTimer'
import { useDownloads } from '../hooks/useDownloads'
import TranscriptPanel from './TranscriptPanel'
import Chapters from './Chapters'
import Cover from './Cover'
import Scrubber from './Scrubber'
import { Markdown } from './Transcript'

const CLOSE_DISTANCE = 120 // px
const CLOSE_VELOCITY = 0.6 // px/ms

const TABS = [
  { id: 'chapters', label: t.player.tabChapters },
  { id: 'notes', label: t.player.tabNotes },
]

export default function PlayerSheet({ engine, accent, open, onClose, tab, onTab, transcriptOn, onToggleTranscript, transcript, linkFor, onShare }) {
  const { current: ep, playing, buffering, error, position, duration, rate, volume, muted, favorites, queue } = engine
  const sheetRef = useRef(null)
  const { meta: downloads } = useDownloads()
  const bodyRef = useRef(null)
  const drag = useRef(null)
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)

  useDialog(sheetRef, open && !!ep, onClose)

  const onDown = (e) => {
    if (e.button > 0 || e.target.closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, t: performance.now(), lastY: e.clientY, lastT: performance.now(), v: 0 }
    setDragging(true)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    setDy(Math.max(0, e.clientY - d.y))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (d && (dy > CLOSE_DISTANCE || d.v > CLOSE_VELOCITY)) onClose()
    setDy(0)
  }

  const seekTo = useCallback((t) => engine.seek(t), [engine])
  if (!ep) return null

  const fav = favorites.includes(ep.id)
  const queued = queue.includes(ep.id)
  const round = 'press flex h-11 w-11 items-center justify-center rounded-full text-ink-200 hover:bg-white/10 hover:text-white'
  const chip = 'press flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-300 hover:bg-white/10'

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={t.player.dialog(ep.title)}
      inert={!open}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-ink-950/90 backdrop-blur-2xl lg:left-20"
      style={{
        transform: open ? `translateY(${dy}px)` : 'translateY(100%)',
        transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        '--accent': accent,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: 'radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent)' }} aria-hidden="true" />

      {/* Cabeçalho: área de arraste para fechar */}
      <div
        className="relative flex shrink-0 touch-none items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <button onClick={onClose} aria-label={t.player.close} data-autofocus className={round}>
          <ChevronDown size={26} aria-hidden="true" />
        </button>
        <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <span className="w-11" />
      </div>

      <div ref={bodyRef} className="relative flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <Cover
            alt={t.player.cover(ep.title, authorOf(ep))}
            src={ep.cover}
            className="mx-auto aspect-square w-full max-w-[22rem] rounded-3xl"
            style={{ boxShadow: '0 40px 90px -30px color-mix(in oklab, var(--accent) 80%, transparent)' }}
          />

          <div className="text-center">
            <p className="eyebrow">{ep.show}</p>
            <h2 className="mt-1 font-display text-3xl leading-tight sm:text-4xl">{ep.title}</h2>
            {downloads[ep.id] && <p className="mt-2 text-xs font-medium text-signal">{t.downloads.available}</p>}
          </div>

          <div>
            <Scrubber position={position} duration={duration} onCommit={seekTo} />
            {error && (
              <p role="alert" className="mt-2 text-center text-sm text-rose-300">
                {t.player.loadError}{' '}
                <button onClick={engine.retry} className="min-h-11 underline underline-offset-2 hover:text-white">{t.player.retry}</button>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div role="group" aria-label={t.player.speedGroup} className="flex items-center">
              <button onClick={() => engine.stepRate(-1)} disabled={rate <= 0.5} aria-label={t.player.speedDown} className={`${round} disabled:opacity-40`}><Minus size={16} aria-hidden="true" /></button>
              <span aria-label={t.player.speedValue(rate)} className="w-11 text-center text-sm font-medium tabular-nums text-ink-100">{rate}x</span>
              <button onClick={() => engine.stepRate(1)} disabled={rate >= 2} aria-label={t.player.speedUp} className={`${round} disabled:opacity-40`}><Plus size={16} aria-hidden="true" /></button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => engine.skip(-15)} aria-label={t.player.back15} className={round}><RotateCcw size={24} aria-hidden="true" /></button>
              <button
                onClick={engine.toggle}
                aria-label={playing ? t.player.pause : t.player.play}
                className="press flex h-16 w-16 items-center justify-center rounded-full bg-signal text-ink-950 hover:bg-signal-hover"
              >
                {buffering && playing ? <Loader2 size={26} className="animate-spin" aria-hidden="true" /> : playing ? <Pause size={26} fill="currentColor" aria-hidden="true" /> : <Play size={26} fill="currentColor" className="translate-x-0.5" aria-hidden="true" />}
              </button>
              <button onClick={() => engine.skip(15)} aria-label={t.player.fwd15} className={round}><RotateCw size={24} aria-hidden="true" /></button>
            </div>
            <div className="flex w-14 justify-end">
              <button onClick={() => engine.toggleFavorite(ep.id)} aria-pressed={fav} aria-label={fav ? t.player.unfavorite : t.player.favorite} className={round}>
                <Heart size={22} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-rose-400' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => (queued ? engine.dequeue(ep.id) : engine.enqueue(ep.id))}
              aria-pressed={queued}
              className={chip}
            >
              <ListPlus size={16} aria-hidden="true" /> {queued ? t.player.queueIn : t.player.queueAdd}
            </button>
            <button onClick={onShare} aria-haspopup="dialog" className={chip}>
              <Share2 size={16} aria-hidden="true" /> {t.share.button}
            </button>
            <button onClick={onToggleTranscript} aria-pressed={transcriptOn} className={chip}>
              <FileText size={16} aria-hidden="true" /> {transcriptOn ? t.transcript.hide : t.transcript.show}
            </button>
            <button onClick={() => setSleepOpen((v) => !v)} aria-expanded={sleepOpen} aria-controls="sleep-panel" className={chip}>
              <MoonStar size={16} aria-hidden="true" /> {engine.sleep.mode === 'off' ? t.sleep.button : t.sleep.buttonOn(engine.sleep.mode === 'end' ? t.sleep.endOfPart : t.sleep.min(engine.sleep.minutes))}
            </button>
          </div>
          {/* O painel fica logo depois do botão que o abre: a ordem do DOM = ordem do Tab. */}
          <SleepTimer id="sleep-panel" open={sleepOpen} engine={engine} />

          <div className="flex items-center justify-end gap-1 text-ink-400">
            <button onClick={engine.toggleMute} aria-pressed={muted} aria-label={muted ? t.player.unmute : t.player.mute} className={round}>
              {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            </button>
            {/* Barra de volume só no desktop: no celular o hardware controla */}
            <input
              type="range" className="volume hidden lg:block" min={0} max={1} step={0.05} value={volume}
              aria-label={t.player.volume} aria-valuetext={`${Math.round(volume * 100)}%`} style={{ '--fill': `${volume * 100}%` }}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
            />
          </div>

          {transcriptOn && (
            <section aria-labelledby="transcript-h" className="flex flex-col gap-3">
              <h3 id="transcript-h" className="eyebrow">{t.player.transcript}</h3>
              <TranscriptPanel
                transcript={transcript}
                position={position}
                onSeek={seekTo}
                linkFor={(sec) => linkFor(ep, sec)}
                meta={{ title: ep.title, author: authorOf(ep), license: ep.license, archiveUrl: ep.archiveId ? `https://archive.org/details/${ep.archiveId}` : null }}
              />
            </section>
          )}

          <div>
            <div role="tablist" aria-label={t.player.contentTabs} className="mb-3 flex gap-1 border-b border-white/10">
              {TABS.map((tabItem) => (
                <button
                  key={tabItem.id}
                  role="tab"
                  id={`tab-${tabItem.id}`}
                  aria-selected={tab === tabItem.id}
                  aria-controls={`panel-${tabItem.id}`}
                  onClick={() => onTab(tabItem.id)}
                  className={`press -mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-medium ${tab === tabItem.id ? 'border-signal text-white' : 'border-transparent text-ink-400 hover:text-ink-200'}`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="panel-chapters" aria-labelledby="tab-chapters" hidden={tab !== 'chapters'}>
              <Chapters chapters={ep.chapters} position={position} onSeek={seekTo} />
            </div>
            <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== 'notes'} className="flex flex-col gap-8">
              <Markdown text={ep.description} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
