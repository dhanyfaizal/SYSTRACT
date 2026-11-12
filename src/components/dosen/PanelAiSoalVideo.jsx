import { useMemo, useState } from 'react'
import { Bot, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateSoalVideo } from '@/lib/ai'
import { formatDetik } from '@/lib/videoInteraktif'
import { uraiTranskrip, transkripUntukAi, jumlahSoalAi, normalkanSoalAi } from '@/lib/transkripVideo'

// Soal video dibuat AI dari transkrip yang ditempel dosen. Hasilnya ditambahkan ke daftar
// sebagai draf: dosen tetap memeriksa (dan bisa "Cek di video") sebelum menyimpan slide.

const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)' }

export default function PanelAiSoalVideo({ durasi = 0, konteks = {}, sisaKuota = 12, onHasil }) {
  const [buka, setBuka] = useState(false)
  const [teks, setTeks] = useState('')
  const [jumlahIsian, setJumlahIsian] = useState('')
  const [memuat, setMemuat] = useState(false)

  const segmen = useMemo(() => uraiTranskrip(teks), [teks])
  const akhirTranskrip = segmen.length ? segmen[segmen.length - 1].detik : 0
  const durasiAcuan = durasi || akhirTranskrip
  const jumlahSaran = Math.min(sisaKuota, jumlahSoalAi(durasiAcuan))
  const jumlah = Math.max(1, Math.min(sisaKuota, Number(jumlahIsian) || jumlahSaran))
  const cukup = segmen.length >= 3

  const buat = async () => {
    if (!cukup || memuat || sisaKuota <= 0) return
    setMemuat(true)
    try {
      const hasil = await generateSoalVideo({
        kursus: konteks.kursus,
        judul: konteks.judul,
        transkrip: transkripUntukAi(segmen),
        jumlah,
        durasi: durasiAcuan,
      })
      const soal = normalkanSoalAi(hasil, { durasi: durasiAcuan }).slice(0, sisaKuota)
      if (soal.length === 0) throw new Error('AI tidak menghasilkan soal yang lengkap. Coba lagi.')
      onHasil(soal)
      toast.success(`${soal.length} pertanyaan ditambahkan. Periksa isi dan detiknya sebelum menyimpan.`)
      setBuka(false)
    } catch (err) {
      toast.error(`Gagal membuat soal: ${err.message}`)
    } finally {
      setMemuat(false)
    }
  }

  return (
    <div style={{ border: '1px dashed var(--indigo-300, #a5b4fc)', borderRadius: 8, background: '#fff' }}>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        style={{ width: '100%', justifyContent: 'space-between', gap: 6, padding: '8px 10px', color: 'var(--indigo-600)' }}
        onClick={() => setBuka(!buka)}
        aria-expanded={buka}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Bot size={12} /> Buat pertanyaan dengan AI dari transkrip video</span>
        {buka ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {buka && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 10px' }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.6 }}>
            <li>Buka video di YouTube, klik <strong>…selengkapnya</strong> di bawah judul, lalu <strong>Tampilkan transkrip</strong>.</li>
            <li>Blok seluruh isi panel transkrip (beserta cap waktunya), salin, lalu tempel di bawah.</li>
            <li>AI menyusun pertanyaan tepat setelah tiap gagasan penting dijelaskan. Periksa hasilnya sebelum menyimpan.</li>
          </ol>
          <textarea
            className="input"
            rows={5}
            style={{ fontSize: 12, padding: 8, borderRadius: 6, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder={'0:00\nSelamat datang di materi sistem pendingin...\n0:07\nPada video ini kita membahas...'}
            aria-label="Transkrip video"
          />
          {teks.trim() && (
            <span style={{ fontSize: 11, color: cukup ? 'var(--gray-500)' : 'var(--red-600)' }}>
              {cukup
                ? `Terbaca ${segmen.length} segmen, ${formatDetik(segmen[0].detik)}–${formatDetik(akhirTranskrip)}.`
                : 'Cap waktu belum terbaca. Pastikan teks yang ditempel memuat cap waktu seperti 0:05 atau 1:02:05.'}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={LABEL} htmlFor="jumlah-soal-ai">Jumlah pertanyaan</label>
            <input
              id="jumlah-soal-ai"
              type="number"
              min={1}
              max={sisaKuota}
              className="input"
              style={{ width: 64, padding: '3px 6px', fontSize: 12, borderRadius: 6 }}
              value={jumlahIsian}
              onChange={(e) => setJumlahIsian(e.target.value)}
              placeholder={String(jumlahSaran)}
            />
            <button type="button" className="btn btn-primary btn-xs" style={{ gap: 4, background: 'var(--indigo-600)' }} onClick={buat} disabled={!cukup || memuat || sisaKuota <= 0}>
              {memuat ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={11} />}
              {memuat ? 'Menyusun pertanyaan…' : `Buat ${jumlah} pertanyaan`}
            </button>
            {sisaKuota <= 0 && <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Kuota pertanyaan video ini sudah penuh.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
