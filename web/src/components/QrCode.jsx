import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import { t } from '../strings'

/** QR code em SVG (gerado no navegador, sem serviço externo). Fundo branco e módulos escuros: lê bem em qualquer tema. */
export default function QrCode({ value, size = 224 }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    const cell = 4
    const margin = 4 * cell
    const total = n * cell + margin * 2
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${margin + c * cell} ${margin + r * cell}h${cell}v${cell}h-${cell}z`
    return { d, total }
  }, [value])
  return (
    <svg role="img" aria-label={t.subscribe.qrAlt(value)} viewBox={`0 0 ${svg.total} ${svg.total}`} width={size} height={size} className="rounded-2xl bg-white" shapeRendering="crispEdges">
      <path d={svg.d} fill="#0b0b14" />
    </svg>
  )
}
