import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

// Pemilih kursus untuk halaman instruktur (Tugas, Ujian, Forum, Bank Soal, Presensi).
//
// Bila halaman dibuka dari sub-menu kursus di sidebar (URL membawa ?courseId=…),
// kursusnya sudah jelas dari sidebar dan judul header, jadi pemilih tidak ditampilkan
// dan kursus aktif mengikuti URL. Tanpa ?courseId, pemilih tampil seperti biasa.
export default function CoursePicker({ courses, courseId, onChange, inline = false }) {
  const [searchParams] = useSearchParams()
  const paramId = searchParams.get('courseId')
  const dariSidebar = Boolean(paramId) && courses.some((c) => c.id === paramId)

  // Ikuti perubahan ?courseId (mis. berpindah kursus lewat sidebar tanpa remount).
  useEffect(() => {
    if (dariSidebar && paramId !== courseId) onChange(paramId)
  }, [dariSidebar, paramId, courseId, onChange])

  if (dariSidebar) return null

  const select = (
    <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
      <select className="input" aria-label="Pilih kursus" value={courseId} onChange={(e) => onChange(e.target.value)} style={{ paddingRight: 30 }}>
        {courses.length === 0 && <option value="">Belum ada kursus</option>}
        {courses.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
      </select>
      <ChevronDown size={13} aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--gray-400)' }} />
    </div>
  )

  if (inline) return select

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 20 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>
        <span style={{ flexShrink: 0 }}>Kursus</span>
        {select}
      </label>
    </div>
  )
}
