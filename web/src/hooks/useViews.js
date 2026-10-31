import { useEffect, useState } from 'react'
import { trackViews } from '../lib/views'

/** Total de acessos da chave (null enquanto carrega ou se o serviço estiver fora). */
export function useViews(key) {
  const [state, setState] = useState({ key: null, value: null })
  useEffect(() => {
    let cancelled = false
    trackViews(key).then((value) => !cancelled && setState({ key, value }))
    return () => { cancelled = true }
  }, [key])
  return state.key === key ? state.value : null
}
