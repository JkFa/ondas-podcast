import { t } from '../strings'
import { Segmented } from './Controls'

const OPTIONS = [
  { value: 'off', label: t.sleep.off },
  { value: '15', label: t.sleep.min(15) },
  { value: '30', label: t.sleep.min(30) },
  { value: '60', label: t.sleep.min(60) },
  { value: 'end', label: t.sleep.endOfPart },
]

/** Timer de soneca: 15/30/60 min ou fim da parte atual. */
export default function SleepTimer({ id, open, engine }) {
  if (!open) return null
  const { sleep, setSleep } = engine
  const value = sleep.mode === 'time' ? String(sleep.minutes) : sleep.mode
  return (
    <div id={id} className="glass rounded-2xl p-4">
      <Segmented
        legend={t.sleep.title}
        value={value}
        options={OPTIONS}
        onChange={(v) => (v === 'off' ? setSleep('off') : v === 'end' ? setSleep('end') : setSleep('time', Number(v)))}
      />
    </div>
  )
}
