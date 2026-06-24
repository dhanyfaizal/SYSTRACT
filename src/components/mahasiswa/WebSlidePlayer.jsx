import { useState, useEffect, useRef } from 'react'
import {
  BookOpen, Clock, HelpCircle, Info, ExternalLink, Menu, X, Check,
  ChevronDown, AlertCircle, Sparkles, BookMarked, ArrowUp
} from 'lucide-react'

// Prodi themes matching existing colors in webslideTemplate.js
const PRODI_THEMES = {
  si: {
    accent: '#ef4444',
    dark: '#7f1d1d',
    rgbaLight: 'rgba(239, 68, 68, 0.04)',
    rgbaDark: 'rgba(239, 68, 68, 0.12)',
    name: 'Sistem Informasi'
  },
  ka: {
    accent: '#10b981',
    dark: '#064e3b',
    rgbaLight: 'rgba(16, 185, 129, 0.04)',
    rgbaDark: 'rgba(16, 185, 129, 0.12)',
    name: 'Komputerisasi Akuntansi'
  },
  ti: {
    accent: '#f97316',
    dark: '#9a3412',
    rgbaLight: 'rgba(249, 115, 22, 0.04)',
    rgbaDark: 'rgba(249, 115, 22, 0.12)',
    name: 'Teknik Informatika'
  },
  dkv: {
    accent: '#8b5cf6',
    dark: '#581c87',
    rgbaLight: 'rgba(139, 92, 246, 0.04)',
    rgbaDark: 'rgba(139, 92, 246, 0.12)',
    name: 'Desain Komunikasi Visual'
  },
  default: {
    accent: '#3b82f6',
    dark: '#1e3a8a',
    rgbaLight: 'rgba(59, 130, 246, 0.04)',
    rgbaDark: 'rgba(59, 130, 246, 0.12)',
    name: 'Umum'
  }
}

function getThemeByProdi(prodiName) {
  const name = prodiName?.toLowerCase() || ''
  if (name.includes('sistem informasi') || name.includes('si')) return PRODI_THEMES.si
  if (name.includes('komputerisasi akuntansi') || name.includes('ka')) return PRODI_THEMES.ka
  if (name.includes('teknik informatika') || name.includes('ti')) return PRODI_THEMES.ti
  if (name.includes('desain komunikasi visual') || name.includes('dkv')) return PRODI_THEMES.dkv
  return PRODI_THEMES.default
}

