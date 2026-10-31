import { useCallback, useState } from 'react'
import { load, save } from '../lib/storage'

/** useState espelhado em localStorage (chave `ondas:v1:<key>`). */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => load(key, initial))
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? next(prev) : next
        save(key, v)
        return v
      })
    },
    [key],
  )
  return [value, set]
}
