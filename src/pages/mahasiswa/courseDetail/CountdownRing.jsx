// Cincin hitung mundur waktu belajar aktif.
export default function CountdownRing({ seconds, total, dijeda = false }) {
  const r = 12, circ = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(1, Math.max(0, (total - seconds) / total)) : 1
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const warna = dijeda ? '#94a3b8' : '#f59e0b'
  return (
    <div style={{ width: 28, height: 28, flexShrink: 0, position: 'relative' }} aria-hidden="true">
      <svg width="28" height="28" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx="14" cy="14" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        <circle cx="14" cy="14" r={r} fill="none" stroke={warna} strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6.5, fontWeight: 800, color: dijeda ? '#64748b' : '#d97706', lineHeight: 1 }}>
        {mins}:{String(secs).padStart(2, '0')}
      </div>
    </div>
  )
}
