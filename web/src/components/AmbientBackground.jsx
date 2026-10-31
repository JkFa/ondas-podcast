/** Gradientes radiais desfocados tingidos pelo accent; --accent é animada via @property. */
export default function AmbientBackground({ color }) {
  const blob = 'absolute rounded-full blur-3xl'
  const tint = (pct) => `radial-gradient(circle, color-mix(in oklab, var(--accent) ${pct}%, transparent), transparent 68%)`
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950"
      style={{ '--accent': color, transition: '--accent 800ms ease' }}
    >
      <div className={`${blob} -top-40 -left-32 h-[34rem] w-[34rem]`} style={{ background: tint(38) }} />
      <div className={`${blob} top-1/3 -right-40 h-[30rem] w-[30rem]`} style={{ background: tint(26) }} />
      <div className={`${blob} -bottom-48 left-1/4 h-[28rem] w-[28rem]`} style={{ background: tint(20) }} />
    </div>
  )
}
