import { useState, useEffect } from 'react'
import { Users, BookOpen, Trophy, Clock, TrendingUp, UserCheck, GraduationCap, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import AnnouncementCarousel from '@/components/AnnouncementCarousel'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [stats,   setStats]   = useState({ users: null, courses: null, badges: null, pending: null })
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchStats() }, [])

  async function fetchStats() {
    const [
      { count: userCount },
      { count: courseCount },
      { count: badgeCount },
      { data: pendingRoles },
      { data: recentUsers },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('courses').select('*',   { count: 'exact', head: true }),
      supabase.from('badges').select('*',    { count: 'exact', head: true }),
      supabase.from('profiles').select('id').eq('role', 'guest'),
      supabase.from('profiles').select('id, full_name, email, role, avatar_url, created_at')
        .order('created_at', { ascending: false }).limit(6),
    ])

    setStats({
      users:   userCount,
      courses: courseCount,
      badges:  badgeCount,
      pending: pendingRoles?.length || 0,
    })
    setRecent(recentUsers || [])
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam'
  const ROLE_COLORS = { admin:'badge-red', dosen:'badge-amber', mahasiswa:'badge-indigo', guest:'badge-slate' }

  const quickActions = [
    { label: 'Kelola Pengguna',  icon: Users,         to: '/admin/users',      color: 'var(--indigo-600)', bg: 'var(--indigo-50)' },
    { label: 'Enrollment MK',    icon: GraduationCap, to: '/admin/enrollment', color: '#10b981',           bg: '#d1fae5' },
    { label: 'Mata Kuliah',      icon: BookOpen,      to: '/mata-kuliah',      color: '#f59e0b',           bg: '#fef3c7' },
    { label: 'Leaderboard',      icon: Trophy,        to: '/leaderboard',      color: '#8b5cf6',           bg: '#ede9fe' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Shield size={16} color="var(--indigo-600)" />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--indigo-600)', textTransform:'uppercase', letterSpacing:'.5px' }}>Administrator</span>
          </div>
          <h1 className="page-title">{greeting}, {profile?.full_name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p className="page-subtitle">Selamat datang di Admin Panel SYSTRACT</p>
        </div>
      </div>

      {/* Announcement Carousel */}
      <AnnouncementCarousel showManage managePath="/admin/announcements" />

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Pengguna',    value: stats.users,   icon: Users,      color: 'var(--indigo-600)', bg: 'var(--indigo-50)' },
          { label: 'Mata Kuliah Aktif', value: stats.courses, icon: BookOpen,   color: '#10b981',           bg: '#d1fae5' },
          { label: 'Badges Tersedia',   value: stats.badges,  icon: Trophy,     color: '#f59e0b',           bg: '#fef3c7' },
          { label: 'Role Pending',      value: stats.pending, icon: Clock,      color: '#ef4444',           bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-icon" style={{ background: s.bg }}>
              <s.icon size={16} color={s.color} />
            </div>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value">
              {loading ? '–' : (s.value ?? 0)}
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <strong style={{ fontSize: 13 }}>Aksi Cepat</strong>
          </div>
          <div className="card-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {quickActions.map(a => (
              <button key={a.to} onClick={() => navigate(a.to)}
                style={{
                  display:'flex', flexDirection:'column', alignItems:'flex-start', gap:8,
                  padding:'14px 16px', border:'1px solid var(--gray-200)', borderRadius:8,
                  background:'#fff', cursor:'pointer', textAlign:'left', transition:'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.background = a.bg }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.background = '#fff' }}
              >
                <div style={{ width:32, height:32, borderRadius:8, background:a.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <a.icon size={15} color={a.color}/>
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--gray-800)' }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Users */}
        <div className="card">
          <div className="card-header">
            <strong style={{ fontSize: 13 }}>Pengguna Terbaru</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/users')}>
              Lihat Semua
            </button>
          </div>
          <div style={{ padding:'4px 0' }}>
            {loading ? (
              <div style={{ padding:20, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
            ) : recent.length === 0 ? (
              <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Belum ada pengguna</div>
            ) : recent.map((u, i) => (
              <div key={u.id} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 16px',
                borderBottom: i < recent.length-1 ? '1px solid var(--gray-100)' : 'none',
              }}>
                <div className="avatar" style={{ width:32, height:32, fontSize:12 }}>
                  {u.avatar_url ? <img src={u.avatar_url} alt=""/> : u.full_name?.[0]||'U'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {u.full_name || u.email}
                  </div>
                  <div style={{ fontSize:11, color:'var(--gray-400)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                </div>
                <span className={`badge-pill ${ROLE_COLORS[u.role]||'badge-slate'}`} style={{ flexShrink:0 }}>
                  {u.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
