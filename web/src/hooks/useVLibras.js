import { useEffect } from 'react'

// Widget oficial (gov.br). Verificado em 2026-10-31: o script se auto-inicializa e cria o botão
// "VLibras" no canto da tela; ele carrega o aplicativo (vlibras-plugin-app.js) só quando a pessoa clica.
// Por privacidade, nada é carregado antes de a pessoa ativar a opção no painel de acessibilidade.
const SRC = 'https://vlibras.gov.br/app/vlibras-plugin.js'

export function useVLibras(enabled) {
  useEffect(() => {
    if (!enabled || document.getElementById('vlibras-script')) return
    const s = document.createElement('script')
    s.id = 'vlibras-script'
    s.src = SRC
    s.async = true
    s.onload = () => {
      try { new window.VLibras.Widget('https://vlibras.gov.br/app') } catch { /* o script já se inicializa sozinho */ }
    }
    document.body.appendChild(s)
  }, [enabled])
}
