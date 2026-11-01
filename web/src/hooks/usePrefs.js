import { useSyncExternalStore } from 'react'
import { getPrefs, setPrefs, subscribePrefs } from '../lib/prefs'

export function usePrefs() {
  return [useSyncExternalStore(subscribePrefs, getPrefs, getPrefs), setPrefs]
}
