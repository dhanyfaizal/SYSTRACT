import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Sparkles, ChevronRight,
  Clock, CheckCircle2, Users, Activity, FileText, X
} from 'lucide-react'
import { useAuth }   from '@/contexts/AuthContext'
import { useAI }     from '@/contexts/AIContext'
import { supabase }  from '@/lib/supabase'
import { queryCache } from '@/lib/queryCache'
import AISettingsModal from '@/components/ai/AISettingsModal'
import AnnouncementCarousel from '@/components/AnnouncementCarousel'
import Sk from '@/components/ui/Skeleton'

// ── Greeting ──────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 18) return 'Selamat Sore'
  return 'Selamat Malam'
}

// ── Color palette for courses ─────────────────────────────────
const COURSE_COLORS = [
  '#4f46e5','#7c3aed','#0ea5e9','#10b981',
  '#f59e0b','#ef4444','#8b5cf6','#06b6d4',
]

// ────────────────────────────────────────────────────────────────
export default function MahasiswaDashboard() {
  const { profile, user } = useAuth()
  const { setChatOpen, hasKey } = useAI()
  const navigate = useNavigate()

  const [courses,      setCourses]      = useState([])
  const [stats,        setStats]        = useState({ tasks: 0, completed: 0 })
  const [loading,      setLoading]      = useState(true)
  const [aiModal,      setAiModal]      = useState(false)

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([
      fetchCourses(),
      fetchStats(),
    ])
    setLoading(false)
  }

  async function fetchCourses() {
    try {
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('course:courses(id,code,name,credits,semester,cover_color,dosen:profiles!courses_dosen_id_fkey(full_name))')
        .eq('student_id', user.id)
        .eq('status', 'approved')
        .limit(6)

      const userCourses = (enrollData || []).map(e => e.course).filter(Boolean)

      if (userCourses.length > 0) {
        const courseIds = userCourses.map(c => c.id)

        // Fetch total materials per course
        const { data: materialsData } = await supabase
          .from('materials')
          .select('course_id')
          .in('course_id', courseIds)

        // Fetch completed materials per course
        const { data: completedData } = await supabase
          .from('course_progress')
          .select('course_id, material_id')
          .eq('student_id', user.id)
          .in('course_id', courseIds)

        // Fetch points_log for materials to sync any missing course_progress
        const { data: pointsLogData } = await supabase
          .from('points_log')
          .select('course_id, reference_id')
          .eq('user_id', user.id)
          .eq('source', 'materi')
          .in('course_id', courseIds)

        const existingProgress = new Set(completedData?.map(cp => `${cp.course_id}_${cp.material_id}`) || [])
        const missingRows = []
        const uniqueKeys = new Set()

        pointsLogData?.forEach(pl => {
          if (pl.reference_id && pl.course_id) {
            const key = `${pl.course_id}_${pl.reference_id}`
            if (!existingProgress.has(key) && !uniqueKeys.has(key)) {
              uniqueKeys.add(key)
              missingRows.push({
                student_id: user.id,
                course_id: pl.course_id,
                material_id: pl.reference_id
              })
            }
          }
        })

        if (missingRows.length > 0) {
          // Sync database course_progress table
          await supabase.from('course_progress').insert(missingRows)
          // Update completedData locally so it reflects on screen immediately
          missingRows.forEach(row => {
            completedData.push({
              course_id: row.course_id,
              material_id: row.material_id
            })
          })
        }

        // Group totals
        const totalMap = {}
        const completedMap = {}

        courseIds.forEach(id => {
          totalMap[id] = 0
          completedMap[id] = 0
        })

        materialsData?.forEach(m => {
          if (totalMap[m.course_id] !== undefined) {
            totalMap[m.course_id]++
          }
        })

        completedData?.forEach(cp => {
          if (completedMap[cp.course_id] !== undefined) {
            completedMap[cp.course_id]++
          }
        })

        // Combine progress
        const coursesWithProgress = userCourses.map(c => {
          const total = totalMap[c.id] || 0
          const completed = completedMap[c.id] || 0
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0
          return {
            ...c,
            progress: { total, completed, percent }
          }
        })

        setCourses(coursesWithProgress)
      } else {
        setCourses([])
      }
    } catch (err) {
      console.error('[SYSTRACT] Error fetching dashboard courses:', err)
      setCourses([])
    }
  }

  async function fetchStats() {
    const [{ count: tasks }, { count: completed }] = await Promise.all([
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', user.id),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', user.id).eq('status', 'graded'),
    ])

    setStats({ tasks: tasks || 0, completed: completed || 0 })
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Mahasiswa'} 👋
          </h1>
          <p className="page-subtitle">
            Semester aktif · {new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        {!hasKey && (
          <button className="btn btn-secondary btn-sm" onClick={() => setAiModal(true)} style={{ gap: 6 }}>
            <Sparkles size={13} color="var(--indigo-600)" /> Aktifkan AI Assistant
          </button>
        )}
      </div>

      {/* Announcement Carousel */}
      <AnnouncementCarousel />

      {/* Stats row */}
      <div className="stats-grid">
        <StatCard icon={<BookOpen size={16} color="#4f46e5" />} iconBg="#eef2ff" label="Kursus Saya" value={loading ? '–' : courses.length} sub="Kursus yang diikuti" />
        <StatCard icon={<CheckCircle2 size={16} color="#10b981" />} iconBg="#d1fae5" label="Tugas Selesai" value={loading ? '–' : stats.completed} sub={`dari ${stats.tasks} tugas`} />
      </div>

      {/* Main grid */}
      <div className="dashboard-grid">

        {/* ── Mata Kuliah Aktif ─────────────────────────────── */}
        <div className="span-2">
          <div className="card">
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <BookOpen size={16} color="var(--gray-500)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Kursus Saya</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/mata-kuliah')} style={{ gap: 4 }}>
                Lihat Semua <ChevronRight size={13} />
              </button>
            </div>
            <div className="card-body">
              {loading ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
                  {[1,2,3].map(i => <SkeletonCard key={i} />)}
                </div>
              ) : courses.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📚</div>
                  <p className="empty-state-text">Belum ada kursus</p>
                  <p className="empty-state-sub">Silakan daftar kursus di Katalog</p>
                </div>
              ) : (
                <div className="course-grid">
                  {courses.map((c, i) => (
                    <div
                      key={c.id}
                      className="course-card"
                      onClick={() => navigate(`/mata-kuliah/${c.id}`)}
                    >
                      <div className="course-card-banner" style={{ background: c.cover_color || COURSE_COLORS[i % COURSE_COLORS.length] }} />
                      <div className="course-card-body">
                        <div className="course-card-code">{c.code}</div>
                        <div className="course-card-name">{c.name}</div>
                        <div className="course-card-meta">
                          <span>{c.credits} SKS</span>
                          <span>{c.semester}</span>
                        </div>
                        {c.progress && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>
                              <span>Progres</span>
                              <strong>{c.progress.percent}%</strong>
                            </div>
                            <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${c.progress.percent}%`, background: 'var(--success)', borderRadius: 99, transition: 'width .3s ease' }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="course-card-footer">
                        <span style={{ display:'flex', alignItems:'center', gap: 4 }}>
                          <Users size={11} /> {c.dosen?.full_name || 'Instruktur TBA'}
                        </span>
                        <ChevronRight size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tugas Mendatang ───────────────────────────────── */}
        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <Clock size={16} color="var(--gray-500)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Tugas Mendatang</span>
              </div>
            </div>
            <div className="card-body">
              <UpcomingAssignments userId={user?.id} />
            </div>
          </div>
        </div>

        {/* ── Aktivitas Terakhir ─────────────────────────────── */}
        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <Activity size={16} color="var(--gray-500)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Aktivitas Terakhir</span>
              </div>
            </div>
            <div className="card-body">
              <RecentActivity userId={user?.id} />
            </div>
          </div>
        </div>

      </div>

      {aiModal && <AISettingsModal onClose={() => setAiModal(false)} />}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({ icon, iconBg, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-sub">{sub}</div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ height: 140, background: 'var(--gray-100)', borderRadius: 10, animation: 'pulse 1.5s ease infinite' }} />
  )
}

function UpcomingAssignments({ userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId) return
    supabase
      .from('assignments')
      .select(`
        id, title, due_date,
        course:courses!inner(name, code,
          enrollments!inner(student_id)
        )
      `)
      .eq('courses.enrollments.student_id', userId)
      .gte('due_date', new Date().toISOString())
      .order('due_date', { ascending: true })
      .limit(5)
      .then(({ data }) => { setItems(data || []); setLoading(false) })
  }, [userId])

  if (loading) return (
    <div>
      <Sk.DashboardHero/>
      <Sk.StatCards n={4}/>
      <Sk.CourseGrid n={4}/>
    </div>
  )
  if (items.length === 0) return (
    <div className="empty-state" style={{ padding: 24 }}>
      <CheckCircle2 size={24} color="var(--gray-200)" />
      <p className="empty-state-text">Tidak ada tugas mendatang</p>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 0 }}>
      {items.map((a, i) => {
        const due = new Date(a.due_date)
        const daysLeft = Math.ceil((due - Date.now()) / 86400000)
        return (
          <div key={a.id} style={{
            display:'flex', alignItems:'center', gap: 14,
            padding: '11px 0',
            borderBottom: i < items.length-1 ? '1px solid var(--gray-100)' : 'none'
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background:'var(--indigo-50)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <CheckCircle2 size={16} color="var(--indigo-600)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color:'var(--gray-800)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
              <div style={{ fontSize: 11, color:'var(--gray-400)', marginTop: 2 }}>
                {a.course?.code} · {a.course?.name}
              </div>
            </div>
            <div style={{ textAlign:'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: daysLeft <= 2 ? 'var(--danger)' : daysLeft <= 7 ? 'var(--warning)' : 'var(--success)' }}>
                {daysLeft === 0 ? 'Hari ini!' : daysLeft === 1 ? 'Besok' : `${daysLeft} hari`}
              </div>
              <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                {due.toLocaleDateString('id-ID', { day:'numeric', month:'short' })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)    return 'Baru saja'
  if (m < 60)   return `${m} mnt lalu`
  if (m < 1440) return `${Math.floor(m/60)} jam lalu`
  return `${Math.floor(m/1440)} hari lalu`
}

function RecentActivity({ userId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    
    async function fetchActivities() {
      try {
        const [subRes, progressRes, examRes] = await Promise.all([
          supabase
            .from('submissions')
            .select(`
              id, status, submitted_at, updated_at, grade,
              assignment:assignments(title, course:courses(name, code))
            `)
            .eq('student_id', userId)
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase
            .from('course_progress')
            .select(`
              id, completed_at,
              material:materials(title),
              course:courses(name, code)
            `)
            .eq('student_id', userId)
            .order('completed_at', { ascending: false })
            .limit(5),
          supabase
            .from('exam_answers')
            .select(`
              id, score, started_at, submitted_at, attempt_number,
              exam:exams(title, exam_mode, passing_grade, course:courses(name, code))
            `)
            .eq('student_id', userId)
            .not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false })
            .limit(5)
        ])

        const list = []

        if (subRes.data) {
          subRes.data.forEach(s => {
            list.push({
              id: `sub_${s.id}`,
              type: 'assignment',
              title: s.assignment?.title,
              courseCode: s.assignment?.course?.code,
              courseName: s.assignment?.course?.name,
              time: s.submitted_at || s.updated_at,
              status: s.status,
              grade: s.grade
            })
          })
        }

        if (progressRes.data) {
          progressRes.data.forEach(p => {
            list.push({
              id: `progress_${p.id}`,
              type: 'material',
              title: p.material?.title,
              courseCode: p.course?.code,
              courseName: p.course?.name,
              time: p.completed_at,
            })
          })
        }

        if (examRes.data) {
          examRes.data.forEach(e => {
            list.push({
              id: `exam_${e.id}`,
              type: 'exam',
              title: e.exam?.title,
              courseCode: e.exam?.course?.code,
              courseName: e.exam?.course?.name,
              time: e.submitted_at,
              score: e.score,
              passingGrade: e.exam?.passing_grade || 70,
            })
          })
        }

        const sorted = list
          .filter(a => a.time)
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .slice(0, 5)

        setActivities(sorted)
      } catch (err) {
        console.error('[SYSTRACT] Error fetching recent activities:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchActivities()
  }, [userId])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gray-100)', animation: 'pulse 1.5s ease infinite', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: 'var(--gray-100)', borderRadius: 4, width: '60%', marginBottom: 6, animation: 'pulse 1.5s ease infinite' }} />
            <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 4, width: '40%', animation: 'pulse 1.5s ease infinite' }} />
          </div>
        </div>
      ))}
    </div>
  )

  if (activities.length === 0) return (
    <div className="empty-state" style={{ padding: 24 }}>
      <Activity size={24} color="var(--gray-200)" />
      <p className="empty-state-text">Belum ada aktivitas belajar</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activities.map((a, i) => {
        // Icon logic
        let icon = <BookOpen size={15} color="var(--indigo-600)" />
        let iconBg = 'var(--indigo-50)'
        let activityLabel = ''
        
        if (a.type === 'assignment') {
          const isGraded = a.status === 'graded'
          icon = isGraded 
            ? <CheckCircle2 size={15} color="var(--success)" />
            : <FileText size={15} color="var(--warning)" />
          iconBg = isGraded ? '#ecfdf5' : '#fffbeb'
          activityLabel = isGraded ? 'Tugas Dinilai' : 'Mengirim Tugas'
        } else if (a.type === 'material') {
          icon = <BookOpen size={15} color="#0ea5e9" />
          iconBg = '#f0f9ff'
          activityLabel = 'Membaca Materi'
        } else if (a.type === 'exam') {
          const isPassed = a.score !== null && a.score !== undefined && Number(a.score) >= a.passingGrade
          icon = isPassed
            ? <CheckCircle2 size={15} color="var(--success)" />
            : <X size={15} color="var(--danger)" />
          iconBg = isPassed ? '#ecfdf5' : '#fef2f2'
          activityLabel = isPassed ? 'Lulus Ujian' : 'Selesai Ujian'
        }

        return (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '11px 0',
            borderBottom: i < activities.length - 1 ? '1px solid var(--gray-100)' : 'none'
          }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifycontent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                {activityLabel} · {a.courseCode}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                {timeAgo(a.time)}
              </div>
              {a.type === 'assignment' && a.grade !== null && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginTop: 2 }}>
                  Nilai: {a.grade}
                </div>
              )}
              {a.type === 'exam' && a.score !== null && (
                <div style={{ fontSize: 11, fontWeight: 700, color: Number(a.score) >= a.passingGrade ? 'var(--success)' : 'var(--danger)', marginTop: 2 }}>
                  Skor: {a.score}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
