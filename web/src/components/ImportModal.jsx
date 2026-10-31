import { CheckCircle2, Download, Loader2, Upload, X, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import { extractAccent, isHex } from '../lib/color'
import { SCHEMA_VERSION, parseCatalogJson, validateEpisode } from '../lib/catalog'
import { chaptersToText, parseChapters } from '../lib/format'

const EMPTY = { title: '', show: '', cover: '', accentColor: '', description: '', chapters: '', audioUrl: '', duration: 0, archiveId: '', license: '' }

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

/** "17:07" | "1027.21" | 1027 → segundos */
function parseLength(v) {
  if (v == null) return 0
  if (String(v).includes(':')) return String(v).split(':').reduce((a, n) => a * 60 + Number(n), 0)
  return Math.round(Number(v)) || 0
}

/** Aceita URL .mp3 de /download/, URL /details/ ou identificador solto. */
function parseInput(raw) {
  const text = raw.trim()
  const dl = text.match(/archive\.org\/download\/([^/]+)\/([^?#]+\.mp3)/i)
  if (dl) return { id: dl[1], file: decodeURIComponent(dl[2]) }
  const det = text.match(/archive\.org\/details\/([^/?#]+)/i)
  if (det) return { id: det[1], file: null }
  return /^[\w.-]+$/.test(text) ? { id: text, file: null } : null
}

const input = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm placeholder:text-ink-500 focus:border-white/30 focus:outline-none'

function Status({ s }) {
  if (!s) return null
  const tone = s.kind === 'err' ? 'text-rose-300' : s.kind === 'ok' ? 'text-emerald-300' : 'text-ink-400'
  return (
    <p role="status" className={`flex items-center gap-2 text-xs ${tone}`}>
      {s.kind === 'busy' ? <Loader2 size={14} className="animate-spin" /> : s.kind === 'ok' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {s.text}
    </p>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  )
}

export default function ImportModal({ open, onClose, onSave, onExport, onImportFile }) {
  const ref = useRef(null)
  const fileRef = useRef(null)
  const [source, setSource] = useState('')
  const [files, setFiles] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [json, setJson] = useState('')
  const [status, setStatus] = useState(null) // {kind:'ok'|'err'|'busy', text}
  const [audioTest, setAudioTest] = useState(null)
  // Campos que o formulário não edita (transcrição, data, fonte) vêm do JSON colado.
  const [pasted, setPasted] = useState(null)
  const lookupSeq = useRef(0) // descarta respostas de buscas antigas

  useDialog(ref, open, onClose)
  if (!open) return null

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  /** Preenche o formulário a partir dos metadados do item no archive.org. */
  async function lookup(parsed, fileName, seq) {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(parsed.id)}`)
    const data = await res.json()
    if (seq !== lookupSeq.current) return
    if (!data.metadata) throw new Error('Item não encontrado no archive.org.')
    const mp3s = data.files.filter((f) => /\.mp3$/i.test(f.name) && !/_(64|128)kb\.mp3$/i.test(f.name))
    if (!mp3s.length) throw new Error('Nenhum arquivo .mp3 neste item.')
    setFiles(mp3s)
    const file = mp3s.find((f) => f.name === fileName) || (mp3s.length === 1 ? mp3s[0] : null)
    const img = data.files.find((f) => /^cover\.(jpe?g|png)$/i.test(f.name))
      || data.files.find((f) => f.format === 'JPEG' && !/thumb/i.test(f.name))
      || { name: '__ia_thumb.jpg' }
    const m = data.metadata
    const cover = `https://archive.org/download/${parsed.id}/${encodeURIComponent(img.name)}`
    const pick = (v) => (Array.isArray(v) ? v[0] : v) || ''
    setForm((f) => ({
      ...f,
      archiveId: parsed.id,
      title: f.title || pick(m.title),
      show: f.show || pick(m.creator),
      description: f.description || String(pick(m.description)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      license: pick(m.licenseurl),
      cover,
      ...(file && { audioUrl: `https://archive.org/download/${parsed.id}/${encodeURIComponent(file.name)}`, duration: parseLength(file.length) }),
    }))
    extractAccent(cover).then((c) => c && setForm((f) => (f.accentColor ? f : { ...f, accentColor: c })))
    setStatus({ kind: 'ok', text: file ? 'Metadados carregados.' : 'Escolha o arquivo de áudio abaixo.' })
  }

  async function onLookup(e) {
    e.preventDefault()
    const parsed = parseInput(source)
    if (!parsed) return setStatus({ kind: 'err', text: 'Informe um identificador ou URL do archive.org.' })
    setStatus({ kind: 'busy', text: 'Consultando archive.org…' })
    const seq = ++lookupSeq.current
    try {
      await lookup(parsed, parsed.file, seq)
    } catch (err) {
      if (seq !== lookupSeq.current) return
      setStatus({ kind: 'err', text: err.message || 'Falha ao consultar o archive.org.' })
    }
  }

  function pickFile(name) {
    const f = files.find((x) => x.name === name)
    if (!f) return
    setStatus(null)
    setForm((s) => ({ ...s, audioUrl: `https://archive.org/download/${s.archiveId}/${encodeURIComponent(f.name)}`, duration: parseLength(f.length) }))
  }

  function applyJson() {
    try {
      const eps = parseCatalogJson(json, 'JSON colado')
      if (!eps.length) return setStatus({ kind: 'err', text: 'JSON sem episódios válidos (veja o console).' })
      if (eps.length > 1) {
        onSave(eps)
        return setStatus({ kind: 'ok', text: `${eps.length} episódios importados.` })
      }
      const e = eps[0]
      setForm({ ...EMPTY, ...e, chapters: chaptersToText(e.chapters), accentColor: e.accentColor || '', license: e.license || '', archiveId: e.archiveId || '' })
      setPasted(e)
      setStatus({ kind: 'ok', text: 'Formulário preenchido a partir do JSON.' })
    } catch {
      setStatus({ kind: 'err', text: 'JSON inválido.' })
    }
  }

  function testAudio() {
    if (!form.audioUrl) return setAudioTest({ kind: 'err', text: 'Informe a URL do áudio.' })
    setAudioTest({ kind: 'busy', text: 'Testando…' })
    const a = new Audio()
    a.preload = 'metadata'
    const done = (r) => {
      clearTimeout(timer)
      a.onloadedmetadata = a.onerror = null // limpar o src dispara 'error'
      a.removeAttribute('src')
      a.load()
      setAudioTest(r)
    }
    const timer = setTimeout(() => done({ kind: 'err', text: 'Tempo esgotado ao carregar o áudio.' }), 12000)
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration) && !form.duration) setForm((f) => ({ ...f, duration: Math.round(a.duration) }))
      done({ kind: 'ok', text: `Áudio OK (${Math.round(a.duration / 60)} min).` })
    }
    a.onerror = () => done({ kind: 'err', text: 'Não foi possível carregar este áudio.' })
    a.src = form.audioUrl
  }

  function submit(e) {
    e.preventDefault()
    const ep = {
      ...(pasted || {}),
      schemaVersion: SCHEMA_VERSION,
      id: pasted?.id || slug(form.archiveId ? `${form.archiveId}-${form.title}` : form.title),
      title: form.title.trim(),
      show: form.show.trim(),
      description: form.description.trim(),
      audioUrl: form.audioUrl.trim(),
      archiveId: form.archiveId || undefined,
      cover: form.cover.trim() || undefined,
      accentColor: isHex(form.accentColor) ? form.accentColor : undefined,
      duration: Number(form.duration) || 0,
      publishedAt: pasted?.publishedAt || new Date().toISOString(),
      chapters: parseChapters(form.chapters),
      license: form.license || undefined,
      source: pasted?.source || 'local',
    }
    if (!ep.chapters.length) delete ep.chapters
    const errs = validateEpisode(ep)
    if (errs.length) return setStatus({ kind: 'err', text: errs.join('; ') })
    onSave([ep])
    setForm(EMPTY); setFiles([]); setSource(''); setJson(''); setPasted(null); setAudioTest(null); setStatus(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="import-title" className="fade-up flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900/95 backdrop-blur-xl sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="import-title" className="font-display text-2xl">Importar do Archive.org</h2>
          <button onClick={onClose} aria-label="Fechar" className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"><X size={18} /></button>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-2">
            <Field label="Identificador ou URL do .mp3">
              <div className="flex gap-2">
                <input data-autofocus className={input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="ex.: o_alienista_0904_librivox" />
                <button type="button" onClick={onLookup} className="press shrink-0 rounded-xl bg-signal px-4 text-sm font-medium text-ink-950 hover:bg-signal-hover">Buscar</button>
              </div>
            </Field>
            {files.length > 1 && (
              <Field label="Arquivo de áudio">
                <select className={input} value={form.audioUrl ? decodeURIComponent(form.audioUrl.split('/').pop()) : ''} onChange={(e) => pickFile(e.target.value)}>
                  <option value="">Selecione…</option>
                  {files.map((f) => <option key={f.name} value={f.name}>{f.name}{f.length ? ` (${f.length.includes?.(':') ? f.length : Math.round(f.length / 60) + ' min'})` : ''}</option>)}
                </select>
              </Field>
            )}
            <Status s={status} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título"><input required className={input} value={form.title} onChange={set('title')} /></Field>
            <Field label="Programa"><input required className={input} value={form.show} onChange={set('show')} /></Field>
            <Field label="URL do áudio (.mp3)"><input required type="url" className={input} value={form.audioUrl} onChange={set('audioUrl')} /></Field>
            <Field label="Capa (URL)"><input type="url" className={input} value={form.cover} onChange={set('cover')} /></Field>
            <Field label="Cor de destaque">
              <div className="flex gap-2">
                <input type="color" aria-label="Escolher cor" className="h-[2.625rem] w-12 rounded-xl border border-white/10 bg-transparent p-1" value={isHex(form.accentColor) ? form.accentColor : '#6d5dfc'} onChange={set('accentColor')} />
                <input className={input} value={form.accentColor} onChange={set('accentColor')} placeholder="#rrggbb" />
              </div>
            </Field>
            <Field label="Duração (segundos)"><input type="number" min="0" className={input} value={form.duration} onChange={set('duration')} /></Field>
          </div>

          <Field label="Descrição"><textarea rows={3} className={input} value={form.description} onChange={set('description')} /></Field>
          <Field label="Capítulos (um por linha: 00:00 Abertura)"><textarea rows={4} className={`${input} font-mono`} value={form.chapters} onChange={set('chapters')} placeholder={'00:00 Abertura\n05:30 Entrevista'} /></Field>

          <Field label="Ou cole o JSON gerado pelo pipeline">
            <textarea rows={3} className={`${input} font-mono`} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "schemaVersion": 1, "id": "…" }' />
          </Field>
          <button type="button" onClick={applyJson} disabled={!json.trim()} className="press -mt-2 self-start rounded-xl border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-40">Aplicar JSON</button>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={testAudio} className="press rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/10">Testar áudio</button>
            <Status s={audioTest} />
            <button type="submit" className="press ml-auto rounded-xl bg-signal px-5 py-2.5 text-sm font-medium text-ink-950 hover:bg-signal-hover">Salvar episódio</button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <span className="eyebrow mr-auto">Catálogo</span>
            <button type="button" onClick={onExport} className="press flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/10"><Download size={14} /> Exportar catalog.json</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="press flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/10"><Upload size={14} /> Importar catálogo</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f).then((n) => setStatus({ kind: n ? 'ok' : 'err', text: n ? `${n} episódio(s) importado(s).` : 'Nenhum episódio válido no arquivo.' })); e.target.value = '' }} />
          </div>
        </form>
      </div>
    </div>
  )
}
