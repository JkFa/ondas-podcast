import { useEffect, useState } from 'react'
import { loadIndex } from '../lib/search'

// O índice (dist/search-index.json) é baixado uma vez, só quando alguém começa a buscar.
let promise = null
function fetchIndex() {
  promise ??= fetch(`${import.meta.env.BASE_URL}search-index.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then(loadIndex)
    .catch((e) => { promise = null; throw e })
  return promise
}

/** { status: 'idle' | 'loading' | 'ready' | 'error', index } — `wanted` liga o download. */
export function useSearchIndex(wanted) {
  const [state, setState] = useState({ status: 'idle', index: null })
  useEffect(() => {
    if (!wanted || state.status !== 'idle') return
    fetchIndex().then((index) => setState({ status: 'ready', index }), () => setState({ status: 'error', index: null }))
  }, [wanted, state.status])
  return wanted && state.status === 'idle' ? { status: 'loading', index: null } : state
}
