import { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2, Sparkles,
  BookOpen, Clock, HelpCircle, Info, ExternalLink, Menu, X, Check,
  ChevronDown, AlertCircle
} from 'lucide-react'

// Prodi themes matching existing colors in webslideTemplate.js
const PRODI_THEMES = {
  si: {
    accent: '#ef4444',
    dark: '#7f1d1d',
    rgbaLight: 'rgba(239, 68, 68, 0.1)',
    rgbaDark: 'rgba(239, 68, 68, 0.2)',
    name: 'Sistem Informasi'
  },
  ka: {
    accent: '#10b981',
    dark: '#064e3b',
    rgbaLight: 'rgba(16, 185, 129, 0.1)',
    rgbaDark: 'rgba(16, 185, 129, 0.2)',
    name: 'Komputerisasi Akuntansi'
  },
  ti: {
    accent: '#f97316',
    dark: '#9a3412',
    rgbaLight: 'rgba(249, 115, 22, 0.1)',
    rgbaDark: 'rgba(249, 115, 22, 0.2)',
    name: 'Teknik Informatika'
  },
  dkv: {
    accent: '#8b5cf6',
    dark: '#581c87',
    rgbaLight: 'rgba(139, 92, 246, 0.1)',
    rgbaDark: 'rgba(139, 92, 246, 0.2)',
    name: 'Desain Komunikasi Visual'
  },
  default: {
    accent: '#3b82f6',
    dark: '#1e3a8a',
    rgbaLight: 'rgba(59, 130, 246, 0.1)',
    rgbaDark: 'rgba(59, 130, 246, 0.2)',
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
          title: 'Terima Kasih',
          description: 'Semoga materi perkuliahan hari ini bermanfaat. Sampai jumpa di pertemuan berikutnya!',
          image_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80'
        })
      }
    }
    setSlides(list)
  }, [rawSlides])

  const [currentIdx, setCurrentIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [expandedAccordions, setExpandedAccordions] = useState({})
  
  const containerRef = useRef(null)

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIdx, slides.length])

  // Reset accordion states when slide changes
  useEffect(() => {
    setExpandedAccordions({})
  }, [currentIdx])

  const handleNext = () => {
    if (currentIdx < slides.length - 1) {
      setCurrentIdx(currentIdx + 1)
    }
  }

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1)
    }
  }

  const toggleAccordion = (idx) => {
    setExpandedAccordions(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }))
  }

  const handleFullscreenToggle = () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen()
      }
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
      setIsFullscreen(false)
    }
  }

  // Handle fullscreen exit listener (e.g. Esc key pressed)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  if (slides.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: '#0b0f19', color: '#9ca3af', borderRadius: 12 }}>
        <AlertCircle size={24} style={{ margin: '0 auto 8px auto', color: theme.accent }} />
        <span>Data slide tidak valid atau belum digenerate oleh Dosen.</span>
      </div>
    )
  }

  const activeSlide = slides[currentIdx]
  const progressPercent = Math.round(((currentIdx + 1) / slides.length) * 100)

  // AI Prompt triggers
  const triggerAiAsk = (promptType) => {
    if (!askWithContext) return
    const slideText = JSON.stringify(activeSlide)
    let promptText = ''
    if (promptType === 'summary') {
      promptText = `Jelaskan secara ringkas materi kuliah pada slide "${activeSlide.title}" ini: ${slideText}`
    } else if (promptType === 'cases') {
      promptText = `Berikan contoh studi kasus nyata di dunia industri yang relevan dengan topik bahasan pada slide "${activeSlide.title}" ini: ${slideText}`
    } else if (promptType === 'quiz') {
      promptText = `Tanyakan satu pertanyaan interaktif/kuis singkat tentang slide "${activeSlide.title}" ini untuk menguji pemahaman saya: ${slideText}`
    }
    askWithContext(promptText)
  }

  // Layout Renderer
  const renderSlideContent = () => {
    const layout = activeSlide.layout || (currentIdx === 0 ? 'cover' : 'list')
    const imgUrl = activeSlide.image_url || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80'

    // helper to inject strong & em formatting
    const parseHtmlText = (text) => {
      if (!text) return ''
      return <span dangerouslySetInnerHTML={{ __html: text }} />
    }

    if (layout === 'cover') {
      return (
        <div className="slide-layout-cover" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', position: 'relative', padding: '40px' }}>
          <div className="cover-bg-glow" style={{ position: 'absolute', top: '10%', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: theme.accent, filter: 'blur(100px)', opacity: 0.15, pointerEvents: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '40px', alignItems: 'center', height: '100%', zIndex: 2 }}>
            <div>
              <span className="slide-badge" style={{ background: theme.rgbaDark, color: theme.accent }}>Pertemuan {meetingNo}</span>
              <h1 className="slide-title-large" style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', margin: '16px 0', lineHeight: 1.2 }}>
                {parseHtmlText(activeSlide.title || title)}
              </h1>
              <h3 style={{ fontSize: '1.2rem', color: '#93c5fd', fontWeight: 600, marginBottom: '20px' }}>
                {activeSlide.subtitle || courseName}
              </h3>
              <p style={{ fontSize: '1rem', color: '#9ca3af', lineHeight: 1.6, marginBottom: '30px' }}>
                {parseHtmlText(activeSlide.description || 'Slide presentasi pembelajaran interaktif berbasis RPS.')}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge-tag-dark">SPA Presentation</span>
                <span className="badge-tag-dark">Pertemuan Ke-{meetingNo}</span>
                <span className="badge-tag-dark" style={{ borderColor: theme.accent, color: theme.accent }}>{prodiName}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="slide-image-wrapper" style={{ border: `1px solid ${theme.accent}40`, boxShadow: `0 8px 30px ${theme.accent}20` }}>
                <img src={imgUrl} alt="Slide Illustration" className="slide-image" />
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (layout === 'thank_you') {
      return (
        <div className="slide-layout-cover" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', textAlign: 'center', padding: '40px', position: 'relative' }}>
          <div className="cover-bg-glow" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '250px', height: '250px', borderRadius: '50%', background: theme.accent, filter: 'blur(100px)', opacity: 0.2, pointerEvents: 'none' }} />
          <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h1 className="slide-title-large" style={{ fontSize: '3rem', fontWeight: 800, color: '#fff', margin: '20px 0 12px 0', textShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              {activeSlide.title}
            </h1>
            <p style={{ fontSize: '1.2rem', color: '#93c5fd', maxWidth: '600px', lineHeight: 1.6, marginBottom: '32px' }}>
              {activeSlide.description}
            </p>
            <div className="slide-image-wrapper" style={{ width: '400px', height: '220px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={imgUrl} alt="Presentation Finished" className="slide-image" />
            </div>
            <div style={{ display: 'inline-flex', gap: '8px', padding: '6px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>
              <span>Dosen Pengampu</span> • <span style={{ color: '#fff' }}>{prodiName}</span>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="slide-content-layout" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '30px', height: '100%', padding: '24px 30px' }}>
        {/* Left Side: Layout content */}
        <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '10px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
            {activeSlide.title}
          </h2>

          {layout === 'split' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activeSlide.split_left && (
                <div className="slide-highlight-card" style={{ borderLeft: `4px solid ${theme.accent}` }}>
                  <h4 style={{ color: theme.accent, fontSize: '0.9rem', fontWeight: 800, marginBottom: '6px', textTransform: 'uppercase' }}>
                    {activeSlide.split_left.heading}
                  </h4>
                  <p style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                    {parseHtmlText(activeSlide.split_left.description)}
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(activeSlide.split_right || []).map((pt, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div className="bullet-check-badge" style={{ background: theme.rgbaDark, borderColor: theme.accent }}>
                      <Check size={10} color={theme.accent} strokeWidth={3} />
                    </div>
                    <p style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.45, margin: 0 }}>{parseHtmlText(pt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {layout === 'grid' && (
            <div className="slide-layout-grid-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {(activeSlide.grid_items || []).map((item, idx) => (
                <div key={idx} className="slide-grid-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <i className={`${item.icon || 'fa-solid fa-lightbulb'} grid-card-icon`} style={{ color: theme.accent, fontSize: '1rem' }}></i>
                    <strong style={{ color: '#fff', fontSize: '0.85rem' }}>{item.title}</strong>
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: '0.78rem', lineHeight: 1.35, margin: 0 }}>{parseHtmlText(item.desc)}</p>
                </div>
              ))}
            </div>
          )}

          {layout === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(activeSlide.list_items || []).map((item, idx) => {
                const borderColors = {
                  red: '#ef4444',
                  amber: '#f59e0b',
                  green: '#10b981',
                  blue: '#3b82f6'
                }
                const borderColor = borderColors[item.color] || theme.accent
                return (
                  <div key={idx} className="slide-list-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <p style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.45, margin: 0 }}>
                      {parseHtmlText(item.text)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {layout === 'table' && (
            <div className="slide-table-container">
              {activeSlide.table_data && (
                <table className="slide-data-table">
                  <thead>
                    <tr>
                      {(activeSlide.table_data.headers || []).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSlide.table_data.rows || []).map((row, rIdx) => (
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>
                Klik pada pertanyaan di bawah untuk berdiskusi & mempelajari konsep detail:
              </p>
              {(activeSlide.accordion_items || []).map((item, idx) => {
                const isOpen = !!expandedAccordions[idx]
                return (
                  <div key={idx} className="slide-accordion-card" style={{ borderColor: isOpen ? `${theme.accent}50` : 'rgba(255,255,255,0.05)' }}>
                    <button className="slide-accordion-header" onClick={() => toggleAccordion(idx)}>
                      <span>{item.header}</span>
                      <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                    </button>
                    {isOpen && (
                      <div className="slide-accordion-body">
                        <p style={{ margin: 0, color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.45 }}>{parseHtmlText(item.content)}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Legacy fallback */}
          {!['split', 'grid', 'list', 'table', 'accordion'].includes(layout) && activeSlide.content && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeSlide.content.map((pt, idx) => (
                <div key={idx} className="slide-list-card" style={{ borderLeft: `3px solid ${theme.accent}` }}>
                  <p style={{ color: '#d1d5db', fontSize: '0.85rem', lineHeight: 1.45, margin: 0 }}>{parseHtmlText(pt)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Theoretical reference tag */}
          {activeSlide.reference && (
            <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#9ca3af' }}>
              <BookOpen size={11} color={theme.accent} />
              <span>Rujukan Teori: <strong style={{ color: '#fff' }}>{activeSlide.reference}</strong></span>
            </div>
          )}
        </div>

        {/* Right Side: Unsplash Photo */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          <div className="slide-image-wrapper" style={{ border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            <img src={imgUrl} alt="Slide Reference" className="slide-image" />
            <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              <ExternalLink size={8} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
              Unsplash Reference
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`webslide-player-container ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#070b13',
        color: '#f3f4f6',
        borderRadius: isFullscreen ? '0' : '12px',
        overflow: 'hidden',
        height: isFullscreen ? '100vh' : '500px',
        border: '1px solid rgba(255,255,255,0.05)',
        position: 'relative',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {/* Dynamic CSS styles injected to guarantee premium visual aesthetics */}
      <style>{`
        .webslide-player-container *, .webslide-player-container *:before, .webslide-player-container *:after {
          box-sizing: border-box;
        }
        .slide-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .badge-tag-dark {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          font-size: 0.75rem;
          color: #9ca3af;
          font-weight: 600;
        }
        .slide-image-wrapper {
          width: 100%;
          aspect-ratio: 1.6 / 1;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
          background: #111827;
        }
        .slide-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }
        .slide-image-wrapper:hover .slide-image {
          transform: scale(1.03);
        }
        .slide-highlight-card {
          background: rgba(255,255,255,0.02);
          border-radius: 6px;
          padding: 12px 16px;
          border: 1px solid rgba(255,255,255,0.04);
        }
        .bullet-check-badge {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2px;
          flex-shrink: 0;
        }
        .slide-grid-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 8px;
          padding: 10px 12px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .slide-grid-card:hover {
          transform: translateY(-2px);
          border-color: ${theme.accent}40;
          background: rgba(255,255,255,0.03);
        }
        .slide-list-card {
          background: rgba(255,255,255,0.015);
          padding: 10px 14px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .slide-table-container {
          width: 100%;
          overflow-x: auto;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.01);
        }
        .slide-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.78rem;
        }
        .slide-data-table th {
          background: rgba(255,255,255,0.03);
          color: #fff;
          font-weight: 700;
          padding: 8px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .slide-data-table td {
          padding: 8px 10px;
          color: #9ca3af;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .slide-data-table tr:last-child td {
          border-bottom: none;
        }
        .slide-accordion-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid;
          border-radius: 6px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .slide-accordion-header {
          width: 100%;
          background: none;
          border: none;
          color: #fff;
          font-weight: 600;
          font-size: 0.8rem;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          text-align: left;
        }
        .slide-accordion-header:hover {
          background: rgba(255,255,255,0.015);
        }
        .slide-accordion-body {
          padding: 0 14px 12px 14px;
          border-top: 1px solid rgba(255,255,255,0.03);
          background: rgba(0,0,0,0.1);
        }
        .sidebar-item {
          width: 100%;
          background: none;
          border: none;
          color: #9ca3af;
          padding: 8px 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          border-radius: 6px;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: all 0.2s;
        }
        .sidebar-item:hover {
          color: #fff;
          background: rgba(255,255,255,0.03);
        }
        .sidebar-item.active {
          color: #fff;
          background: ${theme.accent}20;
          border-left: 3px solid ${theme.accent};
          border-radius: 0 6px 6px 0;
          font-weight: 700;
        }
        .ai-chat-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          color: #d1d5db;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ai-chat-btn:hover {
          background: ${theme.accent}15;
          border-color: ${theme.accent}40;
          color: #fff;
        }
      `}</style>

      {/* 1. TOP HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#090e18', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            title="Tampilkan Outline"
          >
            <Menu size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.62rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
              SPA Slide Player — Pertemuan {meetingNo}
            </span>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', margin: '1px 0 0 0', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </h4>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
            {currentIdx + 1} / {slides.length}
          </span>
          <button
            onClick={handleFullscreenToggle}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={isFullscreen ? "Keluar Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Tutup Player"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Progress line running along the header */}
      <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.05)', zIndex: 10 }}>
        <div style={{ width: `${progressPercent}%`, height: '100%', background: theme.accent, transition: 'width 0.3s ease' }} />
      </div>

      {/* 2. MAIN PLAYER CONTENT CANVAS */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Outline Slide Sidebar Drawer */}
        {sidebarOpen && (
          <div style={{ width: '200px', borderRight: '1px solid rgba(255,255,255,0.05)', background: '#080d15', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Daftar Slide</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
              {slides.map((slide, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIdx(idx)}
                  className={`sidebar-item ${currentIdx === idx ? 'active' : ''}`}
                >
                  <span style={{ opacity: 0.5, marginRight: '3px' }}>{idx + 1}.</span> {slide.title || 'Materi'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The Slide Canvas */}
        <div style={{ flex: 1, background: '#0b0f19', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {renderSlideContent()}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM CONTROL BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#090e18', zIndex: 10 }}>
        {/* AI Helper Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <Sparkles size={10} color={theme.accent} /> Tanya AI:
          </span>
          <button className="ai-chat-btn" onClick={() => triggerAiAsk('summary')} title="Ringkas slide materi ini">
            Ringkas Materi
          </button>
          <button className="ai-chat-btn" onClick={() => triggerAiAsk('cases')} title="Berikan contoh nyata/studi kasus industri">
            Studi Kasus
          </button>
          <button className="ai-chat-btn" onClick={() => triggerAiAsk('quiz')} title="Tanyakan kuis untuk menguji pemahaman">
            Pertanyaan Kuis
          </button>
        </div>

        {/* Prev / Next controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="btn btn-secondary btn-sm"
            style={{
              padding: '5px 10px',
              background: currentIdx === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: currentIdx === 0 ? '#4b5563' : '#fff',
              cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              gap: 4
            }}
          >
            <ChevronLeft size={12} /> Seb
          </button>
          <button
            onClick={handleNext}
            disabled={currentIdx === slides.length - 1}
            className="btn btn-primary btn-sm"
            style={{
              padding: '5px 14px',
              background: currentIdx === slides.length - 1 ? 'rgba(255,255,255,0.02)' : theme.accent,
              borderColor: currentIdx === slides.length - 1 ? 'rgba(255,255,255,0.06)' : theme.accent,
              color: currentIdx === slides.length - 1 ? '#4b5563' : '#fff',
              cursor: currentIdx === slides.length - 1 ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              gap: 4
            }}
          >
            Lanjut <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
