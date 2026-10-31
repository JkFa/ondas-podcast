export const NEUTRAL_ACCENT = '#6d5dfc'

export const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function hexToRgb(hex) {
  const n = parseInt((isHex(hex) ? hex : NEUTRAL_ACCENT).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

function saturation(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

/**
 * Cor vibrante dominante de uma imagem, via canvas 32×32. Retorna null se o
 * canvas for "tainted" (sem CORS) ou a imagem falhar — o chamador usa o neutro.
 */
export async function extractAccent(url) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 32, 32)
    const { data } = ctx.getImageData(0, 0, 32, 32) // lança se tainted
    const buckets = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum < 30 || lum > 225 || saturation(r, g, b) < 0.25) continue
      const key = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6) // 4 níveis por canal
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
      e.n++; e.r += r; e.g += g; e.b += b
      buckets.set(key, e)
    }
    const best = [...buckets.values()]
      .filter((e) => e.n >= 4)
      .map((e) => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n), e.n])
      .sort((a, b) => saturation(b[0], b[1], b[2]) * Math.sqrt(b[3]) - saturation(a[0], a[1], a[2]) * Math.sqrt(a[3]))[0]
    return best ? toHex(best[0], best[1], best[2]) : null
  } catch {
    return null
  }
}
