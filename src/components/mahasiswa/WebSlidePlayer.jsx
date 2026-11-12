import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { ExternalLink, Menu, X, ChevronLeft, ChevronRight, ArrowUp, AlertCircle } from 'lucide-react'
import { prepareDeck, renderSections, SPA_CSS } from '@/lib/spaBlocks'
import { pasangVideoInteraktif } from '@/lib/videoInteraktif'

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
  kunciProgres = null,   // awalan kunci penyimpanan progres video interaktif (per peserta & materi)
  onStatusVideo = null,  // ({ terjawab, total }) gabungan seluruh video interaktif di materi ini
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
  const statusRef = useRef(onStatusVideo)
  const slideDataRef = useRef(slideData)
  useEffect(() => { statusRef.current = onStatusVideo }, [onStatusVideo])
  useEffect(() => { slideDataRef.current = slideData }, [slideData])

  // Isi materi ditulis sendiri (bukan dangerouslySetInnerHTML): React menulis ulang innerHTML saat
  // komponen induk dirender ulang (mis. timer belajar tiap detik), yang mengganti iframe video dan
  // membuang panel soal yang sudah terpasang. Di sini isi hanya ditulis ulang bila HTML-nya berubah,
  // lalu soal dipasang pada video interaktif (media bertanda data-vi).
  useLayoutEffect(() => {
    const wadah = isiRef.current
    if (!wadah) return undefined
    wadah.innerHTML = sectionsHtml
    const per = {}
    const kirim = () => {
      const v = Object.values(per)
      statusRef.current?.({ terjawab: v.reduce((a, x) => a + x.terjawab, 0), total: v.reduce((a, x) => a + x.total, 0) })
    }
    const pelepas = Array.from(wadah.querySelectorAll('[data-vi]')).map((media) => {
      const idx = Number(media.getAttribute('data-vi'))
      const soal = slideDataRef.current?.slides?.[idx]?.soal_video
      return pasangVideoInteraktif(media, soal, {
        kunci: kunciProgres ? `${kunciProgres}_${idx}` : null,
        onProgres: (p) => { per[idx] = p; kirim() },
      })
    })
    if (pelepas.length === 0) kirim()
    return () => pelepas.forEach((lepas) => lepas())
  }, [sectionsHtml, kunciProgres])

  const handleScroll = (e) => {
    if (isScrollingRef.current) return
    const container = e.currentTarget
    let current = 0
    for (let i = 0; i < slides.length; i++) {
      const el = document.getElementById(`sx-sec-${i}`)
      if (el && el.offsetTop - container.offsetTop <= container.scrollTop + 120) current = i
    }
    setActiveIdx(current)
  }

  const scrollToSection = (idx) => {
    const el = document.getElementById(`sx-sec-${idx}`)
    const container = paneRef.current
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
        height: 'max(460px, calc(100vh - 270px))',
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
          <button type="button" aria-label="Bagian sebelumnya" disabled={atStart}
            onClick={() => scrollToSection(Math.max(0, activeIdx - 1))}
            style={{ ...BTN, opacity: atStart ? 0.4 : 1, cursor: atStart ? 'default' : 'pointer' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 13, color: '#3F5049', fontWeight: 600, minWidth: 52, textAlign: 'center' }} aria-live="polite">
            {activeIdx + 1} / {slides.length}
          </span>
          <button type="button" aria-label="Bagian berikutnya" disabled={atEnd}
            onClick={() => scrollToSection(Math.min(slides.length - 1, activeIdx + 1))}
            style={{ ...BTN, opacity: atEnd ? 0.4 : 1, cursor: atEnd ? 'default' : 'pointer' }}>
            <ChevronRight size={16} />
          </button>
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
                <span style={{ opacity: 0.6, marginRight: 6 }}>{idx + 1}.</span>{label}
              </button>
            ))}
          </nav>
        )}

        {/* Isi materi */}
        <div ref={paneRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 2.5vw, 28px)' }}>
          <div ref={isiRef} className="sx" onClick={handleContentClick} />
        </div>
      </div>

      {activeIdx > 0 && (
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
