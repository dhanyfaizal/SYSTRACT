import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Trophy, Star, Sparkles, ChevronRight,
  Clock, CheckCircle2, Users, TrendingUp, Award
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
  const [leaderboard,  setLeaderboard]  = useState([])
  const [myBadges,     setMyBadges]     = useState([])
  const [allBadges,    setAllBadges]    = useState([])
  const [stats,        setStats]        = useState({ tasks: 0, completed: 0, points: 0, rank: '-' })
  const [loading,      setLoading]      = useState(true)
  const [aiModal,      setAiModal]      = useState(false)

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([
      fetchCourses(),
      fetchLeaderboard(),
      fetchBadges(),
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

  async function fetchLeaderboard() {
    const data = await queryCache.get(
      'leaderboard_top5',
      () => supabase
        .from('leaderboard')
        .select('user_id,full_name,nim,avatar_url,total_points,rank')
        .order('rank', { ascending: true })
        .limit(5),
      2 * 60 * 1000  // cache 2 menit
    )
    setLeaderboard(data || [])
  }

  async function fetchBadges() {
    const [allB, myB] = await Promise.all([
      queryCache.get(
        'all_badges',
        () => supabase.from('badges').select('*').limit(12),
        10 * 60 * 1000  // cache 10 menit — badges jarang berubah
      ),
      supabase.from('user_badges').select('badge_id').eq('user_id', user.id)
        .then(r => r.data),
    ])
    setAllBadges(allB || [])
    const earned = new Set((myB || []).map(b => b.badge_id))
    setMyBadges((allB || []).filter(b => earned.has(b.id)))
  }

  async function fetchStats() {
    // Step 1: Ambil semester aktif + submission counts sekaligus (parallel)
    const [{ data: semData }, { count: tasks }, { count: completed }] = await Promise.all([
      supabase.from('semesters').select('id').eq('is_active', true).maybeSingle(),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', user.id),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', user.id).eq('status', 'graded'),
    ])

    let totalPoints = 0, myRankNum = '-'

    if (semData?.id) {
      // Step 2a: Ambil total points (sudah parallel dengan step 1 tidak bisa, tapi semester jarang berubah)
      const { data: ptData } = await supabase
        .from('points_log')
        .select('points')
        .eq('user_id', user.id)
        .eq('semester_id', semData.id)
      totalPoints = (ptData || []).reduce((s, r) => s + (r.points || 0), 0)
    } else {
      // Step 2b: Fallback ke leaderboard jika belum ada semester aktif
      const { data: ld } = await supabase.from('leaderboard').select('total_points,rank').eq('user_id', user.id).maybeSingle()
      totalPoints = ld?.total_points || 0
      myRankNum   = ld?.rank || '-'
    }

    setStats({ tasks: tasks || 0, completed: completed || 0, points: totalPoints, rank: myRankNum })
  }

  const myRank = leaderboard.find(l => l.user_id === user?.id)

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
        <StatCard icon={<Star size={16} color="#f59e0b" />} iconBg="#fef3c7" label="Total Poin" value={loading ? '–' : stats.points} sub="Poin gamifikasi" />
        <StatCard icon={<TrendingUp size={16} color="#ef4444" />} iconBg="#fee2e2" label="Peringkat" value={loading ? '–' : `#${stats.rank}`} sub="Leaderboard angkatan" />
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

        {/* ── Leaderboard ───────────────────────────────────── */}
        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <Trophy size={16} color="var(--gray-500)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Leaderboard</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/leaderboard')} style={{ gap: 4 }}>
                Semua <ChevronRight size={13} />
              </button>
            </div>
            <div className="card-body" style={{ padding: '8px 16px' }}>
              {loading ? (
                <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                  {[1,2,3,4,5].map(i=><div key={i} style={{height:40,background:'var(--gray-100)',borderRadius:6,animation:'pulse 1.5s ease infinite'}}/>)}
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <Trophy size={24} color="var(--gray-200)" />
                  <p className="empty-state-text">Belum ada data</p>
                </div>
              ) : (
                leaderboard.map((lb) => {
                  const isMe = lb.user_id === user?.id
                  const rankClass = lb.rank === 1 ? 'lb-rank-1' : lb.rank === 2 ? 'lb-rank-2' : lb.rank === 3 ? 'lb-rank-3' : 'lb-rank-n'
                  return (
                    <div key={lb.user_id} className={`leaderboard-row${isMe ? ' lb-me' : ''}`}>
                      <div className={`lb-rank ${rankClass}`}>
                        {lb.rank === 1 ? '🥇' : lb.rank === 2 ? '🥈' : lb.rank === 3 ? '🥉' : lb.rank}
                      </div>
                      <div className="lb-avatar">
                        {lb.avatar_url ? <img src={lb.avatar_url} alt="" /> : (lb.full_name?.[0] || 'U')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lb-name" style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                          {lb.full_name} {isMe && <span style={{ fontSize:10, color:'var(--indigo-600)', fontWeight:700 }}>(Anda)</span>}
                        </div>
                        <div className="lb-nim">{lb.nim}</div>
                      </div>
                      <div className="lb-pts">{lb.total_points} pts</div>
                    </div>
                  )
                })
              )}
            </div>
            {myRank && (
              <div className="card-footer" style={{ fontSize: 12, color: 'var(--gray-500)', display:'flex', justifyContent:'space-between' }}>
                <span>Posisi Anda</span>
                <strong style={{ color: 'var(--indigo-600)' }}>#{myRank.rank} · {myRank.total_points} pts</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── My Badges ─────────────────────────────────────── */}
        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <Award size={16} color="var(--gray-500)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>My Badges</span>
              </div>
              <span className="badge-pill badge-indigo">{myBadges.length}/{allBadges.length}</span>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="badges-grid">
                  {[1,2,3,4,5,6].map(i=><div key={i} style={{height:80,background:'var(--gray-100)',borderRadius:8}}/>)}
                </div>
              ) : allBadges.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <Award size={24} color="var(--gray-200)" />
                  <p className="empty-state-text">Belum ada badges</p>
                </div>
              ) : (
                <div className="badges-grid">
                  {allBadges.map(badge => {
                    const earned = myBadges.some(b => b.id === badge.id)
                    return (
                      <div
                        key={badge.id}
                        className={`badge-item${!earned ? ' locked' : ''}`}
                        title={`${badge.name}: ${badge.description}`}
                      >
                        <div className="badge-emoji">{badge.icon_emoji || '🏅'}</div>
                        <div className="badge-name">{badge.name}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {myBadges.length > 0 && (
              <div className="card-footer" style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                🎉 {myBadges.length} badge berhasil diraih — terus belajar!
              </div>
            )}
          </div>
        </div>

        {/* ── Aktivitas Terbaru ──────────────────────────────── */}
        <div className="span-2">
          <div className="card">
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
