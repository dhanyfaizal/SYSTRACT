import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, ShieldAlert, SearchX, Search, Loader2, Printer, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rapikanNomor } from '@/lib/sertifikat'
import { formatJam } from '@/lib/bebanBelajar'

// Halaman publik (tanpa login) untuk memeriksa keaslian sertifikat SYSTRACT.
// Data diambil lewat RPC verifikasi_sertifikat: isi yang tercetak di sertifikat, termasuk jam belajar,
// setara SKS, kompetensi, dan rincian modul — dipakai asesor RPL sebagai sumber resmi.

const tgl = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const tglJam = (v) => new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
const label = { color: 'var(--gray-500)', fontSize: 13 }
const judulBagian = { margin: '0 0 10px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--gray-500)' }

export default function VerifikasiSertifikat() {
  const { kode } = useParams()
  const navigate = useNavigate()
  const [input, setInput] = useState(kode || '')
  const [status, setStatus] = useState(kode ? 'memuat' : 'kosong') // kosong | memuat | ada | tidak-ada | galat
  const [data, setData] = useState(null)
  const [diperiksa, setDiperiksa] = useState(null)

  useEffect(() => {
    if (!kode) { setStatus('kosong'); setData(null); return }
    let batal = false
    setStatus('memuat')
    setInput(kode)
    supabase.rpc('verifikasi_sertifikat', { p_kode: rapikanNomor(kode) }).then(({ data: hasil, error }) => {
      if (batal) return
      if (error) { setStatus('galat'); return }
      setData(hasil)
      setDiperiksa(new Date())
      setStatus(hasil ? 'ada' : 'tidak-ada')
    })
    return () => { batal = true }
  }, [kode])

  function cari(e) {
    e.preventDefault()
    const n = rapikanNomor(input)
    if (n) navigate(`/verifikasi/${encodeURIComponent(n)}`)
  }

  const rincian = Array.isArray(data?.rincian) ? data.rincian : []
  const kompetensi = Array.isArray(data?.kompetensi) ? data.kompetensi : []
  const adaJam = data?.total_menit !== null && data?.total_menit !== undefined

  return (
    <div className="verifikasi-halaman" style={{ minHeight: '100vh', background: 'var(--gray-50)', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <style>{`
        @media print {
          .verifikasi-halaman { background: #fff !important; padding: 0 !important; }
          .verifikasi-tanpa-cetak { display: none !important; }
          .verifikasi-halaman .card { box-shadow: none !important; }
        }
      `}</style>
      <div style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gray-900)' }}>Verifikasi Sertifikat</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>SYSTRACT · STIKOM Yos Sudarso Training Center</div>
        </div>

        <form onSubmit={cari} className="card verifikasi-tanpa-cetak" style={{ padding: 16, display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nomor sertifikat, mis. SYSTC.2026.11.7F3A9C21B4"
            aria-label="Nomor sertifikat"
            style={{ flex: '1 1 260px', fontFamily: 'monospace' }}
          />
          <button className="btn btn-primary" type="submit" style={{ gap: 6 }}>
            <Search size={15} /> Periksa
          </button>
        </form>

        {status === 'memuat' && (
          <div className="card" style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={22} style={{ animation: 'spin .8s linear infinite', color: 'var(--gray-400)' }} />
          </div>
        )}

        {status === 'ada' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 24, borderTop: `4px solid ${data.valid ? '#10b981' : '#ef4444'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {data.valid ? <BadgeCheck size={28} color="#10b981" /> : <ShieldAlert size={28} color="#ef4444" />}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: data.valid ? '#065f46' : '#991b1b' }}>
                      {data.valid ? 'Sertifikat asli dan berlaku' : 'Sertifikat sudah dicabut'}
                    </div>
                    {!data.valid && <div style={{ fontSize: 12, color: '#b91c1c' }}>Dicabut pada {tgl(data.dicabut_pada)}</div>}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm verifikasi-tanpa-cetak" onClick={() => window.print()} style={{ gap: 6 }}>
                  <Printer size={14} /> Cetak hasil verifikasi
                </button>
              </div>

              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '8px 16px', fontSize: 13, margin: 0 }}>
                <dt style={label}>Nomor</dt>
                <dd style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all' }}>{data.nomor}</dd>
                <dt style={label}>Diberikan kepada</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{data.nama || '—'}</dd>
                <dt style={label}>Kursus</dt>
                <dd style={{ margin: 0 }}>{data.kursus}{data.kode_kursus ? ` (${data.kode_kursus})` : ''}</dd>
                <dt style={label}>Instruktur</dt>
                <dd style={{ margin: 0 }}>{data.instruktur || '—'}</dd>
                <dt style={label}>Tanggal terbit</dt>
                <dd style={{ margin: 0 }}>{tgl(data.terbit)}</dd>
                {data.skor !== null && data.skor !== undefined && (<>
                  <dt style={label}>Nilai akhir</dt>
                  <dd style={{ margin: 0 }}>{Number(data.skor).toLocaleString('id-ID')} / 100</dd>
                </>)}
                {adaJam && (<>
                  <dt style={label}>Jam belajar</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    {formatJam(data.total_menit)} jam
                    <span style={{ fontWeight: 400, color: 'var(--gray-600)' }}>
                      {data.sks_setara > 0 ? ` · setara ${data.sks_setara} SKS` : ' · belum setara 1 SKS (di bawah 45 jam)'}
                    </span>
                  </dd>
                </>)}
                {kompetensi.length > 0 && (<>
                  <dt style={label}>Kompetensi</dt>
                  <dd style={{ margin: 0 }}>{kompetensi.join(' · ')}</dd>
                </>)}
              </dl>
            </div>

            {rincian.length > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <h2 style={judulBagian}>Rincian program pelatihan</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--gray-500)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        <th scope="col" style={{ padding: '8px 8px 8px 0', fontWeight: 700 }}>No</th>
                        <th scope="col" style={{ padding: 8, fontWeight: 700 }}>Modul</th>
                        <th scope="col" style={{ padding: 8, fontWeight: 700 }}>Topik materi</th>
                        <th scope="col" style={{ padding: '8px 0 8px 8px', fontWeight: 700, textAlign: 'right' }}>Jam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rincian.map((b, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--gray-100)', verticalAlign: 'top' }}>
                          <td style={{ padding: '9px 8px 9px 0', color: 'var(--gray-500)' }}>{i + 1}</td>
                          <td style={{ padding: 9 }}>
                            <div style={{ fontWeight: 700, color: 'var(--gray-800)' }}>{b.nama}</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{b.keterangan}</div>
                          </td>
                          <td style={{ padding: 9, color: 'var(--gray-700)' }}>{b.topik}</td>
                          <td style={{ padding: '9px 0 9px 8px', textAlign: 'right', fontWeight: 700 }}>{formatJam(b.menit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--gray-300)' }}>
                        <td colSpan={3} style={{ padding: '10px 8px 10px 0', fontWeight: 800, textAlign: 'right' }}>Total jam pelatihan</td>
                        <td style={{ padding: '10px 0 10px 8px', fontWeight: 800, textAlign: 'right' }}>{formatJam(data.total_menit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--gray-600)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: 'var(--gray-800)' }}>Catatan untuk asesor RPL.</strong> Data di halaman ini diambil langsung dari
                basis data SYSTRACT dan merupakan sumber resmi; bandingkan dengan berkas sertifikat yang diunggah pemohon.
                Jam belajar mencakup video, bacaan, praktik, forum, tugas, kuis, dan evaluasi; 1 SKS = 45 jam belajar
                (Permendikbudristek No. 53 Tahun 2023). Status sertifikat dapat berubah bila validasi dibatalkan instruktur —
                periksa ulang menjelang pleno.
                {diperiksa && <div style={{ marginTop: 6 }}>Diperiksa pada {tglJam(diperiksa)}.</div>}
              </div>
            </div>
          </div>
        )}

        {status === 'tidak-ada' && (
          <div className="card" style={{ padding: 24, display: 'flex', gap: 10, alignItems: 'center', borderTop: '4px solid #f59e0b' }}>
            <SearchX size={26} color="#d97706" />
            <div>
              <div style={{ fontWeight: 800, color: '#92400e' }}>Nomor sertifikat tidak terdaftar</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Periksa kembali penulisan nomor pada sertifikat.</div>
            </div>
          </div>
        )}

        {status === 'galat' && (
          <div className="card" style={{ padding: 24, color: '#991b1b' }}>
            Layanan verifikasi sedang tidak dapat dihubungi. Coba beberapa saat lagi.
          </div>
        )}
      </div>
    </div>
  )
}
