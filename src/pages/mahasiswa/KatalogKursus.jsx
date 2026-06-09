import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Users, ChevronRight, Plus, Search, Check, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const COLORS = ['#4f46e5', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function KatalogKursus() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [enrolledIds, setEnrolledIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [enrollingMap, setEnrollingMap] = useState({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (user) {
      fetchCoursesAndEnrollments()
    }
  }, [user])

  async function fetchCoursesAndEnrollments() {
    setLoading(true)
    try {
      // 1. Fetch all active courses
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select(`
          id, code, name, description, credits, semester, cover_color,
          dosen:profiles!courses_dosen_id_fkey(full_name, avatar_url)
        `)
        .eq('is_active', true)
        .order('name')

      if (courseErr) throw courseErr

      // 2. Fetch enrollments for current student
      const { data: enrollData, error: enrollErr } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', user.id)

      if (enrollErr) throw enrollErr

      setCourses(courseData || [])
      setEnrolledIds(new Set((enrollData || []).map(e => e.course_id)))
    } catch (err) {
      console.error('[SYSTRACT] Error fetching catalog:', err)
      toast.error('Gagal memuat katalog kursus')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnroll(courseId, courseName) {
    setEnrollingMap(prev => ({ ...prev, [courseId]: true }))
    try {
      const { error } = await supabase
        .from('enrollments')
        .insert({
          course_id: courseId,
          student_id: user.id
        })

      if (error) throw error

      toast.success(`Berhasil mendaftar di kursus: ${courseName} 🎉`)
      setEnrolledIds(prev => {
        const next = new Set(prev)
        next.add(courseId)
        return next
      })
    } catch (err) {
      console.error('[SYSTRACT] Enroll error:', err)
      toast.error('Gagal mendaftar kursus. Silakan coba lagi.')
    } finally {
      setEnrollingMap(prev => ({ ...prev, [courseId]: false }))
    }
  }

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="var(--indigo-600)" /> Jelajahi Kursus Terbuka
          </h1>
          <p className="page-subtitle">Daftarkan diri Anda secara mandiri di kursus pilihan Anda</p>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: 400, marginBottom: 24 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
        <input 
          className="input" 
          style={{ paddingLeft: 38, height: 42, borderRadius: 10 }} 
          placeholder="Cari kursus berdasarkan nama atau kode..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
      </div>

      {loading ? (
        <div className="course-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ height: 240, display: 'flex', flexDirection: 'column', gap: 14, padding: 20, animation: 'pulse 1.5s ease infinite' }}>
              <div style={{ height: 12, width: '40%', background: 'var(--gray-200)', borderRadius: 4 }} />
              <div style={{ height: 20, width: '80%', background: 'var(--gray-200)', borderRadius: 4 }} />
              <div style={{ height: 40, width: '100%', background: 'var(--gray-200)', borderRadius: 8, marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card" style={{ padding: 48 }}>
          <BookOpen size={40} color="var(--gray-300)" />
          <p className="empty-state-text">{search ? 'Tidak menemukan kursus yang cocok' : 'Belum ada kursus yang tersedia'}</p>
          <p className="empty-state-sub">Silakan periksa kembali nanti atau hubungi instruktur Anda.</p>
        </div>
      ) : (
        <div className="course-grid">
          {filtered.map((c, i) => {
            const isEnrolled = enrolledIds.has(c.id)
            const isEnrolling = enrollingMap[c.id]

            return (
              <div key={c.id} className="course-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 240 }}>
                <div className="course-card-banner" style={{ background: c.cover_color || COLORS[i % COLORS.length], height: 8 }} />
                <div className="course-card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="course-card-code">{c.code}</div>
                  <div className="course-card-name" style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.name}</div>
                  {c.description && (
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', marginBottom: 12 }}>
                      {c.description}
                    </div>
                  )}
                  <div className="course-card-meta" style={{ marginTop: 'auto', paddingBottom: 8 }}>
                    <span>{c.credits} SKS</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} /> {c.dosen?.full_name || 'TBA'}
                    </span>
                  </div>
                </div>
                
                <div className="card-footer" style={{ background: 'var(--gray-50)', padding: '12px 20px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'stretch' }}>
                  {isEnrolled ? (
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => navigate(`/mata-kuliah/${c.id}`)}
                      style={{ width: '100%', justifyContent: 'center', fontWeight: 600, color: 'var(--indigo-600)', background: 'var(--indigo-50)', borderColor: '#c7d2fe' }}
                    >
                      <Check size={14} style={{ marginRight: 4 }} /> Buka Kursus
                    </button>
                  ) : (
                    <button 
                      className="btn btn-primary btn-sm" 
                      onClick={() => navigate(`/mata-kuliah/${c.id}`)}
                      style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
                    >
                      <Sparkles size={14} style={{ marginRight: 4 }} /> Detail & Daftar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
