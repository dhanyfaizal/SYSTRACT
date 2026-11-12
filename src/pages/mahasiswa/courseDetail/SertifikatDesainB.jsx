// Sertifikat SYSTRACT — desain B (Modern Minimal, ornamen cincin).
// Ukuran tetap A4 lanskap 1123 × 794 px (= 297 × 210 mm pada 96 dpi), dipakai apa adanya
// untuk cetak & PDF; di layar diperkecil oleh SkalaHalaman.
import { useEffect, useRef, useState } from 'react'
import { formatJam } from '@/lib/bebanBelajar'

export const LEBAR = 1123
export const TINGGI = 794
const NAVY = '#1e293b'
const AKSEN = '#eab308'
const FONT = "'Plus Jakarta Sans', 'Inter', sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
const label = { margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: '#475569', fontWeight: 700 }

const tanggal = (v, gaya = 'long') => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: gaya, year: 'numeric' }) : '—')

/** Pola cincin bertumpuk sebagai latar. `latar` = warna dasar di bawahnya (untuk efek tumpukan). */
function PolaCincin({ id, garis, latar, opacity, width, height, geserX = 0 }) {
  const cincin = (cx, cy) => [10, 22, 34, 46].map((r) => <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)
  return (
    <svg aria-hidden="true" width={width} height={height} style={{ position: 'absolute', inset: 0, opacity }}>
      <defs>
        <pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse" x={geserX}>
          <g fill="none" stroke={garis} strokeWidth="5">{cincin(0, 0)}{cincin(96, 0)}{cincin(0, 96)}{cincin(96, 96)}</g>
          <circle cx="48" cy="48" r="48" fill={latar} />
          <g fill="none" stroke={garis} strokeWidth="5">{cincin(48, 48)}</g>
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  )
}

function Pita({ sisi }) {
  return (
    <div style={{ width: 88, flexShrink: 0, background: NAVY, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <PolaCincin id={`pita-${sisi}`} garis="#ffffff" latar={NAVY} opacity={0.4} width={88} height={TINGGI} geserX={-4} />
      <div style={{ position: 'absolute', top: 0, [sisi === 'kiri' ? 'right' : 'left']: 0, width: 6, height: '100%', background: AKSEN }} />
      <p style={{ position: 'relative', margin: 0, writingMode: 'vertical-rl', transform: sisi === 'kiri' ? 'rotate(180deg)' : 'none', color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 12, background: NAVY, padding: '18px 8px' }}>SYSTRACT</p>
    </div>
  )
}

function Logo({ besar = 60 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <img src="/logo-systract.png" alt="Logo SYSTRACT" style={{ width: Math.round(besar * 0.87), height: Math.round(besar * 0.87), objectFit: 'contain', display: 'block' }} />
      <img src="/logo-stikom.webp" alt="Logo STIKOM Yos Sudarso" style={{ width: besar, height: besar, objectFit: 'contain', display: 'block' }} />
    </div>
  )
}

function KartuQr({ qr, nomor, kecil = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: kecil ? 12 : 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: kecil ? 10 : 12, padding: kecil ? '10px 14px 10px 10px' : '14px 18px 14px 14px', boxShadow: '0 1px 2px rgba(15,23,42,.06)' }}>
      {qr ? <img src={qr} alt="QR verifikasi sertifikat" style={{ width: kecil ? 64 : 84, height: kecil ? 64 : 84 }} />
          : <div style={{ width: kecil ? 64 : 84, height: kecil ? 64 : 84, background: '#f1f5f9' }} />}
      <div>
        {!kecil && <p style={label}>Nomor sertifikat</p>}
        {!kecil && <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700, fontFamily: MONO, color: '#0f172a' }}>{nomor || 'menunggu penerbitan'}</p>}
        <p style={{ margin: kecil ? 0 : '8px 0 0', fontSize: 12, color: '#475569', maxWidth: kecil ? 120 : 'none', lineHeight: 1.4 }}>Pindai untuk melihat kredensial</p>
      </div>
    </div>
  )
}

/** Sisi depan. */
export function SertifikatDepan({ nama, kursus, kompetensi = [], skor, terbit, totalMenit, sksSetara, nomor, qr }) {
  const durasi = totalMenit ? `${formatJam(totalMenit)} jam` : '—'
  return (
    <div className="printable-certificate" style={{ width: LEBAR, height: TINGGI, boxSizing: 'border-box', display: 'flex', background: '#fff', fontFamily: FONT, color: '#0f172a', fontFeatureSettings: "'tnum' 1", position: 'relative', overflow: 'hidden' }}>
      <Pita sisi="kiri" />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PolaCincin id="pola-depan" garis="#1e3a8a" latar="#ffffff" opacity={0.06} width={LEBAR - 88} height={TINGGI} />
        <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '56px 72px 48px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ paddingTop: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#475569' }}>Sertifikat Kompetensi</p>
              <div style={{ width: 48, height: 4, background: AKSEN, marginTop: 12 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY }}>STIKOM Yos Sudarso</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Training Center</p>
              </div>
              <Logo besar={60} />
            </div>
          </div>

          <div style={{ marginTop: 64, maxWidth: 680 }}>
            <p style={{ margin: 0, fontSize: 16, color: '#475569' }}>Dengan bangga diberikan kepada</p>
            <p style={{ margin: '12px 0 0', fontSize: nama && nama.length > 28 ? 52 : 64, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.04, color: '#0f172a' }}>{nama || 'Peserta'}</p>
            <p style={{ margin: '28px 0 0', fontSize: 16, lineHeight: 1.55, color: '#475569' }}>sebagai bentuk pengakuan atas pencapaian kualifikasi serta penyelesaian seluruh modul dan ujian kelayakan pada program pelatihan</p>
            <p style={{ margin: '6px 0 0', fontSize: kursus && kursus.length > 48 ? 24 : 30, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.2, color: NAVY }}>{kursus}</p>
            {kompetensi.length > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 14, color: '#475569' }}>Kompetensi yang dicapai: {kompetensi.join(' · ')}</p>
            )}
          </div>

          <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 32, maxWidth: 600 }}>
            <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: 12 }}>
              <p style={label}>Nilai akhir</p>
              <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700 }}>{skor !== null && skor !== undefined ? `${Number(skor).toLocaleString('id-ID')} / 100` : '—'}</p>
            </div>
            <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: 12 }}>
              <p style={label}>Diterbitkan</p>
              <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700 }}>{tanggal(terbit, 'short')}</p>
            </div>
            <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: 12 }}>
              <p style={label}>Waktu belajar</p>
              <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700 }}>{durasi}</p>
              {sksSetara > 0 && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>setara {sksSetara} SKS</p>}
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ height: 48 }} />
              <div style={{ width: 232, height: 1, background: '#0f172a' }} />
              <p style={{ margin: '10px 0 0', fontWeight: 700, fontSize: 15 }}>Dhany Faizal Racma</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>Direktur SYSTRACT</p>
            </div>
            <KartuQr qr={qr} nomor={nomor} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Sisi belakang: rincian modul, topik, dan jam. */
