import { ArrowDownToLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime, parseInline, parseMarkdown } from '../lib/format'
import { Empty } from './Chapters'

function Inline({ text }) {
  return parseInline(text).map((t, i) =>
    t.t === 'b' ? <strong key={i} className="font-semibold text-white">{t.text}</strong>
    : t.t === 'i' ? <em key={i}>{t.text}</em>
    : t.t === 'a' ? <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">{t.text}</a>
    : t.text,
  )
}

/** Markdown simples (ver lib/format.js) renderizado como elementos React. */
export function Markdown({ text }) {
  return (
    <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-zinc-300">
      {parseMarkdown(text).map((b, i) =>
        b.type === 'h' ? <h4 key={i} className="eyebrow pt-2"><Inline text={b.text} /></h4>
        : b.type === 'ul' ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
        : <p key={i}><Inline text={b.text} /></p>,
      )}
    </div>
  )
}

/**
 * Transcrição sincronizada. Segue o trecho atual até o usuário rolar por conta
 * própria (wheel/touch); aí aparece "Voltar ao trecho atual".
 * `scrollRef` é o container rolável que contém a lista.
 */
export default function Transcript({ transcript, position, onSeek, scrollRef, active: tabActive }) {
  const [follow, setFollow] = useState(true)
  const activeRef = useRef(null)

  let activeIdx = -1
  transcript?.forEach((s, i) => { if (s.start <= position + 0.2) activeIdx = i })

  const scrollToActive = useCallback((behavior) => {
    const box = scrollRef.current
    const el = activeRef.current
    if (!box || !el) return
    const offset = el.getBoundingClientRect().top - box.getBoundingClientRect().top
    box.scrollTo({ top: box.scrollTop + offset - box.clientHeight / 3, behavior })
  }, [scrollRef])

  useEffect(() => {
    if (follow && tabActive) scrollToActive('smooth')
  }, [activeIdx, follow, tabActive, scrollToActive])

  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const stop = () => setFollow(false)
    box.addEventListener('wheel', stop, { passive: true })
    box.addEventListener('touchmove', stop, { passive: true })
    return () => {
      box.removeEventListener('wheel', stop)
      box.removeEventListener('touchmove', stop)
    }
  }, [scrollRef])

  if (!transcript?.length)
    return <Empty title="Sem transcrição" text="Gere uma com `publish.py --transcribe` e cole o JSON no catálogo." />

  return (
    <div className="relative">
      <ol className="flex flex-col">
        {transcript.map((s, i) => (
          <li key={i} ref={i === activeIdx ? activeRef : null}>
            <button
              onClick={() => { setFollow(true); onSeek(s.start) }}
              aria-current={i === activeIdx ? 'true' : undefined}
              className={`press flex w-full gap-3 rounded-xl px-3 py-2 text-left leading-relaxed transition-colors hover:bg-white/5 ${i === activeIdx ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
            >
              <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-zinc-500">{formatTime(s.start)}</span>
              <span>{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
      {!follow && activeIdx >= 0 && (
        <div className="pointer-events-none sticky bottom-3 mt-3 flex justify-center">
          <button
            onClick={() => { setFollow(true); scrollToActive('smooth') }}
            className="glass press pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
          >
            <ArrowDownToLine size={14} aria-hidden="true" /> Voltar ao trecho atual
          </button>
        </div>
      )}
    </div>
  )
}
