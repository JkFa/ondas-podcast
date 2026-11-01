// Links e textos de compartilhamento (puros, testados em share.test.js).
//
// URLs de compartilhamento por rede, verificadas em 2026-10-31 (curl -L; cada uma abre a tela de
// compartilhar ou o login da rede mantendo o parâmetro de intenção):
//   WhatsApp  https://wa.me/?text=            → api.whatsapp.com/send (200)
//   X         https://x.com/intent/post       → 200
//   Facebook  https://www.facebook.com/sharer/sharer.php?u=   → 200
//   Telegram  https://t.me/share/url          → 200
//   Threads   https://www.threads.com/intent/post  (threads.net redireciona para threads.com) → 200
//   Bluesky   https://bsky.app/intent/compose?text=  → GET 200 (HEAD devolve 404; é uma rota do app)
//   LinkedIn  https://www.linkedin.com/sharing/share-offsite/?url=  → login com a intenção preservada
// Instagram e TikTok NÃO têm URL web de compartilhamento: usamos card para Stories + link copiado.

const enc = encodeURIComponent

/** 750 → "12m30s"; 3725 → "1h2m5s"; 45 → "45s"; 0 → "0s". */
export function timeToken(sec) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}${r || (!h && !m) ? `${r}s` : ''}`
}

/** "12m30s" | "1h2m5s" | "750" → segundos (null se inválido). */
export function parseTimeToken(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(Number(v))
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)
  if (!m || !v) return null
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)
}

const withSlash = (base) => base.replace(/\/?$/, '/')

/** Página estática com prévia (Open Graph) que redireciona para o app: .../episodio/<id>/#t=12m30s */
export const episodeShareUrl = (base, id, sec = 0) => `${withSlash(base)}episodio/${enc(id)}/${sec >= 1 ? `#t=${timeToken(sec)}` : ''}`
export const bookShareUrl = (base, slug) => `${withSlash(base)}obra/${enc(slug)}/`
export const embedUrl = (base, id) => `${withSlash(base)}embed/?ep=${enc(id)}`

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Código <iframe> para blogs e sites. */
export function embedCode(base, ep) {
  return `<iframe src="${escAttr(embedUrl(base, ep.id))}" title="${escAttr(`Ondas: ${ep.title}`)}" width="100%" height="170" style="border:0;border-radius:16px" loading="lazy" allow="autoplay"></iframe>`
}

/** Redes com URL de compartilhamento na web. `build({url, text, title})` devolve o href. */
export const NETWORKS = [
  { id: 'whatsapp', name: 'WhatsApp', build: ({ url, text }) => `https://wa.me/?text=${enc(`${text} ${url}`)}` },
  { id: 'x', name: 'X', build: ({ url, text }) => `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
  { id: 'facebook', name: 'Facebook', build: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  { id: 'telegram', name: 'Telegram', build: ({ url, text }) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
  { id: 'threads', name: 'Threads', build: ({ url, text }) => `https://www.threads.com/intent/post?text=${enc(`${text} ${url}`)}` },
  { id: 'bluesky', name: 'Bluesky', build: ({ url, text }) => `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}` },
  { id: 'linkedin', name: 'LinkedIn', build: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
  { id: 'email', name: 'E-mail', build: ({ url, text, title }) => `mailto:?subject=${enc(title)}&body=${enc(`${text}\n\n${url}`)}`, external: false },
]

/** Redes sem URL de compartilhamento: viram "card para Stories" + link copiado. */
export const STORY_NETWORKS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'tiktok', name: 'TikTok' },
]

/** Texto curto que acompanha o link. */
export function shareText({ kind, title, author, part, startSec }) {
  const from = startSec >= 1 ? ` (a partir de ${timeToken(startSec).replace(/(\d+)h/, '$1 h ').replace(/(\d+)m/, '$1 min ').replace(/(\d+)s/, '$1 s').trim()})` : ''
  if (kind === 'site') return 'Ondas: áudios e podcasts indies arquivados e prontos para ouvir.'
  if (kind === 'subscribe') return 'Assine o Ondas no seu app de podcasts: áudios e podcasts indies arquivados e prontos para ouvir.'
  return `Ouça “${title}”${author ? `, de ${author}` : ''}${part ? ` — ${part}` : ''}${from} no Ondas.`
}
