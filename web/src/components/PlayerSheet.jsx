import { ChevronDown, Heart, ListPlus, Loader2, Pause, Play, RotateCcw, RotateCw, Volume2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import Chapters from './Chapters'
import Cover from './Cover'
import Scrubber from './Scrubber'
import Transcript, { Markdown } from './Transcript'

const CLOSE_DISTANCE = 120 // px
const CLOSE_VELOCITY = 0.6 // px/ms

const TABS = [
  { id: 'chapters', label: 'Capítulos' },
  { id: 'notes', label: 'Caderno' },
]

export default function PlayerSheet({ engine, accent, open, onClose }) {
  const { current: ep, playing, buffering, error, position, duration, rate, volume, favorites, queue } = engine
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  const drag = useRef(null)
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState('chapters')

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
  const round = 'press flex h-11 w-11 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 hover:text-white'

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Player: ${ep.title}`}
      inert={!open}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-zinc-950/90 backdrop-blur-2xl lg:left-20"
      style={{
        transform: open ? `translateY(${dy}px)` : 'translateY(100%)',
        transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        '--accent': accent,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: 'radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent)' }} aria-hidden="true" />

      {/* Cabeçalho: área de arraste para fechar */}
      <header
        className="relative flex shrink-0 touch-none items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <button onClick={onClose} aria-label="Fechar player" data-autofocus className={round}>
          <ChevronDown size={26} />
        </button>
        <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <span className="w-11" />
      </header>

      <div ref={bodyRef} className="relative flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <Cover
            src={ep.cover}
            className="mx-auto aspect-square w-full max-w-[22rem] rounded-3xl"
            style={{ boxShadow: '0 40px 90px -30px color-mix(in oklab, var(--accent) 80%, transparent)' }}
          />

          <div className="text-center">
            <p className="eyebrow">{ep.show}</p>
            <h2 className="mt-1 font-display text-3xl leading-tight sm:text-4xl">{ep.title}</h2>
          </div>

          <div>
            <Scrubber position={position} duration={duration} onCommit={seekTo} />
            {error && (
              <p role="alert" className="mt-2 text-center text-sm text-rose-300">
                Não foi possível carregar o áudio.{' '}
                <button onClick={engine.retry} className="underline underline-offset-2 hover:text-white">Tentar novamente</button>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={engine.cycleRate} aria-label={`Velocidade ${rate}x. Tocar para alterar`} className="press w-14 rounded-full py-2 text-sm font-medium tabular-nums text-zinc-200 hover:bg-white/10">
              {rate}x
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => engine.skip(-15)} aria-label="Voltar 15 segundos" className={round}><RotateCcw size={24} /></button>
              <button
                onClick={engine.toggle}
                aria-label={playing ? 'Pausar' : 'Tocar'}
                className="press flex h-16 w-16 items-center justify-center rounded-full bg-white text-zinc-950 hover:bg-zinc-200"
              >
                {buffering && playing ? <Loader2 size={26} className="animate-spin" /> : playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="translate-x-0.5" />}
              </button>
              <button onClick={() => engine.skip(15)} aria-label="Avançar 15 segundos" className={round}><RotateCw size={24} /></button>
            </div>
            <div className="flex w-14 justify-end">
              <button onClick={() => engine.toggleFavorite(ep.id)} aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Favoritar'} className={round}>
                <Heart size={22} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-rose-400' : ''} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => (queued ? engine.dequeue(ep.id) : engine.enqueue(ep.id))}
              className="press flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
            >
              <ListPlus size={16} aria-hidden="true" /> {queued ? 'Na fila' : 'Adicionar à fila'}
            </button>
            {/* Volume só no desktop: no celular o hardware controla */}
            <label className="hidden items-center gap-2 text-zinc-400 lg:flex">
              <Volume2 size={16} aria-hidden="true" />
              <input
                type="range" className="volume" min={0} max={1} step={0.05} value={volume}
                aria-label="Volume" style={{ '--fill': `${volume * 100}%` }}
                onChange={(e) => engine.setVolume(Number(e.target.value))}
              />
            </label>
          </div>

          <div>
            <div role="tablist" aria-label="Conteúdo do episódio" className="mb-3 flex gap-1 border-b border-white/10">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`press -mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? 'border-white text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="panel-chapters" aria-labelledby="tab-chapters" hidden={tab !== 'chapters'}>
              <Chapters chapters={ep.chapters} position={position} onSeek={seekTo} />
            </div>
            <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== 'notes'} className="flex flex-col gap-8">
              <Markdown text={ep.description} />
              <section aria-labelledby="transcript-h">
                <h3 id="transcript-h" className="eyebrow mb-2">Transcrição</h3>
                <Transcript transcript={ep.transcript} position={position} onSeek={seekTo} scrollRef={bodyRef} active={open && tab === 'notes'} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
