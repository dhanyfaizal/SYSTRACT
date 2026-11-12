import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, AlertTriangle, Info, ListChecks } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { JENIS_AKTIVITAS, formatDurasi, formatJam, statusKelayakan } from '@/lib/bebanBelajar'

const WARNA = { memenuhi: '#059669', kurang: '#d97706', belum_sks: '#64748b' }

/**
 * Ringkasan beban belajar kursus terhadap target SKS (1 SKS = 45 jam, Permendikbudristek 53/2023)
 * dan cakupan CPMK. `muatUlang` diganti nilainya oleh induk setiap kali data kursus berubah.
 */
export default function PanelBebanBelajar({ courseId, muatUlang, onLengkapi }) {
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState(null)

  useEffect(() => {
    if (!courseId) return undefined
    let batal = false
    supabase.rpc('ringkasan_beban_belajar', { p_course: courseId }).then(({ data: r, error }) => {
      if (batal) return
      if (error) { setGalat(error.message); setData(null) } else { setGalat(null); setData(r) }
    })
    return () => { batal = true }
  }, [courseId, muatUlang])

  if (galat) {
    return (
      <div className="card" style={{ padding: 20, fontSize: 13, color: 'var(--gray-600)' }}>
        Ringkasan beban belajar belum tersedia ({galat}).
      </div>
    )
  }
  if (!data) return <div className="card" style={{ padding: 20, height: 120 }} aria-busy="true" />

  const st = statusKelayakan(data)
  const warna = WARNA[st.status]
  const perJenis = JENIS_AKTIVITAS.map((j) => ({ ...j, ...(data.per_jenis?.[j.key] || { jumlah: 0, menit: 0, belum_diisi: 0 }) }))
    .filter((j) => j.jumlah > 0)
  const cpmkKosong = (data.cpmk || []).filter((c) => !c.jumlah_aktivitas)

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} /> Beban belajar &amp; kesetaraan SKS
        </h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: warna, background: `${warna}14`, border: `1px solid ${warna}40`, borderRadius: 99, padding: '4px 10px' }}>
          {st.status === 'memenuhi' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {st.status === 'memenuhi' ? 'Dapat diajukan rekognisi' : st.status === 'kurang' ? 'Belum memenuhi' : 'SKS belum diisi'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--gray-900)' }}>{formatJam(data.total_menit)} jam</span>
        <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          dari target {formatJam(data.target_menit)} jam{data.sks ? ` (${data.sks} SKS × 45 jam)` : ''}
        </span>
      </div>
      <div role="progressbar" aria-valuenow={st.persen} aria-valuemin={0} aria-valuemax={100} aria-label="Pemenuhan beban belajar"
        style={{ height: 8, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden', margin: '10px 0 6px' }}>
        <div style={{ width: `${st.persen}%`, height: '100%', background: warna }} />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-600)' }}>
        {st.pesan} Setara <strong>{data.sks_setara} SKS</strong> menurut jam yang terencana.
      </p>

      {perJenis.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--gray-500)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              <th style={{ padding: '6px 0', fontWeight: 700 }}>Aktivitas</th>
              <th style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right' }}>Jumlah</th>
              <th style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right' }}>Waktu</th>
            </tr>
          </thead>
          <tbody>
            {perJenis.map((j) => (
              <tr key={j.key} style={{ borderTop: '1px solid var(--gray-100)' }}>
                <td style={{ padding: '7px 0', color: 'var(--gray-700)' }}>
                  {j.label}
                  {j.belum_diisi > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#b45309' }}>({j.belum_diisi} belum diisi)</span>}
                </td>
                <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--gray-600)' }}>{j.jumlah}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 600, color: 'var(--gray-800)' }}>{formatDurasi(j.menit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.belum_diisi > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#b45309', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {data.belum_diisi} aktivitas belum punya estimasi waktu sehingga belum terhitung.
        </p>
      )}

      {(data.cpmk || []).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--gray-500)', marginBottom: 6 }}>Cakupan CPMK</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.cpmk.map((c) => (
              <span key={c.kode} title={c.deskripsi}
                style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  color: c.jumlah_aktivitas ? '#065f46' : '#991b1b',
                  background: c.jumlah_aktivitas ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${c.jumlah_aktivitas ? '#a7f3d0' : '#fecaca'}` }}>
                {c.kode} · {c.jumlah_aktivitas ? `${c.jumlah_aktivitas} aktivitas, ${formatDurasi(c.menit)}` : 'belum ada aktivitas'}
              </span>
            ))}
          </div>
          {cpmkKosong.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#991b1b' }}>
              {cpmkKosong.length} CPMK belum didukung aktivitas apa pun — rekognisi butuh setiap CPMK terpetakan.
            </p>
          )}
        </div>
      )}

      {onLengkapi && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-sm ${data.belum_diisi > 0 || cpmkKosong.length ? 'btn-primary' : 'btn-secondary'}`} style={{ gap: 6 }} onClick={onLengkapi}>
            <ListChecks size={13} /> Lengkapi beban &amp; CPMK
          </button>
          <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Isi menit dan CPMK semua aktivitas sekaligus, dengan saran AI.</span>
        </div>
      )}

      <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--gray-500)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        1 SKS = 45 jam belajar per semester (Permendikbudristek No. 53/2023), mencakup video, bacaan, forum, tugas, kuis, dan evaluasi.
      </p>
    </div>
  )
}
