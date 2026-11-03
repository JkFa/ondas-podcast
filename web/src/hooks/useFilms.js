import { useEffect, useState } from 'react'
import { validFilms } from '../lib/films'

// A lista de filmes (films.json, ~100 kB) só é baixada quando alguém abre a seção, e uma vez por visita.
let promise = null
function fetchFilms() {
  promise ??= fetch(`${import.meta.env.BASE_URL}films.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then((data) => validFilms(data.films))
    .catch((e) => { promise = null; throw e })
  return promise
}

/** { status: 'idle' | 'loading' | 'ready' | 'error', films } — `wanted` liga o download. */
export function useFilms(wanted) {
  const [state, setState] = useState({ status: 'idle', films: [] })
  useEffect(() => {
    if (!wanted || state.status !== 'idle') return
    fetchFilms().then((films) => setState({ status: 'ready', films }), () => setState({ status: 'error', films: [] }))
  }, [wanted, state.status])
  return wanted && state.status === 'idle' ? { status: 'loading', films: [] } : state
}
