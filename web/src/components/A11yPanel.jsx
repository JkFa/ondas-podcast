import { Accessibility, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import { usePrefs } from '../hooks/usePrefs'
import { resetPrefs } from '../lib/prefs'
import { t } from '../strings'
import { Segmented, Toggle } from './Controls'

const a = t.a11y

/** Botão fixo + painel lateral com as preferências de acessibilidade (salvas em localStorage). */
export default function A11yPanel({ onShowShortcuts }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [prefs, set] = usePrefs()
  useDialog(ref, open, () => setOpen(false))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={a.open}
        aria-haspopup="dialog"
        className="press fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--control-line)] bg-ink-900/90 text-ink-100 backdrop-blur hover:bg-ink-800"
      >
        <Accessibility size={22} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="a11y-title" className="flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-[color:var(--line)] bg-ink-900 p-5 pb-10 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="a11y-title" className="font-display text-2xl">{a.title}</h2>
                <p className="mt-1 text-sm text-ink-400">{a.intro}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label={a.close} data-autofocus className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <Segmented
              legend={a.theme}
              value={prefs.theme}
              onChange={(v) => set({ theme: v })}
              options={[{ value: 'system', label: a.themeSystem }, { value: 'light', label: a.themeLight }, { value: 'dark', label: a.themeDark }]}
            />
            <Toggle label={a.contrast} checked={prefs.contrast} onChange={(v) => set({ contrast: v })} />
            <Segmented
              legend={a.textSize}
              value={prefs.textScale}
              onChange={(v) => set({ textScale: v })}
              options={[100, 125, 150, 200].map((n) => ({ value: n, label: `${n}%` }))}
            />
            <Segmented
              legend={a.font}
              value={prefs.font}
              onChange={(v) => set({ font: v })}
              options={[{ value: 'default', label: a.fontDefault }, { value: 'atkinson', label: a.fontAtkinson }, { value: 'opendyslexic', label: a.fontDyslexic }]}
            />
            <Segmented
              legend={a.motion}
              value={prefs.motion}
              onChange={(v) => set({ motion: v })}
              options={[{ value: 'system', label: a.motionSystem }, { value: 'reduce', label: a.motionReduce }, { value: 'full', label: a.motionFull }]}
            />
            <Toggle label={a.spacing} checked={prefs.spacing} onChange={(v) => set({ spacing: v })} />
            <Toggle label={a.mono} hint={a.monoHint} checked={prefs.mono} onChange={(v) => set({ mono: v })} />
            <Toggle label={a.captions} hint={a.captionsHint} checked={prefs.captions} onChange={(v) => set({ captions: v })} />
            <Toggle label={a.shortcuts} hint={a.shortcutsHint} checked={prefs.shortcuts} onChange={(v) => set({ shortcuts: v })} />
            <Toggle
              label={a.vlibras}
              hint={a.vlibrasHint}
              checked={prefs.vlibras}
              onChange={(v) => {
                set({ vlibras: v })
                if (!v) setTimeout(() => location.reload(), 150) // o widget não tem como ser descarregado
              }}
            />

            <div className="flex flex-wrap gap-3 border-t border-[color:var(--line)] pt-5">
              <button onClick={() => { setOpen(false); onShowShortcuts() }} className="press min-h-11 rounded-xl border border-[color:var(--control-line)] px-4 text-sm font-medium hover:bg-white/10">{a.showShortcuts}</button>
              <button onClick={resetPrefs} className="press min-h-11 rounded-xl border border-[color:var(--control-line)] px-4 text-sm font-medium hover:bg-white/10">{a.reset}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
