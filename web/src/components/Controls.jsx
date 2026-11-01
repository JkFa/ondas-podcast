import { useId } from 'react'

/** Grupo de opções excludentes (radios nativos, estilizados como botões segmentados). */
export function Segmented({ legend, value, options, onChange, hint }) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink-200">{legend}</legend>
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o.value)} className="relative">
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="flex min-h-11 items-center rounded-xl border border-[color:var(--control-line)] px-4 py-2 text-sm font-medium text-ink-200 peer-checked:border-signal peer-checked:bg-signal peer-checked:text-ink-950 peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--focus-a)] peer-focus-visible:shadow-[0_0_0_6px_var(--focus-b)]">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Interruptor liga/desliga (checkbox com role="switch"), com rótulo e dica opcionais. */
export function Toggle({ label, hint, checked, onChange }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink-200">{label}</label>
        {hint && <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-400">{hint}</p>}
      </div>
      <span className="relative h-11 w-14 shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-8 w-14 -translate-y-1/2 rounded-full border border-[color:var(--control-line)] bg-ink-800 transition-colors peer-checked:border-signal peer-checked:bg-signal peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--focus-a)] peer-focus-visible:shadow-[0_0_0_6px_var(--focus-b)]" />
        <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-ink-200 transition-transform peer-checked:translate-x-6 peer-checked:bg-ink-950" />
      </span>
    </div>
  )
}
