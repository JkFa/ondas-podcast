// Card vertical 1080×1920 (formato de Stories do Instagram e do TikTok), desenhado em canvas
// no visual do Ondas: capa, título, autor, onda e endereço.
const W = 1080
const H = 1920
const BG = '#0b0b14'
const SIGNAL = '#c6f432'

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // o archive.org envia CORS nas capas; sem isso o canvas ficaria "sujo" e não exportaria
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`
  }
  return lines
}

/** Devolve um Blob PNG 1080×1920. `cover` pode faltar ou falhar: aí o card usa um bloco com a cor de destaque. */
export async function renderStoryCard({ title, author, cover, accent = '#6d5dfc', host }) {
  await Promise.all([
    document.fonts?.load("700 80px 'Bricolage Grotesque'").catch(() => {}),
    document.fonts?.load("500 40px 'Inter'").catch(() => {}),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 520, 60, W / 2, 520, 900)
  glow.addColorStop(0, `${accent}aa`)
  glow.addColorStop(1, `${accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // capa
  const size = 760
  const x = (W - size) / 2
  const y = 250
  const img = cover ? await loadImage(cover) : null
  ctx.save()
  roundRect(ctx, x, y, size, size, 56)
  ctx.clip()
  if (img) ctx.drawImage(img, x, y, size, size)
  else { ctx.fillStyle = accent; ctx.fillRect(x, y, size, size) }
  ctx.restore()

  // onda
  ctx.strokeStyle = SIGNAL
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let px = 140; px <= W - 140; px += 4) {
    const py = 1150 + Math.sin(((px - 140) / (W - 280)) * Math.PI * 4) * 46
    if (px === 140) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  // título e autor
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f6f6fc'
  ctx.font = "700 84px 'Bricolage Grotesque', 'Inter', sans-serif"
  const lines = wrap(ctx, title, 900, 4)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 1290 + i * 96))
  const afterTitle = 1290 + lines.length * 96
  if (author) {
    ctx.fillStyle = '#9a9ab8'
    ctx.font = "500 46px 'Inter', sans-serif"
    ctx.fillText(wrap(ctx, author, 900, 1)[0], W / 2, afterTitle + 40)
  }

  // chamada e endereço
  ctx.fillStyle = SIGNAL
  roundRect(ctx, 200, 1700, W - 400, 110, 55)
  ctx.fill()
  ctx.fillStyle = BG
  ctx.font = "700 44px 'Bricolage Grotesque', 'Inter', sans-serif"
  ctx.fillText(`Ouça no Ondas · ${host}`, W / 2, 1771)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas vazio'))), 'image/png'))
}
