import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { ExternalLink, Menu, X, ChevronLeft, ChevronRight, ArrowUp, AlertCircle, Presentation, ScrollText } from 'lucide-react'
import { prepareDeck, renderSections, SPA_CSS } from '@/lib/spaBlocks'
import { pasangVideoInteraktif, bacaProgres, simpanProgres, rapikanSoal } from '@/lib/videoInteraktif'
import { pasangLatihan } from '@/lib/latihanInteraktif'
import { targetBacaBagian, bagianTerlihat } from '@/lib/bacaBagian'
import { DETIK_DIAM_MAKS } from '@/hooks/useWaktuBelajarAktif'

// Pemutar SPA peserta. Isi tiap bagian dirender oleh src/lib/spaBlocks.js (gaya Pitch Deck),
// renderer yang sama dengan ekspor HTML, sehingga tampilan di aplikasi dan file HTML identik.

const plainText = (html) => {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return String(html).replace(/<[^>]+>/g, '')
  return new DOMParser().parseFromString(String(html), 'text/html').body.textContent || ''
}

const BTN = { background: '#ffffff', border: '1px solid #DDE3DE', color: '#1B2A25', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

export default function WebSlidePlayer({
  courseName,
  meetingNo,
  slideData,
  onClose,
  onOpenNewTab,
  kunciProgres = null,   // awalan kunci penyimpanan progres (per peserta & materi); null = tidak disimpan
  onStatusMateri = null, // ({ baca, video, latihan }) masing-masing { selesai, total } — syarat menyelesaikan materi
  tinggi = 'max(460px, calc(100vh - 270px))', // tinggi pemutar; '100vh' untuk tampilan tab sendiri
  // Pencatatan di server (peserta): setiap jawaban soal, laporan detik baca berkala, dan progres
  // tersimpan untuk dilanjutkan di perangkat lain ({ baca: number[], benar: [{bagian, jenis, soal}] }).
  onJawab = null,        // ({ bagian, jenis: 'video'|'latihan', soal, pilihan, benar })
  onBaca = null,         // (detikPerBagian: number[])
  progresServer = null,
}) {
  const deck = useMemo(() => prepareDeck(slideData), [slideData])
  const slides = deck.slides
  const title = plainText(deck.title) || `Materi Pertemuan ${meetingNo}`
  const sectionsHtml = useMemo(
    () => renderSections(deck, { meetingNo, courseName }).join(''),
    [deck, meetingNo, courseName]
  )
  const tocLabels = useMemo(
    () => slides.map((s, i) => plainText(s.title) || `Bagian ${i + 1}`),
    [slides]
  )

  const [activeIdx, setActiveIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [zoomScale, setZoomScale] = useState(1)
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const paneRef = useRef(null)
  const isiRef = useRef(null)
  const isScrollingRef = useRef(false)
  const statusRef = useRef(onStatusMateri)
  const slideDataRef = useRef(slideData)
  const [versiProgres, setVersiProgres] = useState(0)
  const [soalBagian, setSoalBagian] = useState({}) // { [idx]: { jenis: 'video'|'latihan', terjawab, total } }
  const [bacaSnapshot, setBacaSnapshot] = useState([]) // salinan catatan baca untuk render
  const jawabRef = useRef(onJawab)
  const bacaCbRef = useRef(onBaca)
  useEffect(() => { statusRef.current = onStatusMateri }, [onStatusMateri])
  useEffect(() => { slideDataRef.current = slideData }, [slideData])
  useEffect(() => { jawabRef.current = onJawab; bacaCbRef.current = onBaca }, [onJawab, onBaca])

  // Waktu baca minimal per bagian (detik), dari isi slide.
  // Distabilkan menurut isinya: data slide yang sama tapi objek baru tidak boleh mereset pelacak.
  const targetTeks = slides.map(targetBacaBagian).join(',')
  const targetBaca = useMemo(() => (targetTeks ? targetTeks.split(',').map(Number) : []), [targetTeks])
  const kunciBaca = kunciProgres ? `${kunciProgres}_baca` : null
  const bacaRef = useRef([])

  // Isi materi ditulis sendiri (bukan dangerouslySetInnerHTML): React menulis ulang innerHTML saat
  // komponen induk dirender ulang (mis. tiap detik), yang mengganti iframe video dan membuang panel
  // soal yang sudah terpasang. Di sini isi hanya ditulis ulang bila HTML-nya berubah, lalu soal
  // dipasang pada video interaktif (data-vi) dan latihan (layout quiz).
  useLayoutEffect(() => {
    const wadah = isiRef.current
    if (!wadah) return undefined
    wadah.innerHTML = sectionsHtml
    setSoalBagian({})
    const catat = (idx, jenis) => (p) => setSoalBagian((s) => ({ ...s, [idx]: { jenis, ...p } }))
    const pelepas = [
      ...Array.from(wadah.querySelectorAll('[data-vi]')).map((media) => {
        const idx = Number(media.getAttribute('data-vi'))
        return pasangVideoInteraktif(media, slideDataRef.current?.slides?.[idx]?.soal_video, {
          kunci: kunciProgres ? `${kunciProgres}_${idx}` : null,
          onProgres: catat(idx, 'video'),
          onJawab: (p) => jawabRef.current?.({ bagian: idx, jenis: 'video', ...p }),
        })
      }),
      ...Array.from(wadah.querySelectorAll('section[data-layout="quiz"]')).map((sec) => {
        const idx = Number(sec.id.replace('sx-sec-', ''))
        return pasangLatihan(sec, slideDataRef.current?.slides?.[idx]?.quiz_items, {
          kunci: kunciProgres ? `${kunciProgres}_q${idx}` : null,
          onProgres: catat(idx, 'latihan'),
          onJawab: (p) => jawabRef.current?.({ bagian: idx, jenis: 'latihan', ...p }),
        })
      }),
    ]
    return () => pelepas.forEach((lepas) => lepas())
  }, [sectionsHtml, kunciProgres, versiProgres])

  // Muat catatan baca per bagian (bisa dilanjutkan di lain waktu).
  useEffect(() => {
    let tersimpan = []
    try { tersimpan = kunciBaca ? JSON.parse(localStorage.getItem(kunciBaca) || '[]') : [] } catch { tersimpan = [] }
    bacaRef.current = targetBaca.map((_, i) => Math.max(0, Number(tersimpan[i]) || 0))
    setBacaSnapshot(bacaRef.current.slice())
  }, [kunciBaca, targetBaca])

  // Pelacak baca: bagian yang cukup terlihat di panel bertambah 1 detik, hanya saat tab terlihat
  // dan peserta aktif (ada gerakan/gulir/ketik dalam 2 menit terakhir).
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return undefined
    let terakhirAktif = Date.now()
    let ketukan = 0
    const tandai = () => { terakhirAktif = Date.now() }
    const kejadian = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll']
    kejadian.forEach((k) => window.addEventListener(k, tandai, { passive: true, capture: true }))
    const simpan = () => { try { if (kunciBaca) localStorage.setItem(kunciBaca, JSON.stringify(bacaRef.current)) } catch { /* abaikan */ } }
    // Laporan ke server: tiap 15 detik selama peserta aktif, saat sebuah bagian selesai, dan saat
    // meninggalkan materi. Tetap dikirim walau angkanya sama, karena server menaikkan catatannya
    // bertahap sesuai waktu nyata dan perlu menyusul angka di browser.
    const lapor = () => bacaCbRef.current?.(bacaRef.current.slice())
    let detikSejakLapor = 0
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - terakhirAktif > DETIK_DIAM_MAKS * 1000) return
      const rp = pane.getBoundingClientRect()
      let berubah = false
      targetBaca.forEach((t, i) => {
        if (!t || (bacaRef.current[i] || 0) >= t) return
        const el = isiRef.current?.querySelector(`#sx-sec-${i}`)
        if (!el || !bagianTerlihat(el.getBoundingClientRect(), rp)) return
        bacaRef.current[i] = (bacaRef.current[i] || 0) + 1
        if (bacaRef.current[i] >= t) berubah = true
      })
      ketukan += 1
      detikSejakLapor += 1
      if (berubah || ketukan % 5 === 0) simpan()
      if (berubah || detikSejakLapor >= 15) { lapor(); detikSejakLapor = 0 }
      if (berubah) setBacaSnapshot(bacaRef.current.slice())
    }, 1000)
    return () => {
      clearInterval(id)
      simpan()
      lapor()
      kejadian.forEach((k) => window.removeEventListener(k, tandai, { capture: true }))
    }
  }, [targetBaca, kunciBaca])

  // Progres dari tab lain ("Buka di tab baru"): soal → pasang ulang; baca → gabungkan.
  useEffect(() => {
    if (!kunciProgres) return undefined
    const dengar = (e) => {
      if (!e.key?.startsWith(`${kunciProgres}_`)) return
      if (e.key === kunciBaca) {
        let lain = []
        try { lain = JSON.parse(e.newValue || '[]') } catch { lain = [] }
        bacaRef.current = bacaRef.current.map((d, i) => Math.max(d, Number(lain[i]) || 0))
        setBacaSnapshot(bacaRef.current.slice())
      } else {
        setVersiProgres((v) => v + 1)
      }
    }
    window.addEventListener('storage', dengar)
    return () => window.removeEventListener('storage', dengar)
  }, [kunciProgres, kunciBaca])

  // Progres dari server (perangkat lain): gabungkan ke catatan perangkat ini, lalu kirim ke server
  // soal yang sudah benar di perangkat ini tetapi belum tercatat di server (mis. dijawab sebelum
  // pencatatan server ada), memakai kunci dari data materi.
  useEffect(() => {
    if (!progresServer || !kunciProgres) return
    const data = slideDataRef.current?.slides || []
    // Baca: ambil yang terbesar.
    const baca = Array.isArray(progresServer.baca) ? progresServer.baca : []
    bacaRef.current = bacaRef.current.map((d, i) => Math.max(d, Number(baca[i]) || 0))
    try { if (kunciBaca) localStorage.setItem(kunciBaca, JSON.stringify(bacaRef.current)) } catch { /* abaikan */ }
    setBacaSnapshot(bacaRef.current.slice())

    // Soal: server → perangkat.
    const diServer = new Set((progresServer.benar || []).map((b) => `${b.jenis}:${b.bagian}:${b.soal}`))
    let bertambah = false
    const kunciSoal = (jenis, bagian) => `${kunciProgres}_${jenis === 'video' ? '' : 'q'}${bagian}`
    const perBagian = {}
    ;(progresServer.benar || []).forEach((b) => {
      const k = kunciSoal(b.jenis, b.bagian)
      ;(perBagian[k] ||= { jenis: b.jenis, bagian: b.bagian, soal: [] }).soal.push(b.soal)
    })
    Object.entries(perBagian).forEach(([k, { jenis, bagian, soal }]) => {
      const lokal = bacaProgres(k)
      const baru = soal.filter((s) => !lokal.terjawab.has(s))
      if (!baru.length) return
      let maks = lokal.maks
      if (jenis === 'video') {
        const urut = rapikanSoal(data[bagian]?.soal_video)
        soal.forEach((s) => { if (urut[s]) maks = Math.max(maks, urut[s].detik) })
      }
      simpanProgres(k, { terjawab: new Set([...lokal.terjawab, ...baru]), maks })
      bertambah = true
    })

    // Soal: perangkat → server.
    data.forEach((slide, bagian) => {
      if (slide?.layout === 'media' && Array.isArray(slide.soal_video) && slide.soal_video.length) {
        const urut = rapikanSoal(slide.soal_video)
        bacaProgres(kunciSoal('video', bagian)).terjawab.forEach((s) => {
          if (urut[s] && !diServer.has(`video:${bagian}:${s}`)) jawabRef.current?.({ bagian, jenis: 'video', soal: s, pilihan: urut[s].jawaban, benar: true, sinkron: true })
        })
      }
      if (slide?.layout === 'quiz' && Array.isArray(slide.quiz_items)) {
        bacaProgres(kunciSoal('latihan', bagian)).terjawab.forEach((s) => {
          const item = slide.quiz_items[s]
          if (!item || diServer.has(`latihan:${bagian}:${s}`)) return
          const nOpsi = Math.min(Array.isArray(item.options) ? item.options.length : 0, 6)
          const pilihan = Number.isInteger(item.answer) && item.answer >= 0 && item.answer < nOpsi ? item.answer : 0
          jawabRef.current?.({ bagian, jenis: 'latihan', soal: s, pilihan, benar: true, sinkron: true })
        })
      }
    })

    if (bertambah) setVersiProgres((v) => v + 1)
  }, [progresServer, kunciProgres, kunciBaca])

  // Status tiap bagian (untuk tanda ✓ di daftar isi) dan ringkasan syarat selesai materi.
  const selesaiBagian = useMemo(() => targetBaca.map((t, i) => {
    const s = soalBagian[i]
    if (s) return s.terjawab >= s.total
    return t > 0 ? (bacaSnapshot[i] || 0) >= t : null
  }), [targetBaca, soalBagian, bacaSnapshot])

  useEffect(() => {
    const jumlah = (jenis) => Object.values(soalBagian).filter((s) => s.jenis === jenis)
      .reduce((a, s) => ({ selesai: a.selesai + s.terjawab, total: a.total + s.total }), { selesai: 0, total: 0 })
    const wajibBaca = targetBaca.map((t, i) => (t > 0 ? i : -1)).filter((i) => i >= 0)
    statusRef.current?.({
      baca: { selesai: wajibBaca.filter((i) => selesaiBagian[i]).length, total: wajibBaca.length },
      video: jumlah('video'),
      latihan: jumlah('latihan'),
    })
  }, [soalBagian, selesaiBagian, targetBaca])

  // ── Mode slide: satu bagian per layar (bawaan di layar sempit; pilihan disimpan per perangkat) ──
  const [modeSlide, setModeSlide] = useState(() => {
    try {
      const simpan = localStorage.getItem('sy_mode_slide')
      if (simpan !== null) return simpan === '1'
    } catch { /* abaikan */ }
    return typeof window !== 'undefined' && window.innerWidth < 768
  })
  const gantiMode = () => {
    setModeSlide((m) => {
      try { localStorage.setItem('sy_mode_slide', m ? '0' : '1') } catch { /* abaikan */ }
      return !m
    })
  }
  const activeIdxRef = useRef(0)
  useEffect(() => { activeIdxRef.current = activeIdx }, [activeIdx])

  // Tandai bagian aktif (mode slide menampilkan hanya bagian itu). Dijalankan ulang setelah isi ditulis ulang.
  useLayoutEffect(() => {
    const isi = isiRef.current
    if (!isi) return
    isi.classList.toggle('sx-mode-slide', modeSlide)
    isi.querySelectorAll('.sx-sec').forEach((sec, i) => sec.classList.toggle('is-aktif', i === activeIdx))
  }, [modeSlide, activeIdx, sectionsHtml, versiProgres])

  // Kembali ke mode gulir: langsung ke bagian yang sedang dibaca.
  useEffect(() => {
    if (modeSlide) { paneRef.current?.scrollTo({ top: 0 }); return }
    const el = isiRef.current?.querySelector(`#sx-sec-${activeIdxRef.current}`)
    const pane = paneRef.current
    if (el && pane) pane.scrollTo({ top: el.offsetTop - pane.offsetTop - 12 })
  }, [modeSlide])

  // Tinggi maksimal video mengikuti tinggi panel yang sebenarnya (judul + video + status muat).
  useEffect(() => {
    const pane = paneRef.current
    if (!pane || typeof ResizeObserver === 'undefined') return undefined
    const atur = () => pane.style.setProperty('--sx-video-maks-h', `${Math.max(200, pane.clientHeight - 210)}px`)
    atur()
    const ro = new ResizeObserver(atur)
    ro.observe(pane)
    return () => ro.disconnect()
  }, [])

  // Detik baca bagian aktif (untuk cincin di tombol Berikutnya), diperbarui tiap detik.
  const [detikAktif, setDetikAktif] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setDetikAktif(bacaRef.current[activeIdxRef.current] || 0), 1000)
    return () => clearInterval(id)
  }, [])

  const handleScroll = (e) => {
    if (isScrollingRef.current || modeSlide) return
    const container = e.currentTarget
    let current = 0
    for (let i = 0; i < slides.length; i++) {
      const el = document.getElementById(`sx-sec-${i}`)
      if (el && el.offsetTop - container.offsetTop <= container.scrollTop + 120) current = i
    }
    setActiveIdx(current)
  }

  const scrollToSection = (idx) => {
    const container = paneRef.current
    if (modeSlide) {
      setActiveIdx(idx)
      setDetikAktif(bacaRef.current[idx] || 0)
      container?.scrollTo({ top: 0 })
      return
    }
    const el = document.getElementById(`sx-sec-${idx}`)
    if (!el || !container) return
    isScrollingRef.current = true
    setActiveIdx(idx)
    container.scrollTo({ top: el.offsetTop - container.offsetTop - 12, behavior: 'smooth' })
    setTimeout(() => { isScrollingRef.current = false }, 800)
  }

  // Klik gambar di dalam materi membuka tampilan perbesar.
  const handleContentClick = (e) => {
    const img = e.target.closest?.('img.sx-img')
    if (!img) return
    setZoomScale(1)
    setZoomPos({ x: 0, y: 0 })
    setIsDragging(false)
    setLightboxUrl(img.getAttribute('src'))
  }

  if (slides.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: '#F6F7F3', color: '#6B7A74', borderRadius: 12, border: '1px solid #DDE3DE' }}>
        <AlertCircle size={24} style={{ margin: '0 auto 8px auto', color: '#047857' }} />
        <span>Materi belum disiapkan oleh instruktur.</span>
      </div>
    )
  }

  const progressPercent = Math.round(((activeIdx + 1) / slides.length) * 100)
  const atStart = activeIdx === 0
  const atEnd = activeIdx >= slides.length - 1

  return (
    <div
      className="sx-player"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#F6F7F3',
        color: '#1B2A25',
        borderRadius: 14,
        overflow: 'hidden',
        height: tinggi,
        border: '1px solid #DDE3DE',
        position: 'relative',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
      }}
    >
      <style>{SPA_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid #DDE3DE', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 260px' }}>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            style={{ ...BTN, width: 'auto', padding: '6px 10px', gap: 6, fontSize: 13, fontWeight: 600, background: sidebarOpen ? '#E6F4EC' : '#ffffff', flexShrink: 0 }}
          >
            <Menu size={15} /> Daftar isi
          </button>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 11, color: '#047857', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              Pertemuan {meetingNo}
            </span>
            <h4 style={{ fontSize: 15, color: '#181C24', margin: '1px 0 0 0', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </h4>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={gantiMode} aria-pressed={modeSlide}
            title={modeSlide ? 'Tampilkan semua bagian dalam satu halaman gulir' : 'Tampilkan satu bagian per layar'}
            style={{ ...BTN, width: 'auto', padding: '6px 10px', gap: 6, fontSize: 13, fontWeight: 600, marginRight: 4, background: modeSlide ? '#E6F4EC' : '#ffffff' }}>
            {modeSlide ? <ScrollText size={15} /> : <Presentation size={15} />}
            {modeSlide ? 'Mode gulir' : 'Mode slide'}
          </button>
          {!modeSlide && (
            <button type="button" aria-label="Bagian sebelumnya" disabled={atStart}
              onClick={() => scrollToSection(Math.max(0, activeIdx - 1))}
              style={{ ...BTN, opacity: atStart ? 0.4 : 1, cursor: atStart ? 'default' : 'pointer' }}>
              <ChevronLeft size={16} />
            </button>
          )}
          <span style={{ fontSize: 13, color: '#3F5049', fontWeight: 600, minWidth: 52, textAlign: 'center' }} aria-live="polite">
            {activeIdx + 1} / {slides.length}
          </span>
          {!modeSlide && (
            <button type="button" aria-label="Bagian berikutnya" disabled={atEnd}
              onClick={() => scrollToSection(Math.min(slides.length - 1, activeIdx + 1))}
              style={{ ...BTN, opacity: atEnd ? 0.4 : 1, cursor: atEnd ? 'default' : 'pointer' }}>
              <ChevronRight size={16} />
            </button>
          )}
          {onOpenNewTab && (
            <button type="button" onClick={onOpenNewTab} title="Buka di tab baru" aria-label="Buka di tab baru" style={{ ...BTN, marginLeft: 4 }}>
              <ExternalLink size={15} />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} title="Tutup" aria-label="Tutup" style={BTN}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Garis progres */}
      <div style={{ width: '100%', height: 3, background: '#DDE3DE' }}>
        <div style={{ width: `${progressPercent}%`, height: '100%', background: '#047857', transition: 'width .3s ease' }} />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Daftar isi */}
        {sidebarOpen && (
          <nav aria-label="Daftar isi" style={{ width: 260, flexShrink: 0, borderRight: '1px solid #DDE3DE', background: '#ffffff', overflowY: 'auto', padding: 8 }}>
            {tocLabels.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToSection(idx)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 8,
                  padding: '9px 12px', fontSize: 13, lineHeight: 1.35, fontFamily: 'inherit',
                  background: activeIdx === idx ? '#E6F4EC' : 'transparent',
                  color: activeIdx === idx ? '#047857' : '#3F5049',
                  fontWeight: activeIdx === idx ? 700 : 500
                }}
              >
                <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ opacity: 0.6 }}>{idx + 1}.</span>
                  <span style={{ flex: 1 }}>{label}</span>
                  {selesaiBagian[idx] === true && <span style={{ color: '#047857', fontWeight: 800 }} aria-label="selesai">✓</span>}
                  {selesaiBagian[idx] === false && soalBagian[idx] && (
                    <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700, whiteSpace: 'nowrap' }}>{soalBagian[idx].terjawab}/{soalBagian[idx].total}</span>
                  )}
                </span>
              </button>
            ))}
          </nav>
        )}

        {/* Isi materi */}
        <div ref={paneRef} onScroll={handleScroll} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'clamp(12px, 2.5vw, 28px)' }}>
          <div ref={isiRef} className="sx" onClick={handleContentClick} />
        </div>
      </div>

      {/* Mode slide: navigasi bawah. Berikutnya terbuka setelah bagian ini selesai dibaca/dijawab. */}
      {modeSlide && (() => {
        const t = targetBaca[activeIdx] || 0
        const s = soalBagian[activeIdx]
        const belum = selesaiBagian[activeIdx] === false
        const sisa = Math.max(0, t - detikAktif)
        const persen = s ? (s.total ? s.terjawab / s.total : 1) : t ? Math.min(1, detikAktif / t) : 1
        const keterangan = !belum ? `Bagian ${activeIdx + 1} dari ${slides.length}`
          : s ? `Jawab ${s.total - s.terjawab} pertanyaan lagi untuk lanjut`
            : `Baca sekitar ${Math.floor(sisa / 60)}:${String(sisa % 60).padStart(2, '0')} lagi sebelum lanjut`
        const r = 11
        const keliling = 2 * Math.PI * r
        return (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderTop: '1px solid #DDE3DE', background: '#ffffff' }}>
            <button type="button" disabled={atStart} onClick={() => scrollToSection(Math.max(0, activeIdx - 1))}
              style={{ ...BTN, width: 'auto', height: 40, padding: '0 14px', gap: 4, fontSize: 13, fontWeight: 600, opacity: atStart ? 0.4 : 1, cursor: atStart ? 'default' : 'pointer' }}>
              <ChevronLeft size={15} /> Sebelumnya
            </button>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 4, width: '100%', maxWidth: Math.min(560, slides.length * 28), justifyContent: 'center' }} aria-hidden="true">
                {slides.map((_, i) => (
                  <span key={i} style={{ flex: 1, maxWidth: 24, height: 6, borderRadius: 3, background: i === activeIdx ? '#f59e0b' : selesaiBagian[i] === false ? '#DDE3DE' : '#047857' }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: '#3F5049', textAlign: 'center' }} aria-live="polite">{keterangan}</span>
            </div>
            <button type="button" disabled={atEnd || belum} onClick={() => scrollToSection(Math.min(slides.length - 1, activeIdx + 1))}
              title={belum ? keterangan : undefined}
              style={{ ...BTN, width: 'auto', height: 40, padding: belum ? '0 14px 0 8px' : '0 14px', gap: 8, fontSize: 13, fontWeight: 700, border: 0,
                background: atEnd ? '#F1F5F9' : belum ? '#D1FAE5' : '#047857', color: atEnd ? '#94a3b8' : belum ? '#065F46' : '#ffffff', cursor: atEnd || belum ? 'default' : 'pointer' }}>
              {belum && !atEnd && (
                <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="13" cy="13" r={r} fill="none" stroke="#A7F3D0" strokeWidth="3" />
                  <circle cx="13" cy="13" r={r} fill="none" stroke="#047857" strokeWidth="3" strokeDasharray={keliling} strokeDashoffset={keliling * (1 - persen)} style={{ transition: 'stroke-dashoffset .9s linear' }} />
                </svg>
              )}
              Berikutnya <ChevronRight size={15} />
            </button>
          </div>
        )
      })()}

      {activeIdx > 0 && !modeSlide && (
        <button
          type="button"
          onClick={() => scrollToSection(0)}
          title="Kembali ke atas"
          aria-label="Kembali ke atas"
          style={{ ...BTN, position: 'absolute', right: 20, bottom: 20, borderRadius: '50%', width: 38, height: 38, boxShadow: '0 4px 10px rgba(0,0,0,.08)', zIndex: 5 }}
        >
          <ArrowUp size={16} />
        </button>
      )}

      {lightboxUrl && (
        <div 
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'default',
            userSelect: 'none',
            overflow: 'hidden'
          }}
        >
          {/* Zoom controls */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{
              position: 'absolute',
              bottom: 30,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '6px 16px',
              borderRadius: 30,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              zIndex: 10000,
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <button 
              onClick={() => setZoomScale(s => Math.max(0.5, s - 0.25))}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '0 8px', fontWeight: 'bold' }}
              title="Zoom Out"
            >
              -
            </button>
            <span style={{ color: '#fff', fontSize: 13, minWidth: 45, textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button 
              onClick={() => setZoomScale(s => Math.min(4, s + 0.25))}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: '0 8px', fontWeight: 'bold' }}
              title="Zoom In"
            >
              +
            </button>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
            <button 
              onClick={() => { setZoomScale(1); setZoomPos({ x: 0, y: 0 }) }}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}
              title="Reset Zoom"
            >
              Reset
            </button>
          </div>

          {/* Close button */}
          <button 
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute',
              top: 20, right: 20,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: 40, height: 40,
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
          >
            ✕
          </button>

          {/* Image with grab-drag pan & zoom */}
          <img 
            src={lightboxUrl} 
            alt="Fullscreen View" 
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (zoomScale > 1) {
                setZoomScale(1); setZoomPos({ x: 0, y: 0 })
              } else {
                setZoomScale(2); setZoomPos({ x: 0, y: 0 })
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              if (zoomScale > 1) {
                setIsDragging(true)
                setDragStart({ x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y })
              }
            }}
            onMouseMove={(e) => {
              e.stopPropagation()
              if (isDragging && zoomScale > 1) {
                setZoomPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
              }
            }}
            onMouseUp={(e) => {
              e.stopPropagation()
              setIsDragging(false)
            }}
            onMouseLeave={() => {
              setIsDragging(false)
            }}
            style={{ 
              transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              maxWidth: '90%', 
              maxHeight: '90%', 
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
              cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              userSelect: 'none'
            }} 
          />
        </div>
      )}
    </div>
  )
}
