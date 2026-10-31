import { Eye } from 'lucide-react'
import { useViews } from '../hooks/useViews'

/** "1.234 acessos"; some enquanto não há número (carregando ou serviço indisponível). */
export default function ViewCount({ viewKey, label = 'acessos', className = '' }) {
  const n = useViews(viewKey)
  if (n === null) return <span aria-hidden="true" className={`inline-block h-5 w-24 ${className}`} />
  const singular = label.replace(/s$/, '')
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums text-ink-400 ${className}`} title="Contagem pública, uma visita por sessão do navegador">
      <Eye size={14} aria-hidden="true" />
      {n.toLocaleString('pt-BR')} {n === 1 ? singular : label}
    </span>
  )
}
