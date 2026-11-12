import { Clock, Target } from 'lucide-react'
import { JENIS_MATERI, formatDurasi } from '@/lib/bebanBelajar'

/**
 * Isian bersama untuk materi, tugas, ujian, dan forum:
 * estimasi waktu belajar peserta (menit) dan CPMK yang didukung aktivitas ini.
 *
 * value: { estimasi_menit, cpmk_kode, jenis_aktivitas? }
 * cpmkList: [{ kode, deskripsi }] dari courses.cpmk
 */
export default function BebanBelajarFields({ value, onChange, cpmkList = [], denganJenis = false, petunjukMenit, placeholderMenit }) {
  const dipilih = new Set(value?.cpmk_kode || [])
  const ubah = (patch) => onChange({ ...value, ...patch })
  const toggle = (kode) => {
    const s = new Set(dipilih)
    if (s.has(kode)) s.delete(kode); else s.add(kode)
    ubah({ cpmk_kode: [...s] })
  }
  const menit = value?.estimasi_menit

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--gray-50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>
        <Clock size={14} /> Beban belajar &amp; capaian
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="input-group" style={{ flex: '1 1 160px', margin: 0 }}>
          <label className="input-label" htmlFor="bb-menit">Estimasi waktu peserta (menit)</label>
          <input
            id="bb-menit"
            className="input"
            type="number"
            min={0}
            max={6000}
            step={5}
            placeholder={placeholderMenit ?? 'cth: 90'}
            value={menit ?? ''}
            onChange={(e) => ubah({ estimasi_menit: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })}
          />
          <span className="input-hint">
            {menit ? `≈ ${formatDurasi(menit)}. ` : ''}{petunjukMenit || 'Waktu rata-rata peserta untuk menyelesaikan aktivitas ini.'}
          </span>
        </div>

        {denganJenis && (
          <div className="input-group" style={{ flex: '1 1 160px', margin: 0 }}>
            <label className="input-label" htmlFor="bb-jenis">Jenis aktivitas</label>
            <select id="bb-jenis" className="input" value={value?.jenis_aktivitas || ''} onChange={(e) => ubah({ jenis_aktivitas: e.target.value || null })}>
              <option value="">Otomatis dari lampiran</option>
              {JENIS_MATERI.map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <Target size={13} /> CPMK yang didukung
        </legend>
        {cpmkList.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>
            Kursus ini belum punya CPMK. Rumuskan dulu di tab "Generator RPS &amp; slide (AI)".
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {cpmkList.map((c) => (
              <label key={c.kode} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--gray-700)', cursor: 'pointer' }}>
                <input type="checkbox" checked={dipilih.has(c.kode)} onChange={() => toggle(c.kode)} style={{ marginTop: 2, accentColor: 'var(--indigo-600)' }} />
                <span><strong>{c.kode}</strong> — {c.deskripsi}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  )
}
