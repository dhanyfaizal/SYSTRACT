import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Users, ClipboardList, BarChart2,
  FileText, MessageSquare, Upload, CheckCircle2,
  Clock, AlertCircle, ChevronRight, Activity
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import AnnouncementCarousel from '@/components/AnnouncementCarousel'
import Sk from '@/components/ui/Skeleton'

/* ── helpers ──────────────────────────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString('id-ID', { day:'numeric', month:'short' })
}

const ACTIVITY_META = {
  submission: { icon: Upload,       color:'#4f46e5', bg:'#eef2ff', label:'Kumpul Tugas'    },
  exam:       { icon: FileText,     color:'#0891b2', bg:'#e0f2fe', label:'Selesai Ujian'   },
  forum:      { icon: MessageSquare,color:'#7c3aed', bg:'#f3e8ff', label:'Post Forum'      },
  graded:     { icon: CheckCircle2, color:'#10b981', bg:'#d1fae5', label:'Sudah Dinilai'   },
  late:       { icon: AlertCircle,  color:'#f59e0b', bg:'#fef3c7', label:'Terlambat'       },
}

export default function DosenDashboard() {
  const { user, profile } = useAuth()
  const _navigate          = useNavigate()

  const [stats,    setStats]    = useState({ courses:0, students:0, activeTasks:0, ungraded:0 })
  const [loading,  setLoading]  = useState(true)
  const [activity, setActivity] = useState([])   // recent activities
  const [actLoad,  setActLoad]  = useState(true)

  useEffect(() => { if (user) { fetchStats(); fetchActivity() } }, [user])

  /* ── Stats ───────────────────────────────────────────────── */
  async function fetchStats() {
    // Courses milik dosen
    const { data: courses } = await supabase.from('courses')
      .select('id').eq('dosen_id', user.id)
    const courseIds = (courses || []).map(c => c.id)

    if (!courseIds.length) { setStats({ courses:0, students:0, activeTasks:0, ungraded:0 }); setLoading(false); return }

    // Total mahasiswa unik
    const { count: students } = await supabase.from('enrollments')
      .select('id', { count:'exact', head:true })
      .in('course_id', courseIds)

    // Tugas aktif (due_date >= hari ini ATAU tidak ada deadline)
    const today = new Date().toISOString()
    const { count: activeTasks } = await supabase.from('assignments')
      .select('id', { count:'exact', head:true })
      .in('course_id', courseIds)
      .or(`due_date.gte.${today},due_date.is.null`)

    // Submisi belum dinilai
    const { count: ungraded } = await supabase.from('submissions')
      .select('id', { count:'exact', head:true })
      .in('course_id', courseIds)
      .eq('status', 'submitted')

    setStats({ courses: courseIds.length, students: students||0, activeTasks: activeTasks||0, ungraded: ungraded||0 })
    setLoading(false)
  }

  /* ── Recent Activity ─────────────────────────────────────── */
  async function fetchActivity() {
    setActLoad(true)

    const { data: courses } = await supabase.from('courses')
      .select('id, name, code').eq('dosen_id', user.id)
    const courseIds = (courses || []).map(c => c.id)
    const courseMap = Object.fromEntries((courses||[]).map(c => [c.id, c]))

    if (!courseIds.length) { setActivity([]); setActLoad(false); return }

    // Fetch 3 sumber aktivitas secara paralel
    const [subRes, examRes, forumRes] = await Promise.all([
      // Submisi tugas terbaru
      supabase.from('submissions')
        .select('id, submitted_at, status, assignment:assignments(title, course_id), student:profiles(full_name, nim, avatar_url)')
        .in('course_id', courseIds)
        .in('status', ['submitted','graded','late'])
        .order('submitted_at', { ascending: false })
        .limit(15),

      // Ujian selesai terbaru
      supabase.from('exam_answers')
        .select('id, submitted_at, score, attempt_number, exam:exams!inner(title, course_id), student:profiles(full_name, nim, avatar_url)')
        .in('exams.course_id', courseIds)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false })
        .limit(15),

      // Post forum terbaru
      // Balasan forum terbaru (tabel forum_posts/forum_topics tidak ada; yang dipakai forums + forum_replies)
      supabase.from('forum_replies')
        .select('id, created_at, content:body, topic:forums!inner(title, course_id), author:profiles(full_name, nim, avatar_url)')
        .in('topic.course_id', courseIds)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const items = []

    // Submissions
    ;(subRes.data || []).forEach(s => {
      const courseId = s.assignment?.course_id
      items.push({
        id:        's_' + s.id,
        type:      s.status === 'late' ? 'late' : s.status === 'graded' ? 'graded' : 'submission',
        time:      s.submitted_at,
        student:   s.student,
        title:     s.assignment?.title || 'Tugas',
        course:    courseMap[courseId],
        meta:      s.status === 'graded' ? 'Sudah dinilai' : s.status === 'late' ? 'Terlambat' : 'Menunggu penilaian',
      })
    })

    // Exam answers
    ;(examRes.data || []).forEach(e => {
      const courseId = e.exam?.course_id
      items.push({
        id:      'e_' + e.id,
        type:    'exam',
        time:    e.submitted_at,
        student: e.student,
        title:   e.exam?.title || 'Ujian',
        course:  courseMap[courseId],
        meta:    e.score !== null ? `Skor: ${e.score}` : `Percobaan #${e.attempt_number}`,
      })
    })

    // Forum posts
    ;(forumRes.data || []).forEach(f => {
      const courseId = f.topic?.course_id
      items.push({
        id:      'f_' + f.id,
        type:    'forum',
        time:    f.created_at,
        student: f.author,
        title:   f.topic?.title || 'Forum',
        course:  courseMap[courseId],
        meta:    (f.content || '').slice(0, 80) + (f.content?.length > 80 ? '…' : ''),
      })
    })

    // Sort by time desc, take 20
    items.sort((a, b) => new Date(b.time) - new Date(a.time))
    setActivity(items.slice(0, 20))
    setActLoad(false)
  }

  const STATS = [
    { icon: <BookOpen size={16} color="#4f46e5"/>, bg:'#eef2ff', label:'Mata Kuliah',    value: loading ? '–' : stats.courses    },
    { icon: <Users    size={16} color="#10b981"/>, bg:'#d1fae5', label:'Total Mahasiswa', value: loading ? '–' : stats.students   },
    { icon: <ClipboardList size={16} color="#f59e0b"/>, bg:'#fef3c7', label:'Tugas Aktif', value: loading ? '–' : stats.activeTasks },
    { icon: <BarChart2 size={16} color="#dc2626"/>, bg:'#fee2e2', label:'Belum Dinilai',  value: loading ? '–' : stats.ungraded,
      badge: stats.ungraded > 0 },
  ]

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard Dosen</h1>
        <p className="page-subtitle">Selamat datang, {profile?.full_name}</p>
      </div>

      {/* Announcement Carousel */}
      <AnnouncementCarousel showManage managePath="/pengumuman" />

      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom:24 }}>
        {STATS.map(s => (
          <div className="stat-card" key={s.label} style={{ position:'relative' }}>
            <div className="stat-card-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value">{s.value}</div>
            {s.badge && !loading && (
              <span style={{ position:'absolute', top:14, right:14, background:'#dc2626', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99 }}>
                Perlu aksi
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Activity size={16} color="var(--indigo-600)"/>
            <span style={{ fontWeight:700, fontSize:14 }}>Aktivitas Terbaru Mahasiswa</span>
          </div>
          <span style={{ fontSize:11, color:'var(--gray-400)' }}>Dari semua mata kuliah Anda</span>
        </div>

        {actLoad ? (
          <Sk.CardList n={4}/>
        ) : activity.length === 0 ? (
          <div className="empty-state" style={{ padding:'40px 24px' }}>
            <Activity size={28} color="var(--gray-200)"/>
            <p className="empty-state-text">Belum ada aktivitas</p>
            <p className="empty-state-sub">Aktivitas mahasiswa akan muncul di sini</p>
          </div>
        ) : (
          <div>
            {activity.map((item, i) => {
              const meta  = ACTIVITY_META[item.type] || ACTIVITY_META.submission
              const Icon  = meta.icon
              const initials = item.student?.full_name
                ? item.student.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                : '?'

              return (
                <div key={item.id} style={{
                  display:'flex', alignItems:'flex-start', gap:12,
                  padding:'12px 20px',
                  borderBottom: i < activity.length-1 ? '1px solid var(--gray-100)' : 'none',
                  transition:'background .1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--gray-50)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  {/* Activity type icon */}
                  <div style={{ width:32, height:32, borderRadius:8, background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                    <Icon size={15} color={meta.color}/>
                  </div>

                  {/* Student avatar */}
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--indigo-100)', color:'var(--indigo-700)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0, overflow:'hidden', marginTop:1 }}>
                    {item.student?.avatar_url
                      ? <img src={item.student.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : initials}
                  </div>

                  {/* Content */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:'var(--gray-800)', lineHeight:1.4 }}>
                      <span style={{ fontWeight:700 }}>{item.student?.full_name || 'Mahasiswa'}</span>
                      {' '}
                      <span style={{ color:'var(--gray-500)' }}>{meta.label.toLowerCase()}</span>
                      {' · '}
                      <span style={{ fontWeight:600 }}>{item.title}</span>
                    </div>
                    {item.meta && (
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.meta}
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
                      {item.course && (
                        <span style={{ fontSize:10, fontWeight:600, background:'var(--indigo-50)', color:'var(--indigo-600)', padding:'1px 7px', borderRadius:99 }}>
                          {item.course.code}
                        </span>
                      )}
                      <span style={{ fontSize:10, color:'var(--gray-400)' }}>
                        <Clock size={10} style={{ display:'inline', marginRight:3, verticalAlign:'middle' }}/>
                        {timeAgo(item.time)}
                      </span>
                    </div>
                  </div>

                  {/* NIM */}
                  <div style={{ fontSize:11, color:'var(--gray-400)', flexShrink:0, alignSelf:'center', fontFamily:'monospace' }}>
                    {item.student?.nim}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
