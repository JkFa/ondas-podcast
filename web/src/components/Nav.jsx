import { BookOpen, Bookmark, Home, Library, Plus } from 'lucide-react'

const ITEMS = [
  { id: 'home', label: 'Início', Icon: Home },
  { id: 'explore', label: 'Biblioteca', Icon: Library },
  { id: 'notes', label: 'Notas', Icon: BookOpen },
  { id: 'saved', label: 'Salvos', Icon: Bookmark },
]

export default function Nav({ view, onView, onImport }) {
  const tab = (id, label, Icon, extra = '') => (
    <button
      key={id}
      onClick={() => onView(id)}
      aria-current={view === id ? 'page' : undefined}
      className={`press flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.6875rem] font-medium tracking-wide lg:w-14 lg:flex-none ${
        view === id ? 'text-signal' : 'text-ink-400 hover:text-ink-200'
      } ${extra}`}
    >
      <Icon size={20} strokeWidth={view === id ? 2.2 : 1.7} aria-hidden="true" />
      {label}
    </button>
  )
  const importBtn = (
    <button
      onClick={onImport}
      aria-label="Publicar ou importar episódio"
      className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-ink-950 hover:bg-signal-hover"
    >
      <Plus size={22} aria-hidden="true" />
    </button>
  )

  return (
    <>
      {/* Mobile: barra inferior em vidro fosco */}
      <nav
        aria-label="Principal"
        className="glass fixed inset-x-0 bottom-0 bg-ink-950/85 z-30 flex items-center gap-1 rounded-t-3xl border-x-0 border-b-0 px-3 pt-2 lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {tab(ITEMS[0].id, ITEMS[0].label, ITEMS[0].Icon)}
        {tab(ITEMS[1].id, ITEMS[1].label, ITEMS[1].Icon)}
        {importBtn}
        {tab(ITEMS[2].id, ITEMS[2].label, ITEMS[2].Icon)}
        {tab(ITEMS[3].id, ITEMS[3].label, ITEMS[3].Icon)}
      </nav>

      {/* Desktop: sidebar estreita */}
      <nav
        aria-label="Principal"
        className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 border-r border-white/10 py-6 lg:flex"
      >
        <svg role="img" aria-label="Ondas" viewBox="0 0 64 64" className="mb-6 h-9 w-9 text-signal">
          <path d="M8 34c6-14 10-14 16 0s10 14 16 0 8-10 12-4" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
        {ITEMS.map(({ id, label, Icon }) => tab(id, label, Icon))}
        <div className="mt-auto">{importBtn}</div>
      </nav>
    </>
  )
}
