// Gera páginas HTML estáticas por obra e por episódio, com Open Graph / Twitter Card, para que links
// colados no WhatsApp, X, Telegram etc. mostrem capa, título e descrição (o GitHub Pages só serve arquivos
// estáticos e uma SPA não tem meta tags por rota). Cada página redireciona para a rota do app.
//
//   dist/obra/<slug>/index.html        → #/livro/<slug>
//   dist/episodio/<id>/index.html      → #/livro/<slug>?ep=<id>[&t=<segundos>]   (aceita #t=12m30s e ?t=750)
//
// Não usa a rede: roda em segundos a partir de public/catalog.json. Uso: node scripts/build-share-pages.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildBooks, partLabel } from '../src/lib/books.js'
import { site } from './site.mjs'
import { clip, escHtml, fmt, synopsis } from './text.mjs'

const root = new URL('../', import.meta.url)
const { episodes } = JSON.parse(await readFile(new URL('public/catalog.json', root), 'utf8'))
const books = buildBooks(episodes)

const esc = escHtml

const page = ({ url, title, description, image, audio, redirect, heading, lead, cta }) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Ondas</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Ondas">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta property="og:image:alt" content="${esc(`Capa de ${title}`)}">\n` : ''}${audio ? `<meta property="og:audio" content="${esc(audio)}">\n<meta property="og:audio:type" content="audio/mpeg">\n` : ''}<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">\n` : ''}<meta name="theme-color" content="#0b0b14">
<noscript><meta http-equiv="refresh" content="0;url=${esc(redirect.up + redirect.hash)}"></noscript>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0b0b14;color:#f6f6fc;display:grid;place-items:center;min-height:100vh;padding:24px}main{max-width:32rem;text-align:center}img{width:min(70vw,260px);aspect-ratio:1;object-fit:cover;border-radius:24px}h1{font-size:1.75rem;line-height:1.15;margin:1rem 0 .5rem}p{color:#b9b9d2}a{display:inline-block;margin-top:1rem;padding:.8rem 1.4rem;border-radius:999px;background:#c6f432;color:#0b0b14;font-weight:700;text-decoration:none}a:focus-visible{outline:3px solid #f6f6fc;outline-offset:3px}</style>
</head>
<body>
<main>
${image ? `<img src="${esc(image)}" alt="Capa de ${esc(title)}" width="260" height="260">\n` : ''}<h1>${esc(heading)}</h1>
<p>${esc(lead)}</p>
<a href="${esc(redirect.up + redirect.hash)}">${esc(cta)}</a>
</main>
<script>
// Leva para o app. Aceita #t=12m30s, ?t=12m30s e ?t=750 (segundos); o hash não chega ao servidor, então fica só no navegador.
(function () {
  var base = new URL(${JSON.stringify(redirect.up)}, location.href).href + ${JSON.stringify(redirect.hash)}; // relativo: vale em qualquer endereço
  var needsTime = ${JSON.stringify(redirect.withTime)};
  var m = /[#&?]t=([^&#]+)/.exec(location.hash + location.search);
  var sec = 0;
  if (m) {
    var v = m[1].toLowerCase();
    if (/^\\d+(\\.\\d+)?$/.test(v)) sec = Math.floor(Number(v));
    else { var p = /^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/.exec(v); if (p) sec = (+p[1] || 0) * 3600 + (+p[2] || 0) * 60 + (+p[3] || 0); }
  }
  location.replace(base + (needsTime && sec > 0 ? '&t=' + sec : ''));
})();
</script>
</body>
</html>
`

let count = 0
const write = async (path, html) => {
  const dir = new URL(`dist/${path}/`, root)
  await mkdir(dir, { recursive: true })
  await writeFile(new URL('index.html', dir), html)
  count++
}

for (const b of books) {
  const first = b.parts[0]
  const n = b.parts.length
  const meta = `${b.isSeries ? `${n} ${n === 1 ? 'parte' : 'partes'} · ` : ''}${fmt(b.duration)}`
  const lead = clip(synopsis(b.description), 200) || `${b.title}, de ${b.author}.`
  await write(`obra/${encodeURIComponent(b.slug)}`, page({
    url: `${site}obra/${encodeURIComponent(b.slug)}/`,
    title: b.title,
    description: clip(`${b.author} · ${meta}. ${lead}`, 200),
    image: b.cover,
    audio: first.audioUrl,
    redirect: { up: '../../', hash: `#/livro/${encodeURIComponent(b.slug)}`, withTime: false },
    heading: b.title,
    lead: `${b.author} · ${meta}`,
    cta: 'Ouvir no Ondas',
  }))
  for (const ep of b.parts) {
    const label = b.isSeries ? partLabel(b, ep) : null
    const idx = b.parts.indexOf(ep) + 1
    const what = b.isSeries ? `Parte ${idx} de ${n}: ${label}` : ep.title
    await write(`episodio/${encodeURIComponent(ep.id)}`, page({
      url: `${site}episodio/${encodeURIComponent(ep.id)}/`,
      title: b.isSeries ? `${b.title} — ${label}` : ep.title,
      description: clip(`${what}. ${b.author} · ${fmt(ep.duration)}. ${lead}`, 200),
      image: ep.cover || b.cover,
      audio: ep.audioUrl,
      redirect: { up: '../../', hash: `#/livro/${encodeURIComponent(b.slug)}?ep=${encodeURIComponent(ep.id)}`, withTime: true },
      heading: b.isSeries ? `${b.title} — ${label}` : ep.title,
      lead: `${b.author} · ${fmt(ep.duration)}`,
      cta: 'Ouvir no Ondas',
    }))
  }
}
// Página de assinatura (compartilhar o catálogo): prévia própria e redireciona para #/assinar
await write('assinar', page({
  url: `${site}assinar/`,
  title: 'Ouça no seu app',
  description: 'Assine o Ondas no app de podcasts que você já usa: Apple Podcasts, Overcast, Pocket Casts, AntennaPod e outros. Áudios e podcasts indies arquivados e prontos para ouvir.',
  image: `${site}cover-1400.png`,
  redirect: { up: '../', hash: '#/assinar', withTime: false },
  heading: 'Ouça no seu app',
  lead: 'Assine o Ondas no app de podcasts que você já usa.',
  cta: 'Escolher o app',
}))
console.log(`[share] ${count} páginas em dist/obra e dist/episodio (${books.length} obras, ${episodes.length} episódios) + assinar`)
