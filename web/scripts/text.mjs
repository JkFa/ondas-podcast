// Funções de texto usadas pelos scripts de build (feeds e páginas de compartilhamento).
export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

export const clip = (s, n) => {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`
}

/** "5 min", "1 h 05 min". */
export const fmt = (sec) => {
  const m = Math.max(1, Math.round(sec / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')} min` : ''}`
}

/** Sinopse sem a linha "LibriVox recording of…" (em inglês) e sem markdown. */
export const synopsis = (d) =>
  String(d ?? '')
    .split(/\n{2,}/)
    .filter((p) => !/^LibriVox recording/i.test(p.trim()) && !/^Read in/i.test(p.trim()))
    .join(' ')
    .replace(/\*\*|\[|\]\([^)]*\)|^#+\s*/gm, '')
