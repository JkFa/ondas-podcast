import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { filmProgress, formatBytes } from '../lib/films'
import { announce } from '../lib/announce'
import { formatTime } from '../lib/format'
import { t } from '../strings'

const SAVE_EVERY = 5 // segundos de vídeo entre gravações do progresso

/**
 * Player de vídeo (elemento <video> nativo: teclado, tela cheia e legendas já acessíveis).
 * - Retoma de onde parou; grava o progresso a cada 5 s, ao pausar, ao terminar e ao sair da página.
 * - Filmes com aviso "graphic" só carregam depois de a pessoa confirmar.
 * - Pausa o áudio do app quando o vídeo começa (um som por vez).
 * - Legendas: só as hospedadas no próprio site (o <track> exige a mesma origem ou CORS, que o archive.org não envia).
 */
export default function FilmPlayer({ film, saved, onProgress, pauseAudio, captionsOn }) {
  const ref = useRef(null)
  const latest = useRef({ onProgress, pauseAudio })
  const lastSaved = useRef(0)
  const resumeAt = useRef(0)
  const wasPlaying = useRef(false)
  const [quality, setQuality] = useState('low')
  const [confirmed, setConfirmed] = useState(film.warning !== 'graphic')
  const [failed, setFailed] = useState(false)
  const [startedAt, setStartedAt] = useState(() => {
    const p = filmProgress(saved, film)
    return p.started && !p.done ? p.pos : 0
  })

  useEffect(() => {
    latest.current = { onProgress, pauseAudio }
  })

  const src = quality === 'hd' && film.hd ? film.hd.url : film.video.url

  const save = useCallback(() => {
    const v = ref.current
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0 || v.currentTime < 1) return
    lastSaved.current = v.currentTime
    latest.current.onProgress(film.id, v.currentTime, v.duration)
  }, [film.id])

  // Layout effect: ao sair da página o React solta o ref do <video> logo depois; aqui ele ainda existe para gravar o ponto.
  useLayoutEffect(() => {
    const flush = () => save()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [save])

  // Ao confirmar o aviso, o foco vai para o player (depois de o <video> existir na página).
  const justConfirmed = useRef(false)
  const confirm = () => {
    justConfirmed.current = true
    setConfirmed(true)
  }
  useEffect(() => {
    if (confirmed && justConfirmed.current) {
      justConfirmed.current = false
      ref.current?.focus()
    }
  }, [confirmed])

  const onLoadedMetadata = () => {
    const v = ref.current
    const to = resumeAt.current || startedAt
    if (to > 0 && to < v.duration - 5) {
      v.currentTime = to
      if (resumeAt.current === 0) announce(t.films.resumed(formatTime(to)))
    }
    if (resumeAt.current > 0 && wasPlaying.current) v.play().catch(() => {})
    resumeAt.current = 0
  }

  const changeQuality = (next) => {
    const v = ref.current
    resumeAt.current = v?.currentTime || 0
    wasPlaying.current = !!v && !v.paused
    setFailed(false)
    setQuality(next)
  }

  const restart = () => {
    const v = ref.current
    setStartedAt(0)
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }

  const showResume = startedAt > 0 && confirmed

  return (
    <section aria-label={t.films.playerLabel(film.title)} className="flex flex-col gap-4">
      {film.warning && (
        <div role="note" className="flex gap-3 rounded-2xl border border-[color:var(--control-line)] bg-white/5 px-4 py-3 text-sm text-ink-100">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <p><strong className="font-semibold">{t.films.warningTitle}:</strong> {t.films.warnings[film.warning]}</p>
        </div>
      )}

      {!confirmed ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-2xl bg-ink-900 p-6 text-center">
          <p className="max-w-md text-ink-200">{t.films.confirmPrompt}</p>
          <button onClick={confirm} className="press min-h-11 rounded-full bg-signal px-6 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover">{t.films.confirmGraphic}</button>
        </div>
      ) : (
        <video
          ref={ref}
          key={src}
          src={src}
          poster={film.poster || undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={t.films.playerLabel(film.title)}
          className="aspect-video w-full rounded-2xl bg-black"
          onLoadedMetadata={onLoadedMetadata}
          onPlay={() => latest.current.pauseAudio()}
          onPause={save}
          onEnded={save}
          onSeeked={save}
          onTimeUpdate={(e) => {
            if (Math.abs(e.currentTarget.currentTime - lastSaved.current) >= SAVE_EVERY) save()
          }}
          onError={() => setFailed(true)}
        >
          {film.captions.map((c, i) => (
            <track key={c.src} kind="captions" srcLang={c.lang} label={`${t.films.captionsLangs[c.lang] || c.lang}${c.auto ? ` (${t.films.captionsAuto})` : ''}`} src={`${import.meta.env.BASE_URL}${c.src}`} default={captionsOn && i === 0} />
          ))}
        </video>
      )}

      {failed && (
        <p role="alert" className="rounded-2xl border border-[color:var(--control-line)] px-4 py-3 text-sm text-ink-100">
          {t.films.videoError}{' '}
          {film.archiveUrl && <a href={film.archiveUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center font-medium text-signal underline underline-offset-2">{t.films.openArchive}</a>}
        </p>
      )}

      {showResume && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-ink-300">
          {t.films.resumed(formatTime(startedAt))}
          <button onClick={restart} className="press min-h-11 rounded-full border border-[color:var(--control-line)] px-4 text-sm font-medium text-ink-200 hover:bg-white/10">{t.films.startOver}</button>
        </p>
      )}

      {film.hd && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-2 text-sm text-ink-300">{t.films.quality}</legend>
          {[['low', t.films.qualityLow, film.video.size], ['hd', t.films.qualityHigh, film.hd.size]].map(([id, label, size]) => (
            <label key={id} className={`press flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${quality === id ? 'border-signal text-signal' : 'border-[color:var(--control-line)] text-ink-200'}`}>
              <input type="radio" name={`quality-${film.id}`} checked={quality === id} onChange={() => changeQuality(id)} className="accent-[var(--signal,#6d5dfc)]" />
              {label} · {formatBytes(size)}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-xs text-ink-400">{t.films.dataNote}</p>
    </section>
  )
}
