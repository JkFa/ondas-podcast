import { useSyncExternalStore } from 'react'

const subscribe = (cb) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
/** true quando o navegador acha que há conexão (navigator.onLine). */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
