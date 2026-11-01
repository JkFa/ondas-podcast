import { useEffect, useSyncExternalStore } from 'react'
import { getSnapshot, reconcile, subscribe } from '../lib/downloads'

let started = false
/** Estado dos downloads: { meta: {id → info}, jobs: {id → {status, loaded, total, error}}, persisted }. */
export function useDownloads() {
  useEffect(() => {
    if (!started) { started = true; reconcile() }
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
