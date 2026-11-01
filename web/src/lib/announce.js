// Avisos para leitores de tela: qualquer parte do app chama announce('texto'); o componente
// <LiveRegion /> (aria-live="polite") mostra a mensagem. Sem estado global de React.
const EVENT = 'ondas:announce'

export function announce(message) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: String(message) }))
}

export const onAnnounce = (fn) => {
  const handler = (e) => fn(e.detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
