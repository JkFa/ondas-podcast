import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { announce } from '../lib/announce'
import { t } from '../strings'

/**
 * Registra o service worker e expõe: `needRefresh` (há versão nova pronta; trocar só quando a pessoa quiser,
 * para não interromper um episódio), `update()` e o prompt de instalação (`install`, quando o navegador permite).
 */
export function usePwa() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [installEvent, setInstallEvent] = useState(null)
  const updateSW = useRef(null)

  useEffect(() => {
    updateSW.current = registerSW({
      immediate: true,
      onNeedRefresh: () => { setNeedRefresh(true); announce(t.pwa.updateReady) },
      onOfflineReady: () => announce(t.pwa.offlineReady),
    })
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setInstallEvent(null))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const update = useCallback(() => updateSW.current?.(true), [])
  const install = useCallback(async () => {
    if (!installEvent) return
    installEvent.prompt()
    await installEvent.userChoice.catch(() => {})
    setInstallEvent(null)
  }, [installEvent])
  return { needRefresh, update, canInstall: !!installEvent, install }
}

/** iPhone/iPad (inclusive iPadOS que se apresenta como Mac) e se já está instalado na tela de início. */
export function iosInfo() {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
  return { ios, standalone }
}
