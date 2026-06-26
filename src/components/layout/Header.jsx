import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bell, Settings, LogOut, User,
  ChevronDown, Sparkles, PanelLeftOpen, PanelLeftClose,
  Sun, Moon, CheckCheck, Megaphone, BookOpen, ClipboardList
} from 'lucide-react'
import { useAuth }    from '@/contexts/AuthContext'
import { useAI }      from '@/contexts/AIContext'
import { useTheme }   from '@/contexts/ThemeContext'
import { useSidebar } from './AppLayout'
import GlobalSearch   from './GlobalSearch'
import { supabase }   from '@/lib/supabase'

const LOGO_URL = 'https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png'

function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)    return 'Baru saja'
  if (m < 60)   return `${m} mnt lalu`
  if (m < 1440) return `${Math.floor(m/60)} jam lalu`
  return `${Math.floor(m/1440)} hari lalu`
}

const NOTIF_ICON = {
  announcement: { icon: Megaphone,     color: '#4f46e5', bg: '#eef2ff' },
  assignment:   { icon: ClipboardList, color: '#f59e0b', bg: '#fffbeb' },
  grade:        { icon: BookOpen,      color: '#10b981', bg: '#f0fdf4' },
  default:      { icon: Bell,          color: '#6b7280', bg: '#f9fafb' },
}

