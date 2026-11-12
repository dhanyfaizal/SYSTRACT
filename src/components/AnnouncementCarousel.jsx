import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Megaphone, ExternalLink, X, Calendar, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { queryCache } from '@/lib/queryCache'
import { useAuth } from '@/contexts/AuthContext'


const GRADIENTS = [
  'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #0891b2 0%, #4f46e5 100%)',
  'linear-gradient(135deg, #059669 0%, #0891b2 100%)',
  'linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #d97706 0%, #dc2626 100%)',
]

export default function AnnouncementCarousel({ showManage = false, managePath = '/pengumuman' }) {
  const { user, role } = useAuth()
  const navigate        = useNavigate()
  const [slides,       setSlides]       = useState([])
  const [current,      setCurrent]      = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [paused,       setPaused]       = useState(false)
  const [animDir,      setAnimDir]      = useState('right')
  const [_visible,     _setVisible]     = useState(true)
  const [detailSlide,  setDetailSlide]  = useState(null)  // null = closed
  const timerRef = useRef(null)

  useEffect(() => { if (user) fetchAnnouncements() }, [user])

  // Close modal on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setDetailSlide(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function fetchAnnouncements() {
    const data = await queryCache.get(
      'announcements',
      () => supabase
        .from('announcements')
        .select('*, author:profiles(full_name), course:courses(name,code)')
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
      5 * 60 * 1000
    )
    setSlides(data || [])
    setLoading(false)
  }

  const goTo = useCallback((idx, dir = 'right') => {
    setAnimDir(dir)
    setCurrent(idx)
  }, [])

  const next = useCallback(() => {
    if (!slides.length) return
    goTo((current + 1) % slides.length, 'right')
  }, [current, slides.length, goTo])

  const prev = useCallback(() => {
    if (!slides.length) return
    goTo((current - 1 + slides.length) % slides.length, 'left')
  }, [current, slides.length, goTo])

  // Auto-play — pauses when modal is open
  useEffect(() => {
    if (paused || detailSlide || slides.length <= 1) return
    timerRef.current = setInterval(next, 5000)
    return () => clearInterval(timerRef.current)
  }, [paused, detailSlide, slides.length, next])

  if (loading || !slides.length) return null

  const slide    = slides[current]
  const gradient = GRADIENTS[current % GRADIENTS.length]
  const hasImage = Boolean(slide.image_url)
  const detailGradient = detailSlide ? GRADIENTS[slides.indexOf(detailSlide) % GRADIENTS.length] : gradient

  return (
    <div style={{ marginBottom: 24 }}>

      {/* ── Announcement Detail Modal ─────────────────────── */}
      {detailSlide && (
        <div
          onClick={() => setDetailSlide(null)}
          style={{
            position:'fixed', inset:0, zIndex:9000,
            background:'rgba(0,0,0,.55)', backdropFilter:'blur(5px)',
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:'#fff', borderRadius:20, maxWidth:580, width:'100%',
              maxHeight:'82vh', overflow:'hidden', display:'flex', flexDirection:'column',
              boxShadow:'0 24px 60px rgba(0,0,0,.4)',
              animation:'annScaleIn .22s ease',
            }}
          >
            {/* Modal header */}
            <div style={{
              background: detailGradient,
              borderRadius:'20px 20px 0 0',
              padding:'24px 24px 22px',
              position:'relative', flexShrink:0,
            }}>
              {detailSlide.image_url && (
                <img src={detailSlide.image_url} alt=""
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                    objectFit:'cover', borderRadius:'20px 20px 0 0', opacity:.35 }}
                />
              )}
              <div style={{ position:'relative', zIndex:1 }}>
                {/* Close */}
                <button onClick={() => setDetailSlide(null)}
                  style={{ position:'absolute', top:0, right:0,
                    width:32, height:32, borderRadius:'50%', border:'none', cursor:'pointer',
                    background:'rgba(255,255,255,.2)', backdropFilter:'blur(4px)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'#fff',
                  }}>
                  <X size={16}/>
                </button>

                {/* Badge */}
                <div style={{ marginBottom:10 }}>
                  <span style={{
                    fontSize:10, fontWeight:700, letterSpacing:.6,
                    padding:'3px 10px', borderRadius:99,
                    background: detailSlide.type==='global' ? 'rgba(255,255,255,.25)' : 'rgba(245,158,11,.35)',
                    color:'#fff', border:'1px solid rgba(255,255,255,.2)',
                  }}>
                    {detailSlide.type==='global' ? '🌐 GLOBAL' : `📘 ${detailSlide.course?.code || 'Mata Kuliah'}`}
                  </span>
                </div>

                <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.3,
                  textShadow:'0 1px 6px rgba(0,0,0,.4)', paddingRight:40 }}>
                  {detailSlide.title}
                </div>
              </div>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ padding:'20px 24px 24px', overflowY:'auto', flex:1 }}>
              {/* Meta info */}
              <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--gray-400)', marginBottom:16, flexWrap:'wrap' }}>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <User size={12}/> {detailSlide.author?.full_name || 'Admin'}
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <Calendar size={12}/>
                  {new Date(detailSlide.created_at).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
                </span>
                {detailSlide.expires_at && (
                  <span style={{ color:'#f97316', display:'flex', alignItems:'center', gap:5 }}>
                    ⏳ Berlaku s/d {new Date(detailSlide.expires_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                  </span>
                )}
              </div>

              {/* Full content */}
              <div style={{ fontSize:14, color:'var(--gray-700)', lineHeight:1.85, whiteSpace:'pre-wrap' }}>
                {detailSlide.content}
              </div>

              {/* Course note */}
              {detailSlide.type !== 'global' && detailSlide.course && (
                <div style={{ marginTop:20, padding:'10px 14px', background:'#f0f9ff',
                  border:'1px solid #bae6fd', borderRadius:10, fontSize:12, color:'#0369a1' }}>
                  📘 Berlaku untuk: <strong>{detailSlide.course.code} – {detailSlide.course.name}</strong>
                </div>
              )}

              <button onClick={() => setDetailSlide(null)}
                style={{ marginTop:20, width:'100%', padding:'12px', borderRadius:12, border:'none',
                  background:'var(--gray-100)', color:'var(--gray-600)', cursor:'pointer',
                  fontSize:13, fontWeight:600, transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--gray-200)'}
                onMouseLeave={e => e.currentTarget.style.background='var(--gray-100)'}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Carousel banner ───────────────────────────────── */}
      <div
        style={{
          position:'relative', borderRadius:14, overflow:'hidden',
          boxShadow:'0 4px 20px rgba(79,70,229,.18)',
          minHeight: hasImage ? 220 : 140,
          background: hasImage ? 'var(--gray-900)' : gradient,
          transition: 'background .4s ease',
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Background image */}
        {hasImage && (
          <>
            <img src={slide.image_url} alt={slide.title}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                objectFit:'cover', opacity:.55, transition:'opacity .4s' }}
            />
            <div style={{ position:'absolute', inset:0,
              background:'linear-gradient(90deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.25) 60%, transparent 100%)' }}/>
          </>
        )}

        {/* Clickable content area */}
        <div
          onClick={() => setDetailSlide(slide)}
          style={{
            position:'relative', zIndex:1,
            padding:'24px 28px',
            display:'flex', alignItems:'center', gap:20,
            animation:`slideIn${animDir === 'right' ? 'Right' : 'Left'} .35s ease`,
            cursor:'pointer',
          }}
        >
          <div style={{
            width:48, height:48, borderRadius:12, flexShrink:0,
            background:'rgba(255,255,255,.15)', backdropFilter:'blur(6px)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Megaphone size={22} color="#fff"/>
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{
                fontSize:10, fontWeight:700, letterSpacing:.6,
                padding:'2px 9px', borderRadius:99,
                background: slide.type==='global' ? 'rgba(255,255,255,.25)' : 'rgba(245,158,11,.35)',
                color:'#fff', backdropFilter:'blur(4px)',
                border:'1px solid rgba(255,255,255,.2)',
              }}>
                {slide.type==='global' ? '🌐 GLOBAL' : `📘 ${slide.course?.code || 'MK'}`}
              </span>
              {slide.expires_at && (
                <span style={{ fontSize:10, color:'rgba(255,255,255,.6)' }}>
                  s/d {new Date(slide.expires_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                </span>
              )}
            </div>

            <div style={{ fontWeight:800, fontSize:18, color:'#fff', lineHeight:1.2,
              marginBottom:6, textShadow:'0 1px 4px rgba(0,0,0,.3)' }}>
              {slide.title}
            </div>

            <div style={{ fontSize:13, color:'rgba(255,255,255,.85)', lineHeight:1.5,
              display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {slide.content}
            </div>

            <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', marginTop:8,
              display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span>Oleh {slide.author?.full_name} · {new Date(slide.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</span>
              <span style={{ fontSize:10, background:'rgba(255,255,255,.15)', padding:'2px 8px',
                borderRadius:99, color:'rgba(255,255,255,.85)', flexShrink:0 }}>
                Klik untuk baca selengkapnya →
              </span>
            </div>
          </div>
        </div>

        {/* Prev / Next */}
        {slides.length > 1 && (
          <>
            <button onClick={e => { e.stopPropagation(); prev() }}
              style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', zIndex:2,
                width:32, height:32, borderRadius:'50%', border:'none', cursor:'pointer',
                background:'rgba(255,255,255,.15)', backdropFilter:'blur(4px)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#fff', transition:'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.3)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,.15)'}>
              <ChevronLeft size={16}/>
            </button>
            <button onClick={e => { e.stopPropagation(); next() }}
              style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', zIndex:2,
                width:32, height:32, borderRadius:'50%', border:'none', cursor:'pointer',
                background:'rgba(255,255,255,.15)', backdropFilter:'blur(4px)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#fff', transition:'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.3)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,.15)'}>
              <ChevronRight size={16}/>
            </button>
          </>
        )}

        {/* Manage button */}
        {showManage && (role === 'dosen' || role === 'admin') && (
          <button onClick={e => { e.stopPropagation(); navigate(managePath) }}
            style={{ position:'absolute', top:10, right:42, zIndex:2,
              padding:'3px 10px', borderRadius:99, border:'1px solid rgba(255,255,255,.3)',
              background:'rgba(255,255,255,.12)', backdropFilter:'blur(4px)',
              fontSize:11, fontWeight:600, color:'rgba(255,255,255,.85)', cursor:'pointer',
              display:'flex', alignItems:'center', gap:4, transition:'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.25)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,.12)'}>
            <ExternalLink size={11}/> Kelola
          </button>
        )}

        {/* Dot indicators */}
        {slides.length > 1 && (
          <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)',
            display:'flex', gap:5, zIndex:2 }}>
            {slides.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); goTo(i, i > current ? 'right' : 'left') }}
                style={{
                  width: i === current ? 22 : 7,
                  height:7, borderRadius:99, border:'none', cursor:'pointer', padding:0,
                  background: i === current ? '#fff' : 'rgba(255,255,255,.4)',
                  transition:'all .3s ease',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(24px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity:0; transform:translateX(-24px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes annScaleIn {
          from { opacity:0; transform:scale(.94) translateY(8px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
