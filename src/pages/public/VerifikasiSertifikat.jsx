import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, ShieldAlert, SearchX, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rapikanNomor } from '@/lib/sertifikat'

// Halaman publik (tanpa login) untuk memeriksa keaslian sertifikat SYSTRACT.
// Data diambil lewat RPC verifikasi_sertifikat, yang hanya mengembalikan isi yang tercetak di sertifikat.

const tgl = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

export default function VerifikasiSertifikat() {
  const { kode } = useParams()
  const navigate = useNavigate()
  const [input, setInput] = useState(kode || '')
  const [status, setStatus] = useState(kode ? 'memuat' : 'kosong') // kosong | memuat | ada | tidak-ada | galat
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!kode) { setStatus('kosong'); setData(null); return }
    let batal = false
    setStatus('memuat')
    setInput(kode)
    supabase.rpc('verifikasi_sertifikat', { p_kode: rapikanNomor(kode) }).then(({ data: hasil, error }) => {
      if (batal) return
      if (error) { setStatus('galat'); return }
      setData(hasil)
      setStatus(hasil ? 'ada' : 'tidak-ada')
    })
    return () => { batal = true }
  }, [kode])

  function cari(e) {
    e.preventDefault()
    const n = rapikanNomor(input)
    if (n) navigate(`/verifikasi/${encodeURIComponent(n)}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gray-900)' }}>Verifikasi Sertifikat</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>SYSTRACT · STIKOM Yos Sudarso Training Center</div>
        </div>

        <form onSubmit={cari} className="card" style={{ padding: 16, display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nomor sertifikat, mis. SYSTC.2026.11.7F3A9C21B4"
            aria-label="Nomor sertifikat"
            style={{ flex: 1, fontFamily: 'monospace' }}
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
          <div className="card" style={{ padding: 24, borderTop: `4px solid ${data.valid ? '#10b981' : '#ef4444'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              {data.valid
                ? <BadgeCheck size={28} color="#10b981" />
                : <ShieldAlert size={28} color="#ef4444" />}
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: data.valid ? '#065f46' : '#991b1b' }}>
                  {data.valid ? 'Sertifikat asli dan berlaku' : 'Sertifikat sudah dicabut'}
                </div>
                {!data.valid && (
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>Dicabut pada {tgl(data.dicabut_pada)}</div>
                )}
              </div>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 16px', fontSize: 13, margin: 0 }}>
              <dt style={{ color: 'var(--gray-500)' }}>Nomor</dt>
              <dd style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700 }}>{data.nomor}</dd>
              <dt style={{ color: 'var(--gray-500)' }}>Diberikan kepada</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{data.nama || '—'}</dd>
              <dt style={{ color: 'var(--gray-500)' }}>Kursus</dt>
              <dd style={{ margin: 0 }}>{data.kursus}{data.kode_kursus ? ` (${data.kode_kursus})` : ''}</dd>
              <dt style={{ color: 'var(--gray-500)' }}>Instruktur</dt>
              <dd style={{ margin: 0 }}>{data.instruktur || '—'}</dd>
              <dt style={{ color: 'var(--gray-500)' }}>Tanggal terbit</dt>
              <dd style={{ margin: 0 }}>{tgl(data.terbit)}</dd>
              {data.skor !== null && data.skor !== undefined && (<>
                <dt style={{ color: 'var(--gray-500)' }}>Nilai evaluasi</dt>
                <dd style={{ margin: 0 }}>{Number(data.skor).toLocaleString('id-ID')} / 100</dd>
              </>)}
            </dl>
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
