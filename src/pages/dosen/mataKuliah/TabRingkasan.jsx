// Tab "Ringkasan" kursus untuk instruktur: beban belajar & SKS, deskripsi, daftar pertemuan, info, dan CPMK.
import PanelBebanBelajar from '@/components/dosen/PanelBebanBelajar'

export default function TabRingkasan({ course, materials, onLengkapi }) {
  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {/* Left Column (Main Content) */}
      <div style={{ flex: '2 1 500px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PanelBebanBelajar courseId={course.id} muatUlang={materials} onLengkapi={onLengkapi} />
        
        {/* Deskripsi Kursus */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>Deskripsi Kursus</h3>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--gray-600)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {course.description || 'Deskripsi belum dirumuskan untuk kursus ini. Gunakan tab "Generator RPS & slide (AI)" untuk menyusunnya.'}
          </p>
        </div>

        {/* Yang akan dipelajari: ringkasan materi per pertemuan */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>Yang akan dipelajari</h3>
          {materials.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: 0 }}>
              Belum ada materi. Tambahkan di tab "Silabus & materi".
            </p>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...materials].sort((a,b) => a.week_number - b.week_number).map((m, index) => (
                <li key={m.id || index} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: index ? '1px solid var(--gray-100)' : 'none' }}>
                  <span style={{ flex: '0 0 92px', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', paddingTop: 1 }}>
                    Pertemuan {m.week_number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', lineHeight: 1.4 }}>{m.title}</div>
                    {m.description && (
                      <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2, lineHeight: 1.5 }}>{m.description}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

      </div>

      {/* Right Column (Sidebar Widgets) */}
      <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Data kursus yang benar-benar tersimpan */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 10 }}>Info kursus</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0, fontSize: 13 }}>
            <dt style={{ color: 'var(--gray-500)' }}>Kode</dt><dd style={{ margin: 0, color: 'var(--gray-800)', fontWeight: 600 }}>{course.code}</dd>
            <dt style={{ color: 'var(--gray-500)' }}>Periode</dt><dd style={{ margin: 0, color: 'var(--gray-800)', fontWeight: 600 }}>{course.semester || '–'}</dd>
            <dt style={{ color: 'var(--gray-500)' }}>Materi</dt><dd style={{ margin: 0, color: 'var(--gray-800)', fontWeight: 600 }}>{materials.length}</dd>
            <dt style={{ color: 'var(--gray-500)' }}>Peserta</dt><dd style={{ margin: 0, color: 'var(--gray-800)', fontWeight: 600 }}>{course.enrollments?.[0]?.count || 0}</dd>
          </dl>
        </div>

        {/* Capaian pembelajaran (CPMK) */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 10 }}>Capaian pembelajaran (CPMK)</h3>
          {course.cpmk && course.cpmk.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>
              {course.cpmk.map((c, idx) => <li key={idx}>{c.deskripsi}</li>)}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: 0 }}>Belum ada CPMK.</p>
          )}
        </div>

      </div>
    </div>
  )
}
