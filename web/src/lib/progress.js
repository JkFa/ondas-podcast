export const DONE_RATIO = 0.95

/** Estado de progresso de um episódio: {ratio, resumeAt, done}. */
export function progressInfo(progress, ep) {
  const p = progress[ep.id]
  if (!p || !p.dur) return { ratio: 0, resumeAt: 0, done: false }
  const ratio = Math.min(p.pos / p.dur, 1)
  const done = ratio >= DONE_RATIO
  return { ratio: done ? 1 : ratio, resumeAt: done || p.pos < 5 ? 0 : p.pos, done }
}
