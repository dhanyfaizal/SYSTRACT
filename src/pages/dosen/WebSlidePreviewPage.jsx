import { useEffect, useState } from 'react'
import WebSlidePlayer from '@/components/mahasiswa/WebSlidePlayer'

// Tampilan SPA di tab sendiri (pratinjau dosen dan "Buka di tab baru" peserta).
// Memakai halaman aplikasi (bukan file blob:) agar video YouTube bisa diputar dan soal video tetap aktif.
export default function WebSlidePreviewPage() {
  const [previewData, setPreviewData] = useState(null)

  useEffect(() => {
    const raw = localStorage.getItem('webslide_preview_data')
    if (raw) {
      try {
        setPreviewData(JSON.parse(raw))
      } catch (e) {
        console.error('Failed to parse preview data:', e)
      }
    }
  }, [])

  if (!previewData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: 'var(--gray-600)', fontSize: 14 }}>
        Memuat preview presentasi...
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#f1f5f9', overflow: 'hidden' }}>
      <WebSlidePlayer
        courseName={previewData.courseName}
        prodiName={previewData.prodiName}
        meetingNo={previewData.weekNumber}
        slideData={previewData.webslideData}
        kunciProgres={previewData.kunciProgres || null}
        tinggi="100vh"
        onClose={() => window.close()}
      />
    </div>
  )
}
