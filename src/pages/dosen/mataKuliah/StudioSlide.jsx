import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Bot, Loader2, Upload, Plus, Video, FileText, ArrowUp, ArrowDown, Trash2, MoreHorizontal, Copy, RefreshCw, Download, ExternalLink, Monitor, Smartphone, Check } from 'lucide-react'
import { prepareDeck, renderSection, SPA_CSS, SPA_LAYOUT_LABELS } from '@/lib/spaBlocks'
import { targetBacaBagian } from '@/lib/bacaBagian'
import { periksaSoal } from '@/lib/videoInteraktif'
import {
  JENIS_SLIDE, sisipkanSlide, slideVideo, spaDariSlideVideo, spaDariSlideKonten, urlVideoValid,
  sinkronSlideSpa, ubahLayoutSpa, hapusSlide, pindahSlide, LAYOUT_DARI_POIN,
} from '@/lib/sisipSlide'
import EditorSoalVideo from '@/components/dosen/EditorSoalVideo'

// Studio slide dosen (layar penuh, 3 panel): daftar slide · pratinjau SPA seperti dilihat peserta ·
// panel pengaturan. Perubahan langsung tampil di pratinjau; tersimpan ke database lewat "Simpan ke Silabus".

const WARNA = { tepi: '#e2e8f0', teks: '#0f172a', redup: '#64748b', ungu: '#4f46e5', unguMuda: '#eef2ff', unguTeks: '#3730a3' }
const TOMBOL = { height: 36, padding: '0 12px', border: `1px solid ${WARNA.tepi}`, borderRadius: 8, background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }
const LABEL = { fontSize: 12, fontWeight: 600, color: '#475569' }
const INPUT = { height: 38, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', width: '100%', boxSizing: 'border-box' }
const NAMA_LAYOUT = { list: 'Daftar', grid: 'Kartu', steps: 'Langkah', accordion: 'Akordion', statement: 'Pernyataan' }

const rapikanPoin = (teks) => String(teks || '').split('\n').map((l) => l.trim()).filter(Boolean)
const soalLima = (soal) => (Array.isArray(soal) ? soal.map((q) => ({ ...q, opsi: [...(q.opsi || []), '', '', '', '', ''].slice(0, 5) })) : [])
const fmtDetik = (d) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`

function Chip({ warna = 'abu', children }) {
  const p = {
    hijau: ['#ecfdf5', '#065f46'], kuning: ['#fffbeb', '#92400e'], merah: ['#fef2f2', '#991b1b'], abu: ['#f1f5f9', '#475569'],
  }[warna]
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 99, background: p[0], color: p[1], whiteSpace: 'nowrap' }}>{children}</span>
}

export default function StudioSlide({
  meeting, courseName, slideOutline, setSlideOutline, webslideData, setWebslideData,
  sibuk = {}, belumDisimpan, konfirmasi,
  onTutup, onSimpan, onGenerateOutline, onGenerateSpa, onPratinjau, onUnduhHtml, onImporFile, onSalinOutline,
  onRegenerateKonten, onRegenerateLayout,
}) {

  const slides = useMemo(() => slideOutline?.slides || [], [slideOutline])
  const [pilih, setPilih] = useState(1)
  const [tab, setTab] = useState('isi')
  const [perangkat, setPerangkat] = useState('laptop')
  const [menu, setMenu] = useState(false)
  const [lokal, setLokal] = useState({ no: null, teks: '' }) // teks poin yang sedang diketik

  const s = slides.find((x) => x.slide_no === pilih) || slides[0] || null
  const no = s?.slide_no
  const idx = s ? slides.indexOf(s) : -1
  const video = slideVideo(s)
  const spaSlides = webslideData?.slides || null
  const spa = spaSlides?.find((x) => x.slide_no === no) || null
  const adaSpa = !!spaSlides?.length
  const kosong = slides.length === 0

  // ── Mutasi (outline & SPA selalu bersamaan) ──
  const terapkan = (outline, spaBaru) => {
    setSlideOutline({ ...(slideOutline || { title: meeting?.title || 'Materi' }), slides: outline })
    if (webslideData && spaBaru) setWebslideData({ ...webslideData, slides: spaBaru })
  }
  const ubah = (perubahan) => {
    if (!s) return
    const baru = { ...s, ...perubahan }
    terapkan(slides.map((x) => (x.slide_no === no ? baru : x)), spaSlides?.map((x) => (x.slide_no === no ? sinkronSlideSpa(x, baru) : x)))
  }
  const sisip = (jenis) => {
    const posisi = kosong ? -1 : idx
    const r = sisipkanSlide(slides, spaSlides, posisi, jenis)
    const isiAwal = jenis === JENIS_SLIDE.video ? { title: 'Video: ', jenis: JENIS_SLIDE.video } : { title: 'Slide baru' }
    const outline = r.outline.map((x) => (x.slide_no === r.nomorBaru ? { ...x, ...isiAwal } : x))
    const spaBaru = r.spa?.map((x) => (x.slide_no === r.nomorBaru ? sinkronSlideSpa(x, outline.find((o) => o.slide_no === r.nomorBaru)) : x))
    terapkan(outline, spaBaru)
    setPilih(r.nomorBaru)
    setTab(jenis === JENIS_SLIDE.video ? 'media' : 'isi')
  }
  const hapus = async () => {
    if (!s) return
    const ok = await konfirmasi({ title: `Hapus slide ${no}?`, message: `"${s.title || 'Tanpa judul'}" akan dihapus dari outline dan tampilan SPA. Perubahan baru permanen setelah Simpan ke Silabus.`, confirmLabel: 'Hapus slide', variant: 'danger' })
    if (!ok) return
    const r = hapusSlide(slides, spaSlides, no)
    terapkan(r.outline, r.spa)
    setPilih(Math.max(1, Math.min(no, r.outline.length)))
  }
  const pindah = (arah) => {
    const r = pindahSlide(slides, spaSlides, no, arah)
    if (!r) return
    terapkan(r.outline, r.spa)
    setPilih(r.nomorBaru)
  }
  const gantiLayout = (layout) => {
    if (!spa) return
    setWebslideData({ ...webslideData, slides: spaSlides.map((x) => (x.slide_no === no ? ubahLayoutSpa(x, s, layout) : x)) })
  }

  // Validasi sebelum menyimpan: slide video wajib punya tautan valid dan soal yang lengkap.
  const simpan = () => {
    for (const x of slides) {
      if (!slideVideo(x)) continue
      if (!urlVideoValid(x.image_url)) {
        setPilih(x.slide_no); setTab('media')
        toast.error(`Slide ${x.slide_no}: isi tautan video YouTube (atau .mp4/.webm) yang valid.`)
        return
      }
      const galat = (x.soal_video || []).map((q, i) => { const g = periksaSoal(q); return g ? `pertanyaan ${i + 1}: ${g}` : '' }).find(Boolean)
      if (galat) {
        setPilih(x.slide_no); setTab('media')
        toast.error(`Slide ${x.slide_no}, ${galat}`)
        return
      }
    }
    if (slides.some((x) => !String(x.title || '').trim())) {
      const x = slides.find((y) => !String(y.title || '').trim())
      setPilih(x.slide_no); setTab('isi')
      toast.error(`Slide ${x.slide_no} belum punya judul.`)
      return
    }
    onSimpan()
  }

  // ── Turunan untuk tampilan ──
  const kontenSekarang = (s?.content || []).join('\n')
  const teksPoin = lokal.no === no && rapikanPoin(lokal.teks).join('\n') === kontenSekarang ? lokal.teks : kontenSekarang

  const spaTampil = spa || (s ? (video ? spaDariSlideVideo(s) : spaDariSlideKonten(s)) : null)
  const htmlPratinjau = useMemo(() => {
    if (!spaTampil) return ''
    return renderSection(prepareDeck({ slides: [spaTampil] }).slides[0], Math.max(0, idx), { meetingNo: meeting?.week_number, courseName })
  }, [spaTampil, idx, meeting?.week_number, courseName])
  const detikBaca = spaTampil ? targetBacaBagian(spaTampil) : 0

  const jumlahVideo = slides.filter(slideVideo).length
  const jumlahSoal = slides.reduce((n, x) => n + (slideVideo(x) ? (x.soal_video || []).length : 0), 0)
  const latihanLama = (spaSlides || []).filter((x) => x.layout === 'quiz' && (x.quiz_items || []).some((q) => (q.options || []).length < 5)).length
  const totalBaca = (spaSlides || []).reduce((n, x) => n + targetBacaBagian(x), 0)

  const tandaSlide = (x) => {
    const sp = spaSlides?.find((y) => y.slide_no === x.slide_no)
    if (slideVideo(x)) return { teks: `${(x.soal_video || []).length} soal`, warna: '#b91c1c', latar: '#fef2f2' }
    if (sp?.layout === 'quiz' && (sp.quiz_items || []).some((q) => (q.options || []).length < 5)) return { teks: '4 pilihan', warna: '#b45309', latar: '#fffbeb' }
    return { teks: sp ? (SPA_LAYOUT_LABELS[sp.layout] || sp.layout) : '—', warna: WARNA.redup, latar: 'transparent' }
  }

  const sibukUmum = sibuk.outline || sibuk.spa
  const sibukSlide = sibuk.kontenNo === no || sibuk.layoutNo === no

  return (
    <div role="dialog" aria-modal="true" aria-label="Studio slide" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: '#f1f5f9', color: '#1e293b', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{SPA_CSS}</style>
      <input id="studio-impor-html" type="file" accept=".html,.htm,text/html" onChange={onImporFile} style={{ display: 'none' }} />

      {/* ── Bilah atas ── */}
      <header style={{ flex: 'none', minHeight: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px', background: '#fff', borderBottom: `1px solid ${WARNA.tepi}`, flexWrap: 'wrap' }}>
        <button type="button" onClick={onTutup} aria-label="Tutup studio" style={{ ...TOMBOL, width: 36, padding: 0, justifyContent: 'center' }}><X size={16} /></button>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: WARNA.ungu, letterSpacing: '.08em' }}>PERTEMUAN {meeting?.week_number} · STUDIO SLIDE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: WARNA.teks, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slideOutline?.title || meeting?.title}</div>
        </div>
        {!kosong && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip warna="hijau">✓ Outline {slides.length} slide</Chip>
            <Chip warna={adaSpa ? 'hijau' : 'kuning'}>{adaSpa ? '✓ Tampilan SPA' : 'Tampilan SPA belum dibangun'}</Chip>
            {jumlahVideo > 0 && <Chip warna={jumlahSoal ? 'hijau' : 'kuning'}>{jumlahVideo} video · {jumlahSoal} soal</Chip>}
            {latihanLama > 0 && <Chip warna="kuning">{latihanLama} latihan masih 4 pilihan</Chip>}
            {adaSpa && <Chip>Baca minimal ±{Math.round(totalBaca / 60)} menit</Chip>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {belumDisimpan && !kosong && <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }} aria-live="polite">● Belum disimpan</span>}
          {adaSpa && <button type="button" onClick={onPratinjau} style={TOMBOL}><ExternalLink size={14} /> Pratinjau peserta</button>}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} style={TOMBOL}><MoreHorizontal size={15} /> Lainnya</button>
            {menu && (
              <div role="menu" onClick={() => setMenu(false)} style={{ position: 'absolute', right: 0, top: 42, width: 240, background: '#fff', border: `1px solid ${WARNA.tepi}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(15,23,42,.15)', padding: 6, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
                {[
                  !kosong && { ikon: <Copy size={14} />, teks: 'Salin outline (teks)', aksi: onSalinOutline },
                  { ikon: <Bot size={14} />, teks: kosong ? 'Generate outline (AI)' : 'Outline ulang (AI)', aksi: onGenerateOutline },
                  !kosong && { ikon: <RefreshCw size={14} />, teks: adaSpa ? 'Rancang ulang semua tampilan SPA (AI)' : 'Bangun tampilan SPA (AI)', aksi: onGenerateSpa },
                  adaSpa && { ikon: <Download size={14} />, teks: 'Unduh file HTML', aksi: onUnduhHtml },
                ].filter(Boolean).map((m) => (
                  <button key={m.teks} type="button" role="menuitem" onClick={m.aksi} disabled={sibukUmum}
                    style={{ ...TOMBOL, border: 0, justifyContent: 'flex-start', width: '100%', height: 36 }}>{m.ikon} {m.teks}</button>
                ))}
                <label htmlFor="studio-impor-html" role="menuitem" style={{ ...TOMBOL, border: 0, justifyContent: 'flex-start', width: '100%', height: 36, boxSizing: 'border-box' }}><Upload size={14} /> Impor file HTML</label>
              </div>
            )}
          </div>
          {!kosong && (
            <button type="button" onClick={simpan} disabled={sibuk.simpan || sibukUmum}
              style={{ ...TOMBOL, height: 40, border: 0, background: WARNA.ungu, color: '#fff', fontWeight: 700, padding: '0 16px', opacity: sibuk.simpan ? 0.7 : 1 }}>
              {sibuk.simpan ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Simpan ke Silabus
            </button>
          )}
        </div>
      </header>

      {/* ── Belum ada outline ── */}
      {kosong ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 520, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            {sibukUmum ? (
              <><Loader2 size={28} color={WARNA.ungu} style={{ animation: 'spin 1s linear infinite' }} /><p style={{ margin: 0, fontSize: 14, color: '#334155' }}>{sibuk.teks || 'AI sedang menyusun outline…'}</p></>
            ) : (
              <>
                <Bot size={36} color="#818cf8" />
                <h2 style={{ margin: 0, fontSize: 20, color: WARNA.teks }}>Mulai menyusun materi pertemuan ini</h2>
                <p style={{ margin: 0, fontSize: 14, color: WARNA.redup, lineHeight: 1.6 }}>AI menyusun outline 15–20 slide dari topik dan kemampuan akhir pertemuan. Anda bisa menyunting, menyisipkan slide video, lalu membangun tampilan SPA untuk peserta.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" onClick={onGenerateOutline} style={{ ...TOMBOL, height: 42, border: 0, background: WARNA.ungu, color: '#fff', fontWeight: 700 }}><Bot size={15} /> Generate outline</button>
                  <label htmlFor="studio-impor-html" style={{ ...TOMBOL, height: 42, boxSizing: "border-box" }}><Upload size={15} /> Impor file HTML</label>
                  <button type="button" onClick={() => sisip(JENIS_SLIDE.konten)} style={{ ...TOMBOL, height: 42 }}><Plus size={15} /> Mulai dari slide kosong</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* ── Kiri: daftar slide ── */}
          <aside aria-label="Daftar slide" style={{ width: 290, flex: 'none', background: '#fff', borderRight: `1px solid ${WARNA.tepi}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Slide ({slides.length})</strong>
              <span style={{ fontSize: 11, color: WARNA.redup }}>klik untuk mengedit</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {slides.map((x) => {
                const aktif = x.slide_no === no
                const t = tandaSlide(x)
                return (
                  <button key={x.slide_no} type="button" onClick={() => setPilih(x.slide_no)} aria-current={aktif}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 8, border: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                      background: aktif ? WARNA.unguMuda : t.latar, boxShadow: aktif ? 'inset 0 0 0 2px #6366f1' : 'none', color: aktif ? WARNA.unguTeks : '#1e293b', fontWeight: aktif ? 700 : 500 }}>
                    <span style={{ width: 22, color: aktif ? '#4338ca' : '#94a3b8', fontWeight: 700 }}>{x.slide_no}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slideVideo(x) ? '▶ ' : ''}{x.title || 'Tanpa judul'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.warna, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t.teks}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: WARNA.redup }}>Sisipkan setelah slide {no}:</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => sisip(JENIS_SLIDE.konten)} style={{ ...TOMBOL, flex: 1, justifyContent: 'center', borderStyle: 'dashed', borderColor: '#94a3b8' }}><FileText size={13} /> Slide konten</button>
                <button type="button" onClick={() => sisip(JENIS_SLIDE.video)} style={{ ...TOMBOL, flex: 1, justifyContent: 'center', borderStyle: 'dashed', borderColor: '#fca5a5', color: '#b91c1c' }}><Video size={13} /> Slide video</button>
              </div>
            </div>
          </aside>

          {/* ── Tengah: pratinjau ── */}
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '16px 22px', gap: 10, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Pratinjau seperti dilihat peserta</span>
              {!adaSpa && <Chip warna="kuning">pratinjau sederhana — tampilan SPA belum dibangun</Chip>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: WARNA.redup }}>{detikBaca ? `Waktu baca minimal ±${fmtDetik(detikBaca)}` : video ? 'Dijaga oleh soal video' : spaTampil?.layout === 'quiz' ? 'Latihan wajib dijawab benar' : ''}</span>
              <div style={{ display: 'flex', border: `1px solid ${WARNA.tepi}`, borderRadius: 8, overflow: 'hidden' }}>
                {[['laptop', <Monitor size={13} key="l" />, 'Laptop'], ['hp', <Smartphone size={13} key="h" />, 'HP']].map(([k, ikon, l]) => (
                  <button key={k} type="button" onClick={() => setPerangkat(k)} aria-pressed={perangkat === k}
                    style={{ height: 30, padding: '0 10px', border: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: perangkat === k ? WARNA.unguMuda : '#fff', color: perangkat === k ? '#4338ca' : '#475569' }}>{ikon}{l}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#e2e8f0', borderRadius: 16, padding: perangkat === 'hp' ? '20px 0' : 0, display: 'flex', justifyContent: 'center' }}>
              <div className="sx" style={{ width: perangkat === 'hp' ? 390 : '100%', boxSizing: 'border-box', padding: perangkat === 'hp' ? 12 : 22, background: '#f6f7f3', borderRadius: perangkat === 'hp' ? 24 : 16, minHeight: '100%', fontSize: perangkat === 'hp' ? 15 : undefined }}
                dangerouslySetInnerHTML={{ __html: htmlPratinjau }} />
            </div>
            {!adaSpa && (
              <button type="button" onClick={onGenerateSpa} disabled={sibukUmum} style={{ ...TOMBOL, alignSelf: 'center', height: 40, border: 0, background: WARNA.ungu, color: '#fff', fontWeight: 700 }}>
                <Bot size={14} /> Bangun tampilan SPA untuk semua slide (AI)
              </button>
            )}
            {sibukUmum && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(241,245,249,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: WARNA.unguTeks }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {sibuk.teks || 'AI sedang bekerja…'}
              </div>
            )}
          </main>

          {/* ── Kanan: pengaturan slide ── */}
          <aside aria-label="Pengaturan slide" style={{ width: 380, flex: 'none', background: '#fff', borderLeft: `1px solid ${WARNA.tepi}`, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${WARNA.tepi}` }}>
              {[['isi', 'Isi'], ['tampilan', 'Tampilan'], ['media', video ? 'Video & soal' : 'Media']].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  style={{ flex: 1, height: 44, border: 0, borderBottom: `2px solid ${tab === k ? WARNA.ungu : 'transparent'}`, background: '#fff', fontSize: 13, fontWeight: tab === k ? 700 : 600, color: tab === k ? '#4338ca' : WARNA.redup, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tab === 'isi' && s && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="studio-judul" style={LABEL}>Judul slide</label>
                    <input id="studio-judul" value={s.title || ''} onChange={(e) => ubah({ title: e.target.value })} style={INPUT} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="studio-poin" style={LABEL}>{video ? 'Pengantar di bawah video (opsional, satu baris per poin)' : 'Poin (satu baris per poin)'}</label>
                    <textarea id="studio-poin" rows={10} value={teksPoin}
                      onChange={(e) => { setLokal({ no, teks: e.target.value }); ubah({ content: rapikanPoin(e.target.value) }) }}
                      style={{ ...INPUT, height: 'auto', padding: 10, lineHeight: 1.6, resize: 'vertical', fontSize: 13 }} />
                    {spa && ['grid', 'steps', 'accordion'].includes(spa.layout) && (
                      <span style={{ fontSize: 11.5, color: WARNA.redup }}>Tulis "Judul: isi" untuk memberi judul kartu/langkah.</span>
                    )}
                    {spa && ['table', 'stats', 'discussion', 'quiz'].includes(spa.layout) && (
                      <span style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', padding: '6px 8px', borderRadius: 6 }}>
                        Isi tampilan {SPA_LAYOUT_LABELS[spa.layout]} disusun AI. Setelah mengubah poin, tekan "Pilihkan layout (AI)" di tab Tampilan agar ikut diperbarui.
                      </span>
                    )}
                  </div>
                  {!video && (
                    <button type="button" onClick={() => onRegenerateKonten(no, s.title, s.content)} disabled={sibukSlide || sibukUmum}
                      style={{ ...TOMBOL, borderColor: '#c7d2fe', background: WARNA.unguMuda, color: '#4338ca', alignSelf: 'flex-start' }}><Bot size={14} /> Tulis ulang isi (AI)</button>
                  )}
                </>
              )}

              {tab === 'tampilan' && s && (
                video ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>Slide video selalu tampil sebagai satu pemutar video selebar layar, dengan pertanyaan di bawahnya saat video berhenti.</p>
                ) : !spa ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Tampilan SPA belum dibangun. AI memilihkan layout yang sesuai untuk setiap slide.</p>
                    <button type="button" onClick={onGenerateSpa} disabled={sibukUmum} style={{ ...TOMBOL, border: 0, background: WARNA.ungu, color: '#fff', fontWeight: 700, alignSelf: 'flex-start' }}><Bot size={14} /> Bangun tampilan SPA (AI)</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13 }}>Layout sekarang: <strong>{SPA_LAYOUT_LABELS[spa.layout] || spa.layout}</strong></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={LABEL}>Ganti layout (disusun dari poin slide)</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                        {LAYOUT_DARI_POIN.map((l) => (
                          <button key={l} type="button" onClick={() => gantiLayout(l)} aria-pressed={spa.layout === l}
                            style={{ ...TOMBOL, justifyContent: 'center', padding: '0 6px', border: spa.layout === l ? '2px solid #6366f1' : TOMBOL.border, background: spa.layout === l ? WARNA.unguMuda : '#fff', color: spa.layout === l ? '#4338ca' : '#475569' }}>{NAMA_LAYOUT[l]}</button>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={() => onRegenerateLayout(no)} disabled={sibukSlide || sibukUmum}
                      style={{ ...TOMBOL, borderColor: '#c7d2fe', background: WARNA.unguMuda, color: '#4338ca', alignSelf: 'flex-start' }}><Bot size={14} /> Pilihkan layout (AI)</button>
                    <span style={{ fontSize: 11.5, color: WARNA.redup, lineHeight: 1.5 }}>AI bisa memilih layout lain seperti tabel, angka kunci, diskusi, atau latihan, dan menyusun isinya dari poin slide.</span>
                  </>
                )
              )}

              {tab === 'media' && s && (
                video ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label htmlFor="studio-video" style={LABEL}>Tautan video YouTube (wajib)</label>
                      <input id="studio-video" type="url" value={s.image_url || ''} onChange={(e) => ubah({ image_url: e.target.value.trim() })} placeholder="https://www.youtube.com/watch?v=..." style={INPUT} />
                      {s.image_url && !urlVideoValid(s.image_url) && <span style={{ fontSize: 11.5, color: '#b91c1c' }}>Tautan belum dikenali sebagai video YouTube atau berkas .mp4/.webm.</span>}
                    </div>
                    {urlVideoValid(s.image_url) && (
                      <EditorSoalVideo url={s.image_url} soal={soalLima(s.soal_video)} onChange={(soal) => ubah({ soal_video: soal })} konteks={{ kursus: courseName, judul: s.title }} />
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label htmlFor="studio-gambar" style={LABEL}>URL gambar atau video pendukung (opsional)</label>
                      <input id="studio-gambar" value={s.image_url || ''} onChange={(e) => ubah({ image_url: e.target.value.trim() })} placeholder="https://…" style={INPUT} />
                      <span style={{ fontSize: 11.5, color: WARNA.redup }}>Tampil di samping isi slide. Untuk video dengan pertanyaan, pakai "Slide video".</span>
                    </div>
                    {spa?.media_hint && !s.image_url && (
                      <p style={{ margin: 0, fontSize: 12, color: '#8A5E00', background: '#FFF7E6', border: '1px solid #F5DFA8', borderRadius: 8, padding: '8px 10px' }}><strong>Saran media dari AI:</strong> {spa.media_hint}</p>
                    )}
                  </>
                )
              )}
            </div>

            <div style={{ padding: '10px 14px', borderTop: `1px solid ${WARNA.tepi}`, display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => pindah(-1)} disabled={idx <= 0} aria-label="Pindahkan ke atas" style={{ ...TOMBOL, width: 36, padding: 0, justifyContent: 'center', opacity: idx <= 0 ? 0.4 : 1 }}><ArrowUp size={15} /></button>
              <button type="button" onClick={() => pindah(1)} disabled={idx >= slides.length - 1} aria-label="Pindahkan ke bawah" style={{ ...TOMBOL, width: 36, padding: 0, justifyContent: 'center', opacity: idx >= slides.length - 1 ? 0.4 : 1 }}><ArrowDown size={15} /></button>
              <span style={{ fontSize: 11.5, color: WARNA.redup, flex: 1 }}>Slide {no} dari {slides.length}</span>
              <button type="button" onClick={hapus} style={{ ...TOMBOL, border: 0, color: '#b91c1c' }}><Trash2 size={14} /> Hapus</button>
            </div>

            {sibukSlide && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: WARNA.unguTeks }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> AI sedang memperbarui slide {no}…
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
