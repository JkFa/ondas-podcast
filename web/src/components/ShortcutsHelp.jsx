import { X } from 'lucide-react'
import { useRef } from 'react'
import { useDialog } from '../hooks/useDialog'
import { t } from '../strings'

/** Painel de ajuda dos atalhos (abre com "?"). */
export default function ShortcutsHelp({ open, onClose }) {
  const ref = useRef(null)
  useDialog(ref, open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="help-title" className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-[color:var(--line)] bg-ink-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="help-title" className="font-display text-2xl">{t.help.title}</h2>
          <button onClick={onClose} aria-label={t.help.close} data-autofocus className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <dl className="flex flex-col divide-y divide-[color:var(--line)]">
          {t.help.rows.map(([keys, what]) => (
            <div key={keys} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-sm text-ink-200">{what}</dt>
              <dd><kbd className="whitespace-nowrap rounded-lg border border-[color:var(--control-line)] bg-ink-800 px-2 py-1 font-mono text-xs">{keys}</kbd></dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-ink-400">{t.help.note}</p>
      </div>
    </div>
  )
}
