import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Users, ChevronRight, Plus, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const COLORS = ['#4f46e5','#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

export default function MahasiswaMataKuliah() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => { if (user) fetchCourses() }, [user])

  async function fetchCourses() {
    // Step 1: ambil course_id dari enrollments mahasiswa ini
    const { data: enrollData, error: enrollErr } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('student_id', user.id)
      .eq('status', 'approved')

    if (enrollErr) {
      console.error('[EduSYS] enrollments query error:', enrollErr)
      setLoading(false)
      return
    }

    const courseIds = (enrollData || []).map(e => e.course_id)

    if (courseIds.length === 0) {
      setCourses([])
      setLoading(false)
      return
    }

    // Step 2: ambil detail courses berdasarkan ID
    const { data: courseData, error: courseErr } = await supabase
      .from('courses')
      .select('id, code, name, description, credits, semester, cover_color, dosen:profiles!courses_dosen_id_fkey(full_name, avatar_url)')
      .in('id', courseIds)
      .order('name')

    if (courseErr) console.error('[EduSYS] courses query error:', courseErr)
    setCourses(courseData || [])
    setLoading(false)
  }

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Kursus Saya</h1>
          <p className="page-subtitle">{courses.length} kursus terdaftar</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: 20 }}>
        <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }} />
        <input className="input" style={{ paddingLeft: 34 }} placeholder="Cari kursus…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="course-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} style={{ height:160, background:'var(--gray-100)', borderRadius:10 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card" style={{ padding: 48 }}>
          <BookOpen size={36} color="var(--gray-300)" />
          <p className="empty-state-text">{search ? 'Tidak ada hasil' : 'Belum ada kursus'}</p>
          <p className="empty-state-sub">Jelajahi katalog untuk mendaftar kursus baru</p>
        </div>
      ) : (
        <div className="course-grid">
          {filtered.map((c, i) => (
            <div key={c.id} className="course-card" onClick={() => navigate(`/mata-kuliah/${c.id}`)}>
              <div className="course-card-banner" style={{ background: c.cover_color || COLORS[i % COLORS.length], height: 8 }} />
              <div className="course-card-body">
                <div className="course-card-code">{c.code}</div>
                <div className="course-card-name">{c.name}</div>
                {c.description && (
                  <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                    {c.description}
                  </div>
                )}
                <div className="course-card-meta" style={{ marginTop: 8 }}>
                  <span>{c.credits} SKS</span>
                  <span>{c.semester}</span>
                </div>
              </div>
              <div className="course-card-footer">
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                  <Users size={11} /> {c.dosen?.full_name || 'TBA'}
                </span>
                <ChevronRight size={12} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