export default function Header() {
  const { profile, signOut, user } = useAuth()
  const { setChatOpen }            = useAI()
  const { open, toggle, examMode }  = useSidebar()
  const { theme, toggleTheme }     = useTheme()
  const navigate                   = useNavigate()

  const [dropOpen,  setDropOpen]  = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs,    setNotifs]    = useState([])
  const [notifLoading, setNotifLoading] = useState(false)
  const dropRef     = useRef(null)
  const notifRef    = useRef(null)
  const lastFetchRef = useRef(0)  // timestamp terakhir fetch notif

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current  && !dropRef.current.contains(e.target))  setDropOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch notifications — dengan cache 60 detik
  const fetchNotifs = useCallback(async (force = false) => {
    if (!user || !profile) return
    const now = Date.now()
    // Skip jika data masih segar (< 60 detik) dan tidak dipaksa
    if (!force && now - lastFetchRef.current < 60_000) return
    setNotifLoading(true)
    lastFetchRef.current = now

    const role  = profile.role
    const items = []

    try {
      // Parallel: jalankan semua query sekaligus
      const since7d  = new Date(now - 7  * 86400_000).toISOString()
      const since3d  = new Date(now - 3  * 86400_000).toISOString()

      const [annRes, gradedRes, asgnRes, pendingRes] = await Promise.all([
        // 1. Pengumuman aktif (semua role)
        supabase.from('announcements')
          .select('id, title, type, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5),

        // 2. Mahasiswa: tugas yang baru dinilai
        role === 'mahasiswa'
          ? supabase.from('submissions')
              .select('id, grade, updated_at, assignment:assignments(title)')
              .eq('student_id', user.id)
              .not('grade', 'is', null)
              .gte('updated_at', since7d)
              .order('updated_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: null }),

        // 3. Mahasiswa: tugas baru 3 hari terakhir
        role === 'mahasiswa'
          ? supabase.from('assignments')
              .select('id, title, due_date, created_at')
              .gte('created_at', since3d)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: null }),

        // 4. Dosen: submission belum dinilai
        role === 'dosen'
          ? supabase.from('submissions')
              .select('id, submitted_at, student:profiles(full_name), assignment:assignments!inner(title, course:courses!inner(dosen_id))')
              .eq('assignment.course.dosen_id', user.id)
              .is('grade', null)
              .order('submitted_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: null }),
      ])

      ;(annRes.data    || []).forEach(a => items.push({
        id: `ann-${a.id}`,   type: 'announcement',
        text: a.title,       sub: a.type === 'global' ? 'Pengumuman Global' : 'Pengumuman',
        time: a.created_at,
      }))
      ;(gradedRes.data || []).forEach(s => items.push({
        id: `grade-${s.id}`, type: 'grade',
        text: `Nilai masuk: ${s.assignment?.title || 'Tugas'}`,
        sub: `Nilai: ${s.grade}`,          time: s.updated_at,
      }))
      ;(asgnRes.data   || []).forEach(a => items.push({
        id: `asgn-${a.id}`,  type: 'assignment',
        text: `Tugas baru: ${a.title}`,
        sub: a.due_date ? `Deadline ${new Date(a.due_date).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}` : 'Segera kerjakan',
        time: a.created_at,
      }))
      ;(pendingRes.data || []).forEach(s => items.push({
        id: `sub-${s.id}`,   type: 'assignment',
        text: `Pengumpulan baru: ${s.assignment?.title || 'Tugas'}`,
        sub: `Dari ${s.student?.full_name || 'Mahasiswa'} · belum dinilai`,
        time: s.submitted_at,
      }))
    } catch (_) { /* ignore errors — notif is best-effort */ }

    items.sort((a, b) => new Date(b.time) - new Date(a.time))
    setNotifs(items.slice(0, 8))
    setNotifLoading(false)
  }, [user, profile])

  // Load saat pertama kali user tersedia
  useEffect(() => { if (user && profile) fetchNotifs() }, [fetchNotifs])

  function handleOpenNotif() {
    const next = !notifOpen
    setNotifOpen(next)
    // Re-fetch hanya saat buka panel DAN data sudah > 60 detik
    if (next) fetchNotifs()
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
    : 'U'

  const unreadCount = notifs.length

  return (
    <>
      <header className="app-header">
        {/* Sidebar toggle — disabled during exam */}
        <button onClick={examMode ? undefined : toggle}
          className="btn btn-ghost btn-icon"
          title={examMode ? 'Sidebar disembunyikan selama ujian' : (open ? 'Sembunyikan sidebar' : 'Tampilkan sidebar')}
          style={{ opacity: examMode ? 0.3 : 1, cursor: examMode ? 'not-allowed' : 'pointer' }}
        >
          {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <span className="header-sep" />

        {/* Search */}
        <GlobalSearch />

        <div className="header-actions">
          {/* Theme toggle */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            style={{ transition: 'transform .3s' }}
          >
            {theme === 'dark'
              ? <Sun  size={16} color="#fbbf24" />
              : <Moon size={16} />}
          </button>

          {/* AI Assistant shortcut */}
          <button
            className="btn btn-ghost btn-icon"
            title="AI Assistant"
            onClick={() => setChatOpen(true)}
          >
            <Sparkles size={16} color="var(--indigo-600)" />
          </button>

          {/* ── Notifications ───────────────────────────────── */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={handleOpenNotif}
              title="Notifikasi"
              style={{ position: 'relative' }}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span style={{
                  position:'absolute', top:4, right:4,
                  minWidth:16, height:16, borderRadius:99,
                  background:'#ef4444', color:'white',
                  fontSize:9, fontWeight:700,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:'0 4px', lineHeight:1,
                  boxShadow:'0 0 0 2px var(--bg-page)',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="dropdown-menu" style={{ width: 320, maxHeight: 420, display:'flex', flexDirection:'column' }}>
                {/* Header */}
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                  <strong style={{ fontSize:13 }}>Notifikasi</strong>
                  {notifs.length > 0 && (
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--indigo-600)', cursor:'pointer' }}
                      onClick={() => setNotifs([])}>
                      Tandai semua dibaca
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{ overflowY:'auto', flex:1 }}>
                  {notifLoading ? (
                    <div style={{ padding:32, display:'flex', justifyContent:'center' }}>
                      <div className="spinner"/>
                    </div>
                  ) : notifs.length === 0 ? (
                    <div className="empty-state" style={{ padding:'28px 16px' }}>
                      <Bell size={28} color="var(--gray-300)" />
                      <span className="empty-state-text" style={{ fontSize:12 }}>Belum ada notifikasi</span>
                    </div>
                  ) : (
                    notifs.map(n => {
                      const meta = NOTIF_ICON[n.type] || NOTIF_ICON.default
                      const IconComp = meta.icon
                      return (
                        <div key={n.id} style={{
                          display:'flex', alignItems:'flex-start', gap:12,
                          padding:'12px 16px', borderBottom:'1px solid var(--gray-50)',
                          cursor:'pointer', transition:'background .1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{
                            width:34, height:34, borderRadius:10, flexShrink:0,
                            background: meta.bg, display:'flex', alignItems:'center', justifyContent:'center',
                          }}>
                            <IconComp size={15} color={meta.color}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-800)', marginBottom:2, lineHeight:1.4 }}>
                              {n.text}
                            </div>
                            <div style={{ fontSize:11, color:'var(--gray-400)' }}>{n.sub}</div>
                            <div style={{ fontSize:10, color:'var(--gray-300)', marginTop:3 }}>{timeAgo(n.time)}</div>
                          </div>
                          <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--indigo-500)', flexShrink:0, marginTop:4 }}/>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button className="avatar-btn" onClick={() => setDropOpen(v => !v)}>
              <div className="avatar">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt={profile.full_name} />
                  : initials
                }
              </div>
              <span className="avatar-name" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.full_name || 'Pengguna'}
              </span>
              <ChevronDown size={12} color="var(--gray-400)" />
            </button>

            {dropOpen && (
              <div className="dropdown-menu">
                {/* User info */}
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-900)' }}>
                    {profile?.full_name || 'Pengguna'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                    {profile?.role?.toUpperCase()} {profile?.nim ? `· ${profile.nim}` : profile?.nidn ? `· ${profile.nidn}` : ''}
                  </div>
                </div>

                <button className="dropdown-item" onClick={() => { navigate('/profile'); setDropOpen(false) }}>
                  <User size={14} /> Profil Saya
                </button>
                <button className="dropdown-item" onClick={() => { navigate('/settings'); setDropOpen(false) }}>
                  <Settings size={14} /> Pengaturan
                </button>

                <div className="dropdown-sep" />

                <button className="dropdown-item danger" onClick={signOut}>
                  <LogOut size={14} /> Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

    </>
  )
}
