import { useEffect, useState } from 'react'
import { X, Loader2, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Laporan progres satu materi SPA untuk pengampu: waktu baca, soal video, latihan, jawaban salah,
// dan status selesai per peserta. Data dinilai di server (laporan_progres_materi).

const fmtMenit = (detik) => {
  const d = Math.max(0, Math.round(detik || 0))
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`
}

const fmtWaktu = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function Angka({ nilai, total }) {
  if (!total) return <span style={{ color: 'var(--gray-400)' }}>—</span>
  const beres = nilai >= total
  return <strong style={{ color: beres ? '#047857' : '#b45309' }}>{nilai}/{total}</strong>
}

export default function LaporanProgresMateri({ materi, onClose }) {
  const [baris, setBaris] = useState(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    let batal = false
    supabase.rpc('laporan_progres_materi', { p_material_id: materi.id }).then(({ data, error }) => {
      if (batal) return
      if (error) setGalat(error.message)
      else setBaris(data || [])
    })
    return () => { batal = true }
  }, [materi.id])

  const ringkas = baris && {
    total: baris.length,
    selesai: baris.filter((b) => b.selesai).length,
    mulai: baris.filter((b) => b.terakhir).length,
    salah: baris.reduce((n, b) => n + (b.jawaban_salah || 0), 0),
  }

  const unduhCsv = () => {
    const kepala = ['Nama', 'NIM', 'Detik baca', 'Target baca', 'Soal video benar', 'Soal video total', 'Latihan benar', 'Latihan total', 'Jawaban salah', 'Syarat terpenuhi', 'Selesai', 'Aktivitas terakhir']
    const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const isi = baris.map((b) => [b.nama, b.nim, b.baca_detik, b.baca_target, b.video_benar, b.video_total, b.latihan_benar, b.latihan_total, b.jawaban_salah, b.syarat_terpenuhi ? 'ya' : 'tidak', b.selesai ? 'ya' : 'tidak', b.terakhir || ''].map(sel).join(','))
    const blob = new Blob([[kepala.map(sel).join(','), ...isi].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `progres-${(materi.title || 'materi').slice(0, 40).replace(/[^\w-]+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Progres peserta">
      <div className="modal" style={{ maxWidth: 980, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <span className="modal-title">Progres peserta</span>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{materi.title}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Tutup"><X size={14} /></button>
        </div>

        <div className="modal-body" style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!baris && !galat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-500)', fontSize: 13 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat laporan…</div>
          )}
          {galat && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>Laporan tidak dapat dimuat: {galat}</p>}

          {ringkas && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  ['Peserta', ringkas.total],
                  ['Sudah mulai', ringkas.mulai],
                  ['Selesai', ringkas.selesai],
                  ['Total jawaban salah', ringkas.salah],
                ].map(([l, v]) => (
                  <div key={l} style={{ flex: '1 1 140px', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-900)' }}>{v}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>
                Waktu baca dicatat server sesuai waktu nyata saat peserta aktif di halaman materi. Syarat dianggap terpenuhi bila waktu baca mencapai 75% dari target, dan semua soal video serta latihan dijawab benar.
              </p>
              {baris.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)' }}>Belum ada peserta yang disetujui di kursus ini.</p>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--gray-200)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                        {['Peserta', 'Waktu baca', 'Soal video', 'Latihan', 'Jawaban salah', 'Status', 'Aktivitas terakhir'].map((h) => (
                          <th key={h} scope="col" style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--gray-200)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {baris.map((b) => (
                        <tr key={b.student_id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '9px 12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{b.nama || 'Tanpa nama'}</div>
                            {b.nim && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{b.nim}</div>}
                          </td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: b.baca_detik >= Math.floor(b.baca_target * 0.75) ? '#047857' : '#b45309' }}>{fmtMenit(b.baca_detik)}</strong>
                            <span style={{ color: 'var(--gray-500)' }}> / {fmtMenit(b.baca_target)}</span>
                          </td>
                          <td style={{ padding: '9px 12px' }}><Angka nilai={b.video_benar} total={b.video_total} /></td>
                          <td style={{ padding: '9px 12px' }}><Angka nilai={b.latihan_benar} total={b.latihan_total} /></td>
                          <td style={{ padding: '9px 12px', color: b.jawaban_salah ? '#b42318' : 'var(--gray-500)', fontWeight: b.jawaban_salah ? 700 : 400 }}>{b.jawaban_salah}</td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            {b.selesai
                              ? <span style={{ fontWeight: 700, color: '#047857' }}>✓ Selesai</span>
                              : b.syarat_terpenuhi
                                ? <span style={{ fontWeight: 600, color: '#1d4ed8' }}>Siap ditandai</span>
                                : b.terakhir ? <span style={{ color: '#b45309', fontWeight: 600 }}>Sedang belajar</span>
                                  : <span style={{ color: 'var(--gray-400)' }}>Belum mulai</span>}
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{fmtWaktu(b.terakhir)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {baris?.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={unduhCsv}><Download size={13} /> Unduh CSV</button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
