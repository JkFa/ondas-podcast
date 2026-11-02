import { BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { announce } from '../lib/announce'
import { spokenDuration, summarize } from '../lib/stats'
import { paths } from '../hooks/useRoute'
import { t } from '../strings'

const s = t.stats
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function Tile({ label, value }) {
  return (
    <div className="glass flex flex-col gap-1 rounded-2xl p-4">
      <dt className="text-xs text-ink-300">{label}</dt>
      <dd className="font-display text-2xl tabular-nums sm:text-3xl">{value}</dd>
    </div>
  )
}

/** Estatísticas pessoais: tudo calculado aqui, no aparelho, a partir do que o motor de áudio já guarda. */
export default function Stats({ books, engine }) {
  const [confirming, setConfirming] = useState(false)
  const sum = useMemo(() => summarize(engine.stats, engine.progress, books), [engine.stats, engine.progress, books])
  const hasTime = sum.total > 0
  const max = Math.max(...sum.week.map((d) => d.c), 1)
  const time = (sec) => (sec > 0 ? spokenDuration(sec) : s.none)

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl">{s.title}</h1>
        <p className="text-ink-300">{s.lead}</p>
      </header>

      {!hasTime && sum.episodesDone === 0 && <p className="glass rounded-2xl p-5 text-ink-300">{s.empty}</p>}

      <section aria-labelledby="nums-h" className="flex flex-col gap-3">
        <h2 id="nums-h" className="sr-only">Números</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label={s.tiles.total} value={time(sum.total)} />
          <Tile label={s.tiles.today} value={time(sum.today)} />
          <Tile label={s.tiles.week} value={time(sum.weekTotal)} />
          <Tile label={s.tiles.activeDays} value={sum.activeDays} />
          <Tile label={s.tiles.avgDay} value={time(sum.avgPerActiveDay)} />
          <Tile label={s.tiles.streak} value={sum.streak ? s.days(sum.streak) : s.none} />
          <Tile label={s.tiles.speed} value={sum.avgSpeed ? `${sum.avgSpeed.toFixed(2).replace('.', ',')}×` : s.none} />
          <Tile label={s.tiles.episodes} value={sum.episodesDone} />
          <Tile label={s.tiles.booksDone} value={sum.booksDone} />
          <Tile label={s.tiles.booksOngoing} value={sum.booksOngoing} />
        </dl>
        {engine.stats.since && <p className="text-xs text-ink-400">{s.since(dateFmt.format(new Date(`${engine.stats.since}T12:00:00`)))}</p>}
      </section>

      <section aria-labelledby="week-h" className="flex flex-col gap-3">
        <h2 id="week-h" className="eyebrow flex items-center gap-2"><BarChart3 size={14} aria-hidden="true" /> {s.weekTitle}</h2>
        <ul className="flex flex-col gap-2">
          {sum.week.map((d) => (
            <li key={d.key} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-ink-300 sm:w-32">{weekday.format(d.date)}</span>
              <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-signal" style={{ width: `${(d.c / max) * 100}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums text-ink-200">{time(d.c)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-2xl text-sm text-ink-400">{s.honest}</p>

      <div className="flex flex-col gap-3">
        {confirming ? (
          <div role="group" aria-label={s.reset} className="glass flex flex-col gap-3 rounded-2xl p-4">
            <p className="text-sm">{s.resetAsk}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { engine.resetStats(); setConfirming(false); announce(s.resetDone) }} className="press min-h-11 rounded-full bg-rose-300 px-5 text-sm font-semibold text-ink-950">{s.resetYes}</button>
              <button autoFocus onClick={() => setConfirming(false)} className="press min-h-11 rounded-full border border-[color:var(--control-line)] px-5 text-sm font-medium">{s.resetNo}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} disabled={!hasTime} className="press min-h-11 w-fit rounded-full border border-[color:var(--control-line)] px-5 text-sm font-medium text-ink-200 hover:bg-white/10 disabled:opacity-50">{s.reset}</button>
        )}
        <a href={paths.backup} className="press flex min-h-11 w-fit items-center text-sm font-medium text-signal hover:underline">{s.toBackup}</a>
      </div>
    </div>
  )
}
