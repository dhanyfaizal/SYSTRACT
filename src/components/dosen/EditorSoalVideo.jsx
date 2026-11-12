import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Play, Clock } from 'lucide-react'
import { youtubeId } from '@/lib/spaBlocks'
import PanelAiSoalVideo from './PanelAiSoalVideo'
import { buatAdapter,formatDetik, bacaDetik, periksaSoal, saranJumlahSoal, SOAL_MAKS_PER_VIDEO } from '@/lib/videoInteraktif'

// Editor soal di tengah video (dosen): putar video, tekan "Tambah pertanyaan di detik ini"
// saat sebuah konsep selesai dijelaskan, lalu tulis soalnya.

const soalKosong = (detik) => ({ detik: Math.max(1, Math.floor(detik || 1)), pertanyaan: '', opsi: ['', '', '', '', ''], jawaban: 0, penjelasan: '' })

const HURUF = 'ABCDE'
const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)' }

export default function EditorSoalVideo({ url, soal, onChange, konteks = {} }) {
  const mediaRef = useRef(null)
  const adapterRef = useRef(null)
  const [waktu, setWaktu] = useState(0)
  const [durasi, setDurasi] = useState(0)
  const [teksDetik, setTeksDetik] = useState({}) // isian m:ss yang sedang diketik, per indeks

  const id = youtubeId(url)
  const asal = typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? `&origin=${encodeURIComponent(window.location.origin)}` : ''

  useEffect(() => {
    let batal = false
    let timer = null
    adapterRef.current = null
    const el = mediaRef.current
    if (!el) return undefined
    buatAdapter(el).then((a) => {
      if (batal) return
      adapterRef.current = a
      timer = setInterval(() => {
        setWaktu(a.waktu())
        const d = a.durasi()
        if (d) setDurasi(d)
      }, 500)
    }).catch(() => { /* pratinjau gagal: dosen tetap bisa mengetik detik manual */ })
    return () => { batal = true; clearInterval(timer); adapterRef.current?.hapus() }
  }, [url])

  const urut = (daftar) => [...daftar].sort((a, b) => a.detik - b.detik)
  const ubah = (i, perubahan) => onChange(soal.map((s, j) => (j === i ? { ...s, ...perubahan } : s)))
  const penuh = soal.length >= SOAL_MAKS_PER_VIDEO

  const tambahDiDetikIni = () => {
    adapterRef.current?.jeda()
    onChange(urut([...soal, soalKosong(adapterRef.current?.waktu() ?? waktu)]))
  }
  const tambahManual = () => {
    const terakhir = soal.length ? soal[soal.length - 1].detik : 0
    onChange(urut([...soal, soalKosong(terakhir + 60)]))
  }
  const keDetik = (d) => { adapterRef.current?.ke(Math.max(0, d - 3)); adapterRef.current?.putar() }

  const saran = saranJumlahSoal(durasi)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12, background: '#fafafa' }}>
      <div>
        <strong style={{ fontSize: 12, color: 'var(--gray-800)' }}>Pertanyaan di tengah video</strong>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Putar video, lalu tekan <em>Tambah pertanyaan di detik ini</em> tepat setelah sebuah konsep selesai dijelaskan.
          Video peserta akan berhenti di detik itu dan tidak bisa dilanjutkan sebelum soal dijawab benar.
          {saran ? ` Saran untuk video ${formatDetik(durasi)}: sekitar ${saran} pertanyaan.` : ''}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 420, aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        {id ? (
          <iframe
            key={url}
            ref={mediaRef}
            src={`https://www.youtube.com/embed/${id}?rel=0&enablejsapi=1&playsinline=1${asal}`}
            title="Pratinjau video"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <video key={url} ref={mediaRef} src={url} controls preload="metadata" style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-xs" style={{ gap: 4, background: 'var(--indigo-600)' }} onClick={tambahDiDetikIni} disabled={penuh}>
          <Plus size={11} /> Tambah pertanyaan di detik ini ({formatDetik(waktu)})
        </button>
        <button type="button" className="btn btn-ghost btn-xs" style={{ gap: 4 }} onClick={tambahManual} disabled={penuh}>
          <Plus size={11} /> Tambah manual
        </button>
        {penuh && <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Maksimal {SOAL_MAKS_PER_VIDEO} pertanyaan per video.</span>}
      </div>

      <PanelAiSoalVideo
        durasi={durasi}
        konteks={konteks}
        sisaKuota={SOAL_MAKS_PER_VIDEO - soal.length}
        onHasil={(baru) => onChange(urut([...soal, ...baru]).slice(0, SOAL_MAKS_PER_VIDEO))}
      />

      {soal.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>
          Belum ada pertanyaan. Tanpa pertanyaan, video tampil biasa dan peserta bisa memutarnya bebas.
        </p>
      )}

      {soal.map((s, i) => {
        const galat = periksaSoal(s, durasi)
        return (
          <div key={i} style={{ background: '#fff', border: `1px solid ${galat ? '#FCA5A5' : 'var(--gray-200)'}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--indigo-600)' }}>Pertanyaan {i + 1}</span>
              <Clock size={11} color="var(--gray-500)" aria-hidden="true" />
              <label style={LABEL} htmlFor={`detik-${i}`}>muncul di</label>
              <input
                id={`detik-${i}`}
                className="input"
                style={{ width: 72, padding: '3px 6px', fontSize: 12, borderRadius: 6 }}
                value={teksDetik[i] ?? formatDetik(s.detik)}
                onChange={(e) => setTeksDetik({ ...teksDetik, [i]: e.target.value })}
                onBlur={() => {
                  const d = bacaDetik(teksDetik[i])
                  const sisa = { ...teksDetik }
                  delete sisa[i]
                  setTeksDetik(sisa)
                  if (Number.isFinite(d) && d >= 1) onChange(urut(soal.map((x, j) => (j === i ? { ...x, detik: d } : x))))
                }}
                placeholder="m:ss"
              />
              <button type="button" className="btn btn-ghost btn-xs" style={{ gap: 3, fontSize: 11 }} onClick={() => keDetik(s.detik)} title="Putar beberapa detik sebelum titik ini">
                <Play size={10} /> Cek di video
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-xs" style={{ marginLeft: 'auto' }} onClick={() => onChange(soal.filter((_, j) => j !== i))} title="Hapus pertanyaan" aria-label={`Hapus pertanyaan ${i + 1}`}>
                <Trash2 size={12} color="var(--red-600)" />
              </button>
            </div>
            <textarea
              className="input"
              rows={2}
              style={{ fontSize: 12, padding: 6, borderRadius: 6, resize: 'vertical' }}
              value={s.pertanyaan}
              onChange={(e) => ubah(i, { pertanyaan: e.target.value })}
              placeholder="Tulis pertanyaan tentang bagian video sebelum detik ini"
              aria-label={`Teks pertanyaan ${i + 1}`}
            />
            <span style={LABEL}>Pilihan jawaban (tandai yang benar):</span>
            {HURUF.split('').map((h, oi) => (
              <label key={oi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name={`jawaban-${i}`} checked={s.jawaban === oi} onChange={() => ubah(i, { jawaban: oi })} aria-label={`Pilihan ${h} benar`} />
                <span style={{ fontSize: 11, fontWeight: 700, width: 12 }}>{h}</span>
                <input
                  className="input"
                  style={{ flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6 }}
                  value={s.opsi[oi] ?? ''}
                  onChange={(e) => { const opsi = [...s.opsi]; opsi[oi] = e.target.value; ubah(i, { opsi }) }}
                  placeholder={`Pilihan ${h}`}
                />
              </label>
            ))}
            <input
              className="input"
              style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6 }}
              value={s.penjelasan}
              onChange={(e) => ubah(i, { penjelasan: e.target.value })}
              placeholder="Penjelasan singkat jawaban benar (opsional, ditampilkan setelah menjawab)"
              aria-label={`Penjelasan pertanyaan ${i + 1}`}
            />
            {galat && <span style={{ fontSize: 11, color: 'var(--red-600)' }}>{galat}</span>}
          </div>
        )
      })}
    </div>
  )
}
