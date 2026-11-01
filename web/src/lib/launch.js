// Abre o app de podcasts por esquema de URL (podcast://, overcast://, pktc://…) e avisa se NÃO parece ter aberto.
// Quando o app abre, o navegador perde o foco / a página fica oculta; se isso não acontecer em ~1,5 s, mostramos
// o plano B (loja do app, copiar o feed). Em links web (https), apenas abre em nova aba.
export const OPEN_TIMEOUT_MS = 1500

/** `window.__ondasLaunch` é uma emenda de teste: o Playwright não consegue observar navegações para esquemas externos. */
export function launch(url, { onFail, timeout = OPEN_TIMEOUT_MS } = {}) {
  if (typeof window.__ondasLaunch === 'function') return window.__ondasLaunch(url, { onFail, timeout })
  if (/^https?:/i.test(url)) {
    window.open(url, '_blank', 'noopener')
    return
  }
  let left = false
  const mark = () => { left = true }
  const hidden = () => { if (document.hidden) left = true }
  window.addEventListener('blur', mark)
  window.addEventListener('pagehide', mark)
  document.addEventListener('visibilitychange', hidden)
  window.location.href = url
  setTimeout(() => {
    window.removeEventListener('blur', mark)
    window.removeEventListener('pagehide', mark)
    document.removeEventListener('visibilitychange', hidden)
    if (!left) onFail?.()
  }, timeout)
}
