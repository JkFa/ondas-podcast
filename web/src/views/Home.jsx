import { Archive, ArrowRight, Check, Copy, Rss, UserRoundX } from 'lucide-react'
import { useMemo, useState } from 'react'
import BookCard from '../components/BookCard'
import ResumeCard from '../components/ResumeCard'
import ViewCount from '../components/ViewCount'
import { paths } from '../hooks/useRoute'
import { lastListened } from '../lib/books'
import { formatDuration } from '../lib/format'
import { t } from '../strings'


/** Duas ondas senoidais sobrepostas, em laço contínuo (o SVG tem 6 períodos e desliza metade (3 períodos inteiros)). */
function Waves() {
  const path = (amp, off) => {
    const pts = []
    for (let x = 0; x <= 1200; x += 5) pts.push(`${x},${(60 + amp * Math.sin(((x / 100) * Math.PI) + off)).toFixed(1)}`)
    return `M${pts.join(' L')}`
  }
  const layer = (cls, amp, off, opacity, width) => (
    <svg aria-hidden="true" viewBox="0 0 1200 120" preserveAspectRatio="none" className={`absolute left-0 top-0 h-full w-[200%] ${cls}`}>
      <path d={path(amp, off)} fill="none" stroke="var(--color-signal)" strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
  return (
    <div aria-hidden="true" className="relative h-24 w-full overflow-hidden sm:h-28 [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
      {layer('wave-b', 26, 1.2, 0.35, 2)}
      {layer('wave-a', 38, 0, 0.9, 3)}
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-3xl tabular-nums sm:text-4xl">{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  )
}

function Feature({ Icon, title, children }) {
  return (
    <div className="glass flex flex-col gap-3 rounded-3xl p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal/15 text-signal"><Icon size={20} aria-hidden="true" /></span>
      <h3 className="font-display text-xl leading-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-300">{children}</p>
    </div>
  )
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* sem permissão: o texto continua selecionável */
    }
  }
  return (
    <div className="glass flex items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5">
      <code className="min-w-0 flex-1 truncate text-xs text-ink-200 sm:text-sm">{value}</code>
      <button onClick={copy} className="press flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/15" aria-live="polite">
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export default function Home({ books, episodes, engine, loading }) {
  const lastBook = useMemo(() => lastListened(books, engine.progress), [books, engine.progress])
  const total = useMemo(() => episodes.reduce((t, e) => t + (e.duration || 0), 0), [episodes])
  const feedUrl = new URL(`${import.meta.env.BASE_URL}feed.xml`, location.href).href
  const picks = books.slice(0, 4)

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      <section aria-labelledby="hero-h" className="flex flex-col gap-8 pt-4 sm:pt-10">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Ondas</p>
          <h1 id="hero-h" className="font-display max-w-3xl text-[2.75rem] leading-[0.98] sm:text-7xl">
            Áudios e podcasts indies arquivados e <span className="text-signal">prontos para ouvir.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            Uma estante aberta de audiolivros e programas independentes, guardados no Internet Archive. Sem cadastro, sem anúncios: é só apertar o play.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <a href={paths.explore} className="press flex items-center gap-2 rounded-full bg-signal px-6 py-3.5 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover">
              Explorar a biblioteca <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a href="#como-funciona" className="press rounded-full border border-white/15 px-5 py-3.5 text-[0.9375rem] font-medium text-ink-200 hover:border-white/30">
              Como funciona
            </a>
          </div>
        </div>
        <Waves />
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <Stat value={loading ? '–' : books.length} label="obras" />
          <Stat value={loading ? '–' : episodes.length} label="episódios" />
          <Stat value={loading ? '–' : formatDuration(total)} label="de áudio" />
          <ViewCount viewKey="site" label="visitas ao site" className="pb-1.5" />
        </div>
      </section>

      {lastBook && <ResumeCard book={lastBook} engine={engine} />}

      {picks.length > 0 && (
        <section aria-labelledby="picks-h" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-x-4">
            <h2 id="picks-h" className="font-display text-3xl sm:text-4xl">Para começar</h2>
            <a href={paths.explore} className="press flex min-h-11 items-center gap-1.5 text-sm font-medium text-signal hover:underline">
              Ver tudo <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(10.5rem,100%),1fr))] gap-x-4 gap-y-8">
            {picks.map((b) => <BookCard key={b.slug} book={b} progress={engine.progress} playing={engine.playing && b.parts.some((p) => p.id === engine.current?.id)} />)}
          </div>
        </section>
      )}

      <section id="como-funciona" aria-labelledby="how-h" className="flex scroll-mt-6 flex-col gap-5">
        <h2 id="how-h" className="font-display text-3xl sm:text-4xl">Como funciona</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Feature Icon={Archive} title="Arquivado de verdade">
            Cada episódio fica no Internet Archive, uma biblioteca sem fins lucrativos. O Ondas só organiza e toca; nada some se este site sair do ar.
          </Feature>
          <Feature Icon={UserRoundX} title="Sem conta, sem cadastro">
            Seu progresso, favoritos e fila ficam só no seu navegador, não em um servidor. Feche, volte amanhã e continue de onde parou.
          </Feature>
          <Feature Icon={Rss} title="Leve para o seu app">
            O catálogo também é um feed RSS: cole o endereço abaixo no app de podcasts que você já usa.
          </Feature>
        </div>
        <CopyField value={feedUrl} />
        <a href={paths.subscribe} className="press flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-signal hover:underline">
          Ouça no seu app: Apple Podcasts, Overcast, Pocket Casts, AntennaPod… <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>

      <section aria-labelledby="pub-h" className="glass flex flex-col gap-5 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Para quem produz</p>
          <h2 id="pub-h" className="font-display text-3xl sm:text-4xl">{t.publish.title}</h2>
          <p className="max-w-2xl text-ink-300">Cole o link do áudio ou do YouTube e o Ondas faz o resto: baixa, ajusta o volume, transcreve, escreve a descrição e publica no Internet Archive depois de uma conferência.</p>
        </div>
        <a href={paths.publish} className="press flex min-h-12 w-fit items-center gap-2 rounded-full bg-signal px-6 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover">
          Publicar um episódio <ArrowRight size={18} aria-hidden="true" />
        </a>
      </section>
    </div>
  )
}
