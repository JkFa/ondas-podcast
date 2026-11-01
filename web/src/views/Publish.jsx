import { ExternalLink, Send } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { announce } from '../lib/announce'
import { LICENSES, REPO, buildIssueUrl, issueUrl, validateRequest } from '../lib/publishRequest'
import { t } from '../strings'

const p = t.publish
const field = 'min-h-11 w-full rounded-xl border border-[color:var(--control-line)] bg-white/[0.04] px-3 text-sm'

function Field({ id, label, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink-200">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-ink-400">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-sm text-rose-300">{error}</p>}
    </div>
  )
}

/** Formulário "cole o link": valida e abre o GitHub com o pedido preenchido (o resto é automático, ver README). */
export default function Publish() {
  const uid = useId()
  const [f, setF] = useState({ link: '', program: '', author: '', license: 'by', notes: '', confirmed: false })
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const summary = useRef(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const license = LICENSES.find((l) => l.code === f.license)

  const submit = (e) => {
    e.preventDefault()
    const errs = validateRequest(f)
    setErrors(errs)
    setSent(false)
    if (Object.keys(errs).length) {
      announce(p.errors.summary(Object.keys(errs).length))
      setTimeout(() => summary.current?.focus(), 0)
      return
    }
    window.open(buildIssueUrl(f), '_blank', 'noopener')
    setSent(true)
    announce(p.sent)
  }
  const err = (k) => (errors[k] ? p.errors[errors[k]] : null)
  const describedBy = (k) => [`${uid}-${k}-hint`, errors[k] ? `${uid}-${k}-err` : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl">{p.title}</h1>
        <p className="text-ink-300">{p.lead}</p>
      </header>

      <section aria-labelledby="steps-h" className="flex flex-col gap-2">
        <h2 id="steps-h" className="eyebrow">{p.stepsTitle}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-300">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>

      <form onSubmit={submit} noValidate aria-label={p.title} className="glass flex flex-col gap-5 rounded-3xl p-5 sm:p-6">
        {Object.keys(errors).length > 0 && (
          <div ref={summary} tabIndex={-1} role="alert" className="rounded-xl border border-rose-400 p-3 text-sm text-rose-300">
            <p className="font-medium">{p.errors.summary(Object.keys(errors).length)}</p>
            <ul className="mt-1 list-disc pl-5">{Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#${uid}-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`${uid}-${k}`)?.focus() }} className="inline-flex min-h-11 items-center underline">{p.errors[v]}</a></li>)}</ul>
          </div>
        )}

        <Field id={`${uid}-link`} label={p.link} hint={p.linkHint} error={err('link')}>
          <input id={`${uid}-link`} type="url" inputMode="url" autoComplete="off" required value={f.link} onChange={set('link')} placeholder="https://exemplo.com/meu-episodio.mp3"
            aria-invalid={!!errors.link} aria-describedby={describedBy('link')} className={field} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={`${uid}-program`} label={p.program} hint={p.programHint}>
            <input id={`${uid}-program`} value={f.program} onChange={set('program')} maxLength={120} aria-describedby={`${uid}-program-hint`} className={field} />
          </Field>
          <Field id={`${uid}-author`} label={p.author} hint={p.authorHint}>
            <input id={`${uid}-author`} value={f.author} onChange={set('author')} maxLength={120} aria-describedby={`${uid}-author-hint`} className={field} />
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-license`} className="text-sm font-medium text-ink-200">{p.license}</label>
          <select id={`${uid}-license`} value={f.license} onChange={set('license')} aria-describedby={`${uid}-license-explain`} className={`${field} bg-ink-900`}>
            {LICENSES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <p id={`${uid}-license-explain`} className="text-sm text-ink-300">{license?.explain}</p>
        </div>
        <Field id={`${uid}-notes`} label={p.notes} hint={p.notesHint}>
          <textarea id={`${uid}-notes`} value={f.notes} onChange={set('notes')} rows={3} maxLength={1500} aria-describedby={`${uid}-notes-hint`} className={`${field} py-2`} />
        </Field>

        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink-200">
            <input id={`${uid}-confirm`} type="checkbox" checked={f.confirmed} onChange={set('confirmed')} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? `${uid}-confirm-err` : undefined} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-signal)]" />
            {p.confirm}
          </label>
          {errors.confirm && <p id={`${uid}-confirm-err`} className="text-sm text-rose-300">{p.errors.confirm}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <button type="submit" className="press flex min-h-12 w-fit items-center gap-2 rounded-full bg-signal px-6 text-[0.9375rem] font-semibold text-ink-950 hover:bg-signal-hover">
            <Send size={18} aria-hidden="true" /> {p.submit}
          </button>
          <p className="text-xs text-ink-400">{p.submitHint}</p>
          <p role="status" className="min-h-5 text-sm text-ink-200">{sent ? p.sent : ''}</p>
        </div>
      </form>

      <a href={`${issueUrl('')}?q=${encodeURIComponent('label:enviar-episodio')}`.replace('/issues/?', '/issues?')} target="_blank" rel="noopener noreferrer" className="press flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-signal hover:underline">
        <ExternalLink size={16} aria-hidden="true" /> {p.track}
      </a>

      <details className="glass rounded-2xl">
        <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-medium">{p.cliTitle}</summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-ink-300">{p.cliText}</p>
          <pre tabIndex={0} aria-label="Exemplo de comando para publicar um episódio" className="overflow-x-auto rounded-2xl bg-ink-950/70 p-4 text-xs leading-relaxed text-ink-200 sm:text-sm"><code>{`python pipeline/publish.py https://exemplo.com/episodio.mp3 \\
  --license by --transcribe`}</code></pre>
          <a href={`https://github.com/${REPO}/tree/main/pipeline`} target="_blank" rel="noopener noreferrer" className="press flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-signal hover:underline">
            <ExternalLink size={16} aria-hidden="true" /> {p.cliHelp}
          </a>
        </div>
      </details>
    </div>
  )
}