export function SertifikatBelakang({ nama, kursus, nomor, terbit, totalMenit, sksSetara, rincian = [], qr }) {
  const baris = Array.isArray(rincian) ? rincian : []
  const padat = baris.length > 7
  return (
    <div className="printable-transcript" style={{ width: LEBAR, height: TINGGI, boxSizing: 'border-box', display: 'flex', background: '#fff', fontFamily: FONT, color: '#0f172a', fontFeatureSettings: "'tnum' 1", position: 'relative', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PolaCincin id="pola-belakang" garis="#1e3a8a" latar="#ffffff" opacity={0.06} width={LEBAR - 88} height={TINGGI} />
        <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '48px 64px 40px 72px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#475569' }}>Rincian Program Pelatihan</p>
              <div style={{ width: 48, height: 4, background: AKSEN, marginTop: 12 }} />
              <p style={{ margin: '18px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{kursus}</p>
            </div>
            <Logo besar={50} />
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24, maxWidth: 780 }}>
            <div><p style={label}>Nama peserta</p><p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700 }}>{nama}</p></div>
            <div><p style={label}>Nomor sertifikat</p><p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, fontFamily: MONO }}>{nomor || '—'}</p></div>
            <div><p style={label}>Diterbitkan</p><p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700 }}>{tanggal(terbit)}</p></div>
          </div>

          <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '48px 250px minmax(0,1fr) 84px', background: NAVY, color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2 }}>
              <p style={{ margin: 0, padding: '11px 14px' }}>No</p>
              <p style={{ margin: 0, padding: '11px 14px' }}>Modul</p>
              <p style={{ margin: 0, padding: '11px 14px' }}>Topik materi</p>
              <p style={{ margin: 0, padding: '11px 14px', textAlign: 'right' }}>Jam</p>
            </div>
            {baris.length === 0 && (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 13, color: '#475569' }}>Rincian belum tersedia untuk sertifikat ini.</p>
            )}
            {baris.map((b, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px 250px minmax(0,1fr) 84px', borderTop: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : '#fff' }}>
                <p style={{ margin: 0, padding: padat ? '8px 14px' : '11px 14px', fontSize: 13, color: '#475569', fontWeight: 600 }}>{i + 1}</p>
                <div style={{ padding: padat ? '8px 14px' : '11px 14px' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{b.nama}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#475569' }}>{b.keterangan}</p>
                </div>
                <p style={{ margin: 0, padding: padat ? '8px 14px' : '11px 14px', fontSize: 12, lineHeight: 1.45, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.topik}</p>
                <p style={{ margin: 0, padding: padat ? '8px 14px' : '11px 14px', fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{formatJam(b.menit)}</p>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px', borderTop: `2px solid ${NAVY}`, background: '#f8fafc' }}>
              <p style={{ margin: 0, padding: '11px 14px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, textAlign: 'right' }}>
                Total jam pelatihan{sksSetara > 0 ? ` · setara ${sksSetara} SKS` : ''}
              </p>
              <p style={{ margin: 0, padding: '11px 14px', fontSize: 15, fontWeight: 800, textAlign: 'right' }}>{formatJam(totalMenit)}</p>
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, paddingTop: 16 }}>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: '#475569', maxWidth: 580 }}>
              Rincian ini merupakan bagian tidak terpisahkan dari Sertifikat Kompetensi nomor {nomor || '—'}. Jam belajar mencakup
              video, bacaan, praktik, forum diskusi, tugas, kuis, dan evaluasi. 1 SKS = 45 jam belajar (Permendikbudristek No. 53 Tahun 2023).
            </p>
            <KartuQr qr={qr} nomor={nomor} kecil />
          </div>
        </div>
      </div>
      <Pita sisi="kanan" />
    </div>
  )
}

/** Memperkecil halaman berukuran tetap agar pas lebar wadah di layar (cetak & PDF tetap ukuran asli). */
export function SkalaHalaman({ children }) {
  const ref = useRef(null)
  const [skala, setSkala] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ukur = () => setSkala(Math.min(1, el.clientWidth / LEBAR))
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="sert-wadah" style={{ width: '100%', maxWidth: LEBAR, margin: '0 auto', height: TINGGI * skala, flexShrink: 0, overflow: 'hidden', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -15px rgba(0,0,0,.12)' }}>
      <div className="sert-skala" style={{ width: LEBAR, height: TINGGI, transform: `scale(${skala})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
