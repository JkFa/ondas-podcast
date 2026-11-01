import { WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useOnline } from '../hooks/useOnline'
import { announce } from '../lib/announce'
import { paths } from '../hooks/useRoute'
import { t } from '../strings'

/**
 * Faixa de estado: avisa quando a conexão cai ("Sem conexão. Você pode ouvir os episódios baixados.") e
 * oferece atualizar o app quando há versão nova (sem recarregar sozinho no meio de um episódio).
 */
export default function StatusBar({ needRefresh, onUpdate }) {
  const online = useOnline()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; if (online) return }
    announce(online ? t.pwa.backOnline : t.pwa.lostOnline)
  }, [online])

  if (online && !needRefresh) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[35] flex flex-col items-center gap-2 pr-14 lg:left-24">
      {!online && (
        <div data-testid="offline-banner" className="pointer-events-auto glass flex max-w-xl items-center gap-3 rounded-2xl bg-ink-900/95 px-4 py-2.5 text-sm shadow-xl">
          <WifiOff size={18} className="shrink-0 text-signal" aria-hidden="true" />
          <span>{t.pwa.offlineBanner}</span>
          <a href={paths.downloads} className="shrink-0 font-medium text-signal underline-offset-2 hover:underline">{t.pwa.seeDownloads}</a>
        </div>
      )}
      {needRefresh && (
        <div className="pointer-events-auto glass flex max-w-xl items-center gap-3 rounded-2xl bg-ink-900/95 px-4 py-2.5 text-sm shadow-xl">
          <span>{t.pwa.updateReady}. {t.pwa.updateHint}</span>
          <button onClick={onUpdate} className="press min-h-11 shrink-0 rounded-xl bg-signal px-4 font-semibold text-ink-950 hover:bg-signal-hover">{t.pwa.update}</button>
        </div>
      )}
    </div>
  )
}
