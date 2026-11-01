import { useEffect, useState } from 'react'
import { onAnnounce } from '../lib/announce'
import { t } from '../strings'

/** Região aria-live educada: lê mudanças de estado sem tirar o foco de onde a pessoa está. */
export default function LiveRegion() {
  const [message, setMessage] = useState('')
  useEffect(
    () =>
      onAnnounce((msg) => {
        setMessage('') // limpa antes para o mesmo texto ser lido de novo
        setTimeout(() => setMessage(msg), 60)
      }),
    [],
  )
  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label={t.live.region} className="sr-only">
      {message}
    </div>
  )
}
