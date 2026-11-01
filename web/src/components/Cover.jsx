import { useState } from 'react'

/**
 * Capa quadrada com placeholder. Pede a imagem com CORS (o archive.org permite) para o service worker
 * guardar uma resposta normal, não "opaca" (que conta ~7 MB da cota por arquivo). Se falhar, tenta de novo
 * e por fim sem CORS, para hospedagens que não o enviam; só então mostra o placeholder.
 */
export default function Cover({ src, alt = '', className = '', style }) {
  const [attempt, setAttempt] = useState({ src, tries: 0 })
  const tries = attempt.src === src ? attempt.tries : 0
  if (!src || tries > 2) return <div role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : 'true'} className={`bg-ink-800 ${className}`} style={style} />
  return (
    <img
      key={tries}
      src={tries >= 1 ? `${src}${src.includes('?') ? '&' : '?'}retry=${tries}` : src}
      crossOrigin={tries <= 1 ? 'anonymous' : undefined}
      alt={alt}
      loading="lazy"
      onError={() => setTimeout(() => setAttempt({ src, tries: tries + 1 }), 800)}
      className={`bg-ink-800 object-cover ${className}`}
      style={style}
    />
  )
}
