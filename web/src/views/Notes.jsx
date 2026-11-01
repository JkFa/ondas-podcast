import Cover from '../components/Cover'
import { Markdown } from '../components/Transcript'
import { formatTime } from '../lib/format'

/** Índice navegável de capítulos e notas de todos os episódios. */
export default function Notes({ episodes, engine }) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl">Notas</h1>
        <p className="mt-2 text-ink-400">Capítulos e show notes de todos os episódios.</p>
      </header>
      <div className="flex flex-col gap-3">
        {episodes.map((ep) => (
          <details key={ep.id} className="glass group rounded-3xl open:bg-white/[0.06]">
            <summary className="flex cursor-pointer list-none items-center gap-4 p-3 [&::-webkit-details-marker]:hidden">
              <Cover src={ep.cover} className="h-14 w-14 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="eyebrow block truncate">{ep.show}</span>
                <span className="block truncate font-display text-xl">{ep.title}</span>
              </span>
              <span className="eyebrow pr-2">{ep.chapters?.length ?? 0} cap.</span>
            </summary>
            <div className="flex flex-col gap-5 px-5 pb-5 pt-2">
              <Markdown text={ep.description} />
              {ep.chapters?.length ? (
                <ol className="flex flex-col">
                  {ep.chapters.map((c, i) => (
                    <li key={i}>
                      <button
                        onClick={() => engine.select(ep, { startAt: c.start })}
                        className="press flex min-h-11 w-full gap-4 rounded-xl px-3 py-2 text-left hover:bg-white/5"
                      >
                        <span className="w-14 shrink-0 text-xs tabular-nums text-ink-400">{formatTime(c.start)}</span>
                        <span className="text-ink-200">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-400">Sem capítulos neste episódio.</p>
              )}
              {ep.license && <p className="text-xs text-ink-400">Licença: <a className="underline" href={ep.license} target="_blank" rel="noopener noreferrer">{ep.license}</a></p>}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
