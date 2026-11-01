import { Mail, Share2 } from 'lucide-react'
import { siBluesky, siFacebook, siInstagram, siThreads, siTelegram, siTiktok, siWhatsapp, siX } from 'simple-icons'

// Logos do pacote simple-icons (CC0; as marcas pertencem aos respectivos donos). Usamos a versão de uma
// cor só (currentColor), permitida pelas diretrizes de marca, para manter o contraste nos 4 temas.
// LinkedIn, Podverse, Fountain e Amazon Music não existem no pacote: ficam com ícone genérico.
const ICONS = { whatsapp: siWhatsapp, x: siX, facebook: siFacebook, telegram: siTelegram, threads: siThreads, bluesky: siBluesky, instagram: siInstagram, tiktok: siTiktok }

export default function NetworkIcon({ id, size = 20 }) {
  const icon = ICONS[id]
  if (icon) {
    return (
      <svg role="img" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
        <path d={icon.path} />
      </svg>
    )
  }
  const Fallback = id === 'email' ? Mail : Share2
  return <Fallback size={size} aria-hidden="true" />
}
