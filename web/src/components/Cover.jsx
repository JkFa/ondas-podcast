import { useState } from 'react'

/**
 * Capa quadrada com placeholder. O archive.org às vezes responde 500 em
 * miniaturas isoladas; tentamos mais uma vez antes de desistir.
 */
export default function Cover({ src, className = '', style }) {
  const [attempt, setAttempt] = useState({ src, tries: 0 })
  const tries = attempt.src === src ? attempt.tries : 0
  if (!src || tries > 1) return <div aria-hidden="true" className={`bg-zinc-800 ${className}`} style={style} />
  return (
    <img
      src={tries === 1 ? `${src}${src.includes('?') ? '&' : '?'}retry=1` : src}
      alt=""
      loading="lazy"
      onError={() => setTimeout(() => setAttempt({ src, tries: tries + 1 }), 1200)}
      className={`bg-zinc-800 object-cover ${className}`}
      style={style}
    />
  )
}