export default function WebSlidePlayer({
  courseName,
  prodiName,
  meetingNo,
  slideData,
  onClose,
  askWithContext
}) {
  const theme = getThemeByProdi(prodiName)
  const title = slideData?.title || `Materi Pertemuan ${meetingNo}`
  
  // Extract slides list
  const rawSlides = slideData?.slides || []
  
  // Make sure we have a thank you slide at the end if not exists
  const [slides, setSlides] = useState([])
  useEffect(() => {
    let list = [...rawSlides]
    if (list.length > 0) {
      const hasThankYou = list.some(s => s.layout === 'thank_you' || s.title?.toLowerCase().includes('terima kasih'))
      if (!hasThankYou) {
        list.push({
          slide_no: list.length + 1,
          layout: 'thank_you',
          title: 'Rangkuman & Penutup',
          description: 'Semoga materi perkuliahan hari ini bermanfaat. Silakan tinjau kembali rujukan pustaka dan silabus untuk pendalaman materi lebih lanjut.',
          image_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80'
        })
      }
    }
    setSlides(list)
  }, [rawSlides])

  const [activeIdx, setActiveIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedAccordions, setExpandedAccordions] = useState({})
  
  const rightPaneRef = useRef(null)
  const isScrollingRef = useRef(false)

  // Scroll spy handler
  const handleScroll = (e) => {
    // If the scroll was triggered by clicking a sidebar item, ignore to prevent stutter
    if (isScrollingRef.current) return

    const container = e.target
    const scrollTop = container.scrollTop
    
    let currentActive = 0
    for (let i = 0; i < slides.length; i++) {
      const el = document.getElementById(`slide-section-${i}`)
      if (el) {
        // If the scroll position has passed the start of this section (with a buffer)
        if (el.offsetTop - container.offsetTop <= scrollTop + 120) {
          currentActive = i
        }
      }
    }
    setActiveIdx(currentActive)
  }

  const scrollToSection = (idx) => {
    const el = document.getElementById(`slide-section-${idx}`)
    const container = rightPaneRef.current
    if (el && container) {
      isScrollingRef.current = true
      setActiveIdx(idx)
      
      container.scrollTo({
        top: el.offsetTop - container.offsetTop - 10,
        behavior: 'smooth'
      })

      // Turn scroll listener back on after smooth scroll completes
      setTimeout(() => {
        isScrollingRef.current = false
      }, 800)
    }
  }

  const toggleAccordion = (slideIdx, itemIdx) => {
    const key = `${slideIdx}-${itemIdx}`
    setExpandedAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  if (slides.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: '#f8fafc', color: '#64748b', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <AlertCircle size={24} style={{ margin: '0 auto 8px auto', color: theme.accent }} />
        <span>Data materi tidak ditemukan atau belum disiapkan oleh Dosen.</span>
      </div>
    )
  }

  const progressPercent = Math.round(((activeIdx + 1) / slides.length) * 100)

  // AI Prompt triggers
  const triggerAiAsk = (slide, promptType) => {
    if (!askWithContext) return
    const slideText = JSON.stringify(slide)
    let promptText = ''
    if (promptType === 'summary') {
      promptText = `Jelaskan secara ringkas materi bagian "${slide.title}" ini: ${slideText}`
    } else if (promptType === 'cases') {
      promptText = `Berikan contoh nyata/studi kasus industri yang relevan dengan topik "${slide.title}": ${slideText}`
    } else if (promptType === 'quiz') {
      promptText = `Berikan saya satu pertanyaan kuis interaktif singkat untuk menguji pemahaman saya tentang topik "${slide.title}": ${slideText}`
    }
    askWithContext(promptText)
  }

  // helper to inject strong & em formatting
  const parseHtmlText = (text) => {
    if (!text) return ''
    return <span dangerouslySetInnerHTML={{ __html: text }} />
  }

  return (
    <div
      className="netacad-viewer-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        color: '#334155',
        borderRadius: '12px',
        overflow: 'hidden',
        height: '750px',
        border: '1px solid #e2e8f0',
        position: 'relative',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {/* CSS Styles for Cisco NetAcad Visual Aesthetics */}
      <style>{`
        .netacad-viewer-container *, .netacad-viewer-container *:before, .netacad-viewer-container *:after {
          box-sizing: border-box;
        }
        .netacad-sidebar {
          width: 260px;
          border-right: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          transition: width 0.3s ease;
        }
        .netacad-sidebar-item {
          width: 100%;
          background: none;
          border: none;
          color: #64748b;
          padding: 10px 16px;
          font-size: 0.8rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          border-left: 3px solid transparent;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: all 0.2s;
        }
        .netacad-sidebar-item:hover {
          color: #1e293b;
          background: #f1f5f9;
        }
        .netacad-sidebar-item.active {
          color: #1e293b;
          background: ${theme.rgbaLight};
          border-left-color: ${theme.accent};
          font-weight: 700;
        }
        .netacad-content-canvas {
          flex: 1;
          overflow-y: auto;
          background: #f8fafc;
          scroll-behavior: smooth;
        }
        .netacad-section {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          margin: 16px 20px;
          padding: 24px 28px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          scroll-margin-top: 10px;
        }
        .netacad-section:first-of-type {
          margin-top: 20px;
        }
        .netacad-section:last-of-type {
          margin-bottom: 40px;
        }
        .netacad-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .section-number-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: ${theme.rgbaDark};
          color: ${theme.accent};
          font-weight: 800;
          font-size: 0.85rem;
          margin-right: 8px;
        }
        .netacad-image-wrapper {
          width: 100%;
          aspect-ratio: 1.6 / 1;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
          background: #e2e8f0;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }
        .netacad-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }
        .netacad-image-wrapper:hover .netacad-image {
          transform: scale(1.02);
        }
        .netacad-highlight-card {
          background: #f8fafc;
          border-radius: 8px;
          padding: 14px 18px;
          border: 1px solid #e2e8f0;
          border-left: 4px solid ${theme.accent};
        }
        .netacad-bullet-icon {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${theme.rgbaDark};
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2px;
          flex-shrink: 0;
        }
        .netacad-grid-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.01);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .netacad-grid-card:hover {
          transform: translateY(-1px);
          border-color: ${theme.accent}50;
          box-shadow: 0 4px 12px rgba(0,0,0,0.04);
        }
        .netacad-list-card {
          background: #ffffff;
          padding: 12px 16px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(0,0,0,0.01);
        }
        .netacad-table-wrapper {
          width: 100%;
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .netacad-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.82rem;
        }
        .netacad-table th {
          background: #f8fafc;
          color: #1e293b;
          font-weight: 700;
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .netacad-table td {
          padding: 12px;
          color: #475569;
          border-bottom: 1px solid #f1f5f9;
        }
        .netacad-table tr:last-child td {
          border-bottom: none;
        }
        .netacad-accordion-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .netacad-accordion-header {
          width: 100%;
          background: none;
          border: none;
          color: #1e293b;
          font-weight: 600;
          font-size: 0.85rem;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          text-align: left;
        }
        .netacad-accordion-header:hover {
          background: #f8fafc;
        }
        .netacad-accordion-body {
          padding: 12px 16px;
          border-top: 1px solid #f1f5f9;
          background: #f8fafc;
          color: #475569;
        }
        .netacad-ai-section-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .netacad-ai-section-btn:hover {
          background: ${theme.rgbaLight};
          border-color: ${theme.accent}60;
          color: ${theme.accent};
        }
        .scroll-top-btn {
          position: absolute;
          bottom: 20px;
          right: 20px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          box-shadow: 0 4px 10px rgba(0,0,0,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 10;
        }
        .scroll-top-btn:hover {
          background: #f1f5f9;
          color: #1e293b;
        }
      `}</style>

      {/* 1. TOP HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#ffffff', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            title="Tampilkan Outline"
          >
            <Menu size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.62rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
              Syllabus SPA Reader — Pertemuan {meetingNo}
            </span>
            <h4 style={{ fontSize: '0.85rem', color: '#0f172a', margin: '2px 0 0 0', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </h4>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
            Bagian {activeIdx + 1} / {slides.length} ({progressPercent}% Selesai)
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Tutup Reader"
            >
              <X size={12} /> Tutup
            </button>
          )}
        </div>
      </div>

      {/* Progress line running along the header */}
      <div style={{ width: '100%', height: '2px', background: '#e2e8f0', zIndex: 10 }}>
        <div style={{ width: `${progressPercent}%`, height: '100%', background: theme.accent, transition: 'width 0.3s ease' }} />
      </div>

      {/* 2. MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Outline Sidebar Drawer */}
        {sidebarOpen && (
          <div className="netacad-sidebar">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Daftar Isi Materi</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
              {slides.map((slide, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToSection(idx)}
                  className={`netacad-sidebar-item ${activeIdx === idx ? 'active' : ''}`}
                >
                  <span style={{ opacity: 0.6, marginRight: '3px', fontWeight: 700 }}>
                    {idx + 1}.
                  </span> 
                  {slide.title || 'Materi'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Document Area */}
        <div
          ref={rightPaneRef}
          onScroll={handleScroll}
          className="netacad-content-canvas"
        >
          {slides.map((slide, idx) => {
            const layout = slide.layout || (idx === 0 ? 'cover' : 'list')
            const imgUrl = slide.image_url || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80'

            return (
              <section
                key={idx}
                id={`slide-section-${idx}`}
                className="netacad-section"
              >
                {/* Section Header */}
                <div className="netacad-card-header">
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center' }}>
                    <span className="section-number-badge">{idx + 1}</span>
                    {parseHtmlText(slide.title)}
                  </h3>
                  
                  {/* Section Tags */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                      {layout}
                    </span>
                  </div>
                </div>

                {/* Section Body Layout */}
                {layout === 'cover' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '30px', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px', lineHeight: 1.2 }}>
                        {parseHtmlText(slide.title || title)}
                      </h4>
                      <h5 style={{ fontSize: '0.95rem', color: theme.accent, fontWeight: 700, marginBottom: '14px' }}>
                        {slide.subtitle || courseName}
                      </h5>
                      <p style={{ fontSize: '#475569', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '20px' }}>
                        {parseHtmlText(slide.description || 'Rancangan materi silabus perkuliahan komprehensif.')}
                      </p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>SPA Reader</span>
                        <span style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>Pertemuan Ke-{meetingNo}</span>
                      </div>
                    </div>
                    <div className="netacad-image-wrapper">
                      <img src={imgUrl} alt="Cover Illustration" className="netacad-image" />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '30px', alignItems: 'start' }}>
                    {/* Content Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {layout === 'split' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {slide.split_left && (
                            <div className="netacad-highlight-card">
                              <h5 style={{ color: theme.accent, fontSize: '0.85rem', fontWeight: 800, marginBottom: '6px', textTransform: 'uppercase' }}>
                                {slide.split_left.heading}
                              </h5>
                              <p style={{ color: '#334155', fontSize: '0.85rem', lineHeight: 1.45, margin: 0 }}>
                                {parseHtmlText(slide.split_left.description)}
                              </p>
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(slide.split_right || []).map((pt, pIdx) => (
                              <div key={pIdx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div className="netacad-bullet-icon">
                                  <Check size={10} color={theme.accent} strokeWidth={3} />
                                </div>
                                <p style={{ color: '#475569', fontSize: '0.82rem', lineHeight: 1.4, margin: 0 }}>{parseHtmlText(pt)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {layout === 'grid' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          {(slide.grid_items || []).map((item, gIdx) => (
                            <div key={gIdx} className="netacad-grid-card">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <i className={item.icon || 'fa-solid fa-lightbulb'} style={{ color: theme.accent, fontSize: '0.9rem' }}></i>
                                <strong style={{ color: '#0f172a', fontSize: '0.8rem' }}>{item.title}</strong>
                              </div>
                              <p style={{ color: '#475569', fontSize: '0.75rem', lineHeight: 1.35, margin: 0 }}>{parseHtmlText(item.desc)}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {layout === 'list' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(slide.list_items || []).map((item, lIdx) => {
                            const borderColors = {
                              red: '#ef4444',
                              amber: '#f59e0b',
                              green: '#10b981',
                              blue: '#3b82f6'
                            }
                            const borderColor = borderColors[item.color] || theme.accent
                            return (
                              <div key={lIdx} className="netacad-list-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
                                <p style={{ color: '#334155', fontSize: '0.82rem', lineHeight: 1.4, margin: 0 }}>
                                  {parseHtmlText(item.text)}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {layout === 'table' && (
                        <div className="netacad-table-wrapper">
                          {slide.table_data && (
                            <table className="netacad-table">
                              <thead>
                                <tr>
                                  {(slide.table_data.headers || []).map((h, i) => (
                                    <th key={i}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(slide.table_data.rows || []).map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx}>{parseHtmlText(cell)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {layout === 'accordion' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(slide.accordion_items || []).map((item, aIdx) => {
                            const isOpen = !!expandedAccordions[`${idx}-${aIdx}`]
                            return (
                              <div key={aIdx} className="netacad-accordion-card" style={{ borderColor: isOpen ? `${theme.accent}50` : '#e2e8f0' }}>
                                <button className="netacad-accordion-header" onClick={() => toggleAccordion(idx, aIdx)}>
                                  <span style={{ fontWeight: 600 }}>{item.header}</span>
                                  <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                </button>
                                {isOpen && (
                                  <div className="netacad-accordion-body">
                                    <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.4 }}>{parseHtmlText(item.content)}</p>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Legacy Fallback */}
                      {!['split', 'grid', 'list', 'table', 'accordion'].includes(layout) && slide.content && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {slide.content.map((pt, pIdx) => (
                            <div key={pIdx} className="netacad-list-card" style={{ borderLeft: `3px solid ${theme.accent}` }}>
                              <p style={{ color: '#334155', fontSize: '0.82rem', lineHeight: 1.4, margin: 0 }}>{parseHtmlText(pt)}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reference tag */}
                      {slide.reference && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                          <BookOpen size={11} color={theme.accent} />
                          <span>Pustaka Rujukan: <strong style={{ color: '#334155' }}>{slide.reference}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Image Column */}
                    <div>
                      <div className="netacad-image-wrapper">
                        <img src={imgUrl} alt="Slide Reference" className="netacad-image" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Section Footer Actions (AI Chat triggers) */}
                <div style={{ marginTop: '18px', borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                    <Sparkles size={10} color={theme.accent} /> AI Asisten:
                  </span>
                  <button className="netacad-ai-section-btn" onClick={() => triggerAiAsk(slide, 'summary')}>
                    Ringkas Bagian Ini
                  </button>
                  <button className="netacad-ai-section-btn" onClick={() => triggerAiAsk(slide, 'cases')}>
                    Contoh Kasus Nyata
                  </button>
                  <button className="netacad-ai-section-btn" onClick={() => triggerAiAsk(slide, 'quiz')}>
                    Uji Pemahaman Saya (Kuis)
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {/* Floating Scroll to Top button */}
      {activeIdx > 0 && (
        <button
          className="scroll-top-btn"
          onClick={() => scrollToSection(0)}
          title="Kembali ke atas"
        >
          <ArrowUp size={16} />
        </button>
      )}
    </div>
  )
}
