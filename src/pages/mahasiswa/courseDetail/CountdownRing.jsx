import { COUNTDOWN_SEC } from './materiHelpers'


// Countdown Ring SVG component
export default function CountdownRing({ seconds }) {
  const r = 12, circ = 2 * Math.PI * r
  const pct = ((COUNTDOWN_SEC - seconds) / COUNTDOWN_SEC)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return (
    <div style={{ width: 28, height: 28, flexShrink: 0, position: 'relative' }}>
      <svg width="28" height="28" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx="14" cy="14" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="#f59e0b" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6.5, fontWeight: 800, color: '#d97706', lineHeight: 1 }}>
        {mins}:{String(secs).padStart(2, '0')}
      </div>
    </div>
  )
}
