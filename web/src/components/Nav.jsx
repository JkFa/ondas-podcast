import { BookOpen, Bookmark, Clapperboard, Home, Library, Plus } from 'lucide-react'
import { t } from '../strings'

const ITEMS = [
  { id: 'home', label: t.nav.home, Icon: Home },
  { id: 'explore', label: t.nav.library, Icon: Library },
  { id: 'films', label: t.nav.films, Icon: Clapperboard },
  { id: 'notes', label: t.nav.notes, Icon: BookOpen },
  { id: 'saved', label: t.nav.saved, Icon: Bookmark },
]

export default function Nav({ view, onView, onImport }) {
  const tab = (id, label, Icon, extra = '') => (
    <button
      key={id}
      onClick={() => onView(id)}
      aria-current={view === id ? 'page' : undefined}
      className={`press flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.6875rem] font-medium tracking-wide desk:w-full desk:flex-none desk:flex-row desk:gap-4 desk:rounded-md desk:px-3 desk:py-0 desk:h-11 desk:text-[0.9375rem] desk:font-bold desk:tracking-normal ${
        view === id ? 'text-signal desk:bg-ink-800' : 'text-ink-400 hover:text-ink-100'
      } ${extra}`}
    >
      <Icon size={20} strokeWidth={view === id ? 2.2 : 1.7} aria-hidden="true" />
      {label}
    </button>
  )
  const importBtn = (
    <button
      onClick={onImport}
      aria-label={t.nav.import}
      className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-ink-950 hover:scale-105 hover:bg-signal-hover desk:h-12 desk:w-full desk:gap-2 desk:text-sm desk:font-bold"
    >
      <Plus size={22} aria-hidden="true" />
      <span className="hidden desk:inline">{t.nav.importShort}</span>
    </button>
  )

  return (
    <>
      {/* Mobile: barra inferior em vidro fosco */}
      <nav
        aria-label={t.nav.label}
        className="glass fixed inset-x-0 bottom-0 bg-ink-950/85 z-30 flex items-center gap-1 rounded-t-3xl border-x-0 border-b-0 px-3 pt-2 desk:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {ITEMS.slice(0, 3).map(({ id, label, Icon }) => tab(id, label, Icon))}
        {importBtn}
        {ITEMS.slice(3).map(({ id, label, Icon }) => tab(id, label, Icon))}
      </nav>

      {/* Desktop: sidebar estreita */}
      <nav
        aria-label={t.nav.label}
        className="fixed bottom-[var(--dock)] left-2 top-2 z-30 hidden w-60 flex-col gap-1 rounded-lg bg-ink-900 p-3 desk:flex"
      >
        <div className="mb-3 flex items-center gap-2.5 px-3 pt-2">
          <svg role="img" aria-label={t.site.name} viewBox="0 0 64 64" className="h-8 w-8 text-signal">
            <path d="M8 34c6-14 10-14 16 0s10 14 16 0 8-10 12-4" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          </svg>
          <span aria-hidden="true" className="font-display text-2xl">{t.site.name}</span>
        </div>
        {ITEMS.map(({ id, label, Icon }) => tab(id, label, Icon))}
        <div className="mt-auto">{importBtn}</div>
      </nav>
    </>
  )
}
