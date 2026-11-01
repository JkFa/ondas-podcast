import { parseInline, parseMarkdown } from '../lib/format'

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
    <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-300">
      {parseMarkdown(text).map((b, i) =>
        b.type === 'h' ? <h4 key={i} className="eyebrow pt-2"><Inline text={b.text} /></h4>
        : b.type === 'ul' ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
        : <p key={i}><Inline text={b.text} /></p>,
      )}
    </div>
  )
}
