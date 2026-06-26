import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, ClipboardList, FileText,
  MessageSquare, BarChart2, GraduationCap,
  Users, Settings, ChevronRight, ChevronDown,
  BookMarked, Trophy, Shield, Database, LogOut, Megaphone,
  CalendarDays, CheckCircle2, Calendar, Award, UserCheck, ShoppingBag
} from 'lucide-react'
import { useAuth }    from '@/contexts/AuthContext'
import { useSidebar } from './AppLayout'
import { useState, useEffect } from 'react'
import { supabase }   from '@/lib/supabase'

const LOGO_URL = 'https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png'

// Sub-items per role inside a course
const DOSEN_COURSE_SUBS = [
  { label:'Materi',       icon: BookMarked,    key:'materi',      to: (id) => `/materi?courseId=${id}`       },
  { label:'Tugas',        icon: ClipboardList, key:'tugas',       to: (id) => `/tugas?courseId=${id}`        },
  { label:'Forum',        icon: MessageSquare, key:'forum',       to: (id) => `/forum?courseId=${id}`        },
  { label:'Ujian',        icon: FileText,      key:'ujian',       to: (id) => `/ujian?courseId=${id}`        },
  { label:'Bank Soal',    icon: Database,      key:'bank-soal',   to: (id) => `/bank-soal?courseId=${id}`    },
  { label:'Presensi',     icon: UserCheck,     key:'presensi',    to: (id) => `/absensi?courseId=${id}`      },
]

const STATIC_NAV = {
  mahasiswa: [
    { section:'Beranda',  items:[
      { label:'Dashboard',  icon:LayoutDashboard, to:'/dashboard' },
      { label:'Katalog Kursus', icon:BookOpen, to:'/katalog' }
    ] },
    { section:'Evaluasi', items:[
      { label:'Nilai & Sertifikat', icon:BarChart2, to:'/nilai' },
    ]},
  ],
  dosen: [
    { section:'Beranda',  items:[{ label:'Dashboard', icon:LayoutDashboard, to:'/dashboard' }] },
    { section:'Penilaian', items:[
      { label:'Analitik',    icon:BarChart2,     to:'/analitik'    },
      { label:'Penilaian',   icon:ClipboardList, to:'/penilaian'   },
      { label:'Nilai Akhir', icon:Award,         to:'/nilai-akhir' },
    ]},
    { section:'Informasi', items:[
      { label:'Pengumuman', icon:Megaphone, to:'/pengumuman' },
    ]},
  ],
  admin: [
    { section:'Beranda',   items:[{ label:'Dashboard', icon:LayoutDashboard, to:'/dashboard' }] },
    { section:'Manajemen Pengguna', items:[
      { label:'Pengguna',   icon:Users,         to:'/admin/users'         },
      { label:'Enrollment', icon:GraduationCap, to:'/admin/enrollment'    },
    ]},
    { section:'Akademik', items:[
      { label:'Kursus',        icon:BookOpen,      to:'/mata-kuliah'          },
      { label:'Program Studi', icon:GraduationCap, to:'/admin/program-studi'  },
    ]},
    { section:'Sistem', items:[
      { label:'Pengumuman', icon:Megaphone,    to:'/admin/announcements' },
      { label:'Semester',   icon:CalendarDays, to:'/admin/semester'      },
      { label:'Pengaturan', icon:Settings,     to:'/admin/settings'      },
    ]},
  ],
}

const ROLE_META = {
  admin:     { label:'Administrator', color:'badge-red'    },
  dosen:     { label:'Instruktur',    color:'badge-amber'  },
  mahasiswa: { label:'Peserta',       color:'badge-indigo' },
}

// ── Simple NavItem (no children) ──────────────────────────────────
function NavItem({ label, icon: Icon, to, badge }) {
  return (
    <NavLink to={to} end={to==='/dashboard'}
      className={({ isActive }) => `sidebar-item${isActive?' active':''}`}>
      <Icon size={16} className="sidebar-icon" />
      {label}
      {badge && <span className="sidebar-badge">{badge}</span>}
    </NavLink>
  )
}

// ── Course sub-item link ──────────────────────────────────────────
function CourseSubLink({ label, icon: Icon, href }) {
  const location = useLocation()
  const isActive = location.pathname + location.search === href
    || (location.pathname === href.split('?')[0] && location.search.includes(href.split('?')[1]))

  return (
    <NavLink to={href} end={false}
      className={({ isActive: ia }) => `sidebar-item${ia||isActive?' active':''}`}
      style={{ paddingLeft:30, fontSize:12 }}>
      <Icon size={13} className="sidebar-icon" />
      {label}
    </NavLink>
  )
}

// ── Dosen: one course row with expandable sub-items ───────────────
function DosenCourseRow({ course, defaultOpen }) {
  const location  = useLocation()
  const [open, setOpen] = useState(() => {
    const stored = sessionStorage.getItem(`sb-course-${course.id}`)
    if (stored !== null) return stored === '1'
    return defaultOpen
  })

  const isAnySubActive = DOSEN_COURSE_SUBS.some(s =>
    location.search.includes(`courseId=${course.id}`) &&
    location.pathname.startsWith('/' + s.key.split('-')[0])
  ) || location.search.includes(`courseId=${course.id}`)

  function toggle() {
    setOpen(o => {
      sessionStorage.setItem(`sb-course-${course.id}`, !o ? '1' : '0')
      return !o
    })
  }

  return (
    <>
      <button onClick={toggle} style={{
        display:'flex', alignItems:'center', gap:7,
        width:'100%', padding:'7px 16px',
        background: isAnySubActive ? 'var(--indigo-50)' : 'transparent',
        color:      isAnySubActive ? 'var(--indigo-700)' : 'var(--gray-600)',
        fontWeight: isAnySubActive ? 700 : 500,
        fontSize:12, border:'none', cursor:'pointer', textAlign:'left',
        transition:'background .15s',
      }}>
        <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
          background: isAnySubActive ? 'var(--indigo-600)' : 'var(--gray-300)' }}/>
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {course.code} — {course.name}
        </span>
        {open
          ? <ChevronDown size={11} style={{ color:'var(--gray-400)', flexShrink:0 }}/>
          : <ChevronRight size={11} style={{ color:'var(--gray-400)', flexShrink:0 }}/>
        }
      </button>

      {open && (
        <div style={{ position:'relative', marginLeft:16 }}>
          <div style={{ position:'absolute', left:15, top:0, bottom:4, width:1, background:'var(--gray-200)' }}/>
          {DOSEN_COURSE_SUBS.map(sub => (
            <CourseSubLink key={sub.key} label={sub.label} icon={sub.icon} href={sub.to(course.id)}/>
          ))}
        </div>
      )}
    </>
  )
}

// ── Mahasiswa: one course row (direct link) ───────────────────────
function MahasiswaCourseRow({ course }) {
  return (
    <NavLink to={`/mata-kuliah/${course.id}`}
      className={({ isActive }) => `sidebar-item${isActive?' active':''}`}
      style={{ paddingLeft:24, fontSize:12 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background:'var(--gray-300)' }}/>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
        {course.code} — {course.name}
      </span>
    </NavLink>
  )
}

// ── Course Nav section (dynamic) ──────────────────────────────────
function CourseNavSection({ role, userId }) {
  const location = useLocation()
  const [courses,  setCourses]  = useState([])
  const [expanded, setExpanded] = useState(() => {
    const s = sessionStorage.getItem('sb-mk-open')
    if (s !== null) return s === '1'
    return true
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    if (role === 'dosen') {
      supabase.from('courses').select('id,code,name').eq('dosen_id', userId).eq('is_active', true).order('code')
        .then(({ data }) => { setCourses(data||[]); setLoading(false) })
    } else {
      supabase.from('enrollments').select('course:courses(id,code,name)').eq('student_id', userId)
        .then(({ data }) => {
          setCourses((data||[]).map(e=>e.course).filter(Boolean).sort((a,b)=>a.code.localeCompare(b.code)))
          setLoading(false)
        })
    }
  }, [userId, role])

  const isMKActive = location.pathname.startsWith('/mata-kuliah')
    || location.pathname.startsWith('/materi')
    || location.pathname.startsWith('/tugas')
    || location.pathname.startsWith('/forum')
    || location.pathname.startsWith('/ujian')
    || location.pathname.startsWith('/bank-soal')
    || location.pathname.startsWith('/absensi')

  function toggle() {
    setExpanded(o => {
      sessionStorage.setItem('sb-mk-open', !o ? '1' : '0')
      return !o
    })
  }

  return (
    <div style={{ marginTop:4 }}>
      <div className="sidebar-section-label">Pembelajaran</div>
      
      {/* Mata Kuliah toggle button */}
      <button onClick={toggle} style={{
        display:'flex', alignItems:'center', gap:8,
        width:'100%', padding:'8px 16px',
        background: isMKActive ? 'var(--indigo-50)' : 'transparent',
        color:      isMKActive ? 'var(--indigo-700)' : 'var(--gray-600)',
        fontWeight: isMKActive ? 700 : 500,
        fontSize:13, border:'none', cursor:'pointer', textAlign:'left',
        borderRadius:6, transition:'background .15s',
      }}>
        <BookOpen size={16} style={{ flexShrink:0, color: isMKActive?'var(--indigo-600)':'var(--gray-400)' }}/>
        <span style={{ flex:1 }}>Kursus Saya</span>
        {loading
          ? <div className="spinner" style={{ width:12, height:12, borderWidth:2, flexShrink:0 }}/>
          : expanded
            ? <ChevronDown size={13} style={{ color:'var(--gray-400)' }}/>
            : <ChevronRight size={13} style={{ color:'var(--gray-400)' }}/>
        }
      </button>

      {/* Course list */}
      {expanded && !loading && (
        <div style={{ position:'relative' }}>
          <div style={{ position:'absolute', left:24, top:0, bottom:4, width:1, background:'var(--gray-200)' }}/>
          {courses.length === 0 ? (
            <div style={{ padding:'8px 16px 4px 32px', fontSize:11, color:'var(--gray-300)' }}>
              Belum ada kursus
            </div>
          ) : role === 'dosen'
            ? courses.map(c => <DosenCourseRow key={c.id} course={c} defaultOpen={courses.length===1}/>)
            : courses.map(c => <MahasiswaCourseRow key={c.id} course={c}/>)
          }
        </div>
      )}
    </div>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────
export default function Sidebar() {
  const { role, profile, user, signOut } = useAuth()
  const { open }                          = useSidebar()

  const profileReady = Boolean(profile)
  const roleMeta     = ROLE_META[role]

  // Admin uses static nav only (no dynamic course section)
  const groups  = STATIC_NAV[role] || STATIC_NAV.admin
  // For admin, insert dynamic course nav between sections 0 and 1
  const showDynCourse = role === 'dosen' || role === 'mahasiswa'

  return (
    <aside className="app-sidebar"
      style={{ width: open ? 'var(--sidebar-w)' : 0, overflow: open ? 'visible' : 'hidden', transition:'width .22s ease', minWidth: open ? 'var(--sidebar-w)' : 0 }}>

      {/* Logo */}
      <div style={{ height:'var(--header-h)', flexShrink:0, display:'flex', alignItems:'center', padding:'0 16px', borderBottom:'1px solid var(--gray-200)', gap:10 }}>
        <img src={LOGO_URL} alt="STIKOM" className="sidebar-logo-img" />
        <div className="sidebar-logo-text">
          <div className="sidebar-logo-brand">SYSTRACT</div>
          <div className="sidebar-logo-sub">Yos Sudarso Training Center</div>
        </div>
      </div>

      {/* Role chip */}
      <div style={{ padding:'10px 16px 4px', minHeight:34 }}>
        {profileReady && roleMeta
          ? <span className={`badge-pill ${roleMeta.color}`}>{roleMeta.label}</span>
          : <div style={{ height:20, width:80, borderRadius:99, background:'var(--gray-100)' }}/>
        }
      </div>

      {/* Navigation */}
      <nav style={{ flex:1, paddingBottom:8, overflowY:'auto' }}>

        {/* First section (Beranda) always first — dosen/mahasiswa only */}
        {showDynCourse && groups.slice(0,1).map(({ section, items }) => (
          <div key={section} style={{ marginTop:0 }}>
            <div className="sidebar-section-label">{section}</div>
            {items.map(item => <NavItem key={item.to} {...item}/>)}
          </div>
        ))}

        {/* Dynamic course nav (dosen / mahasiswa only) */}
        {showDynCourse && user && (
          <CourseNavSection role={role} userId={user.id}/>
        )}

        {/* Admin: render all static groups */}
        {!showDynCourse && groups.map(({ section, items }, gi) => (
          <div key={section} style={{ marginTop: gi===0 ? 0 : 4 }}>
            <div className="sidebar-section-label">{section}</div>
            {items.map(item => <NavItem key={item.to} {...item}/>)}
          </div>
        ))}

        {/* Remaining sections (Evaluasi etc.) for dosen/mahasiswa */}
        {showDynCourse && groups.slice(1).map(({ section, items }) => (
          <div key={section} style={{ marginTop:4 }}>
            <div className="sidebar-section-label">{section}</div>
            {items.map(item => <NavItem key={item.to} {...item}/>)}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ borderTop:'1px solid var(--gray-100)', padding:'10px 8px' }}>
        {profileReady && (
          <div style={{ padding:'4px 8px 8px 8px', fontSize:12, color:'var(--gray-400)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {profile?.full_name || 'Pengguna'}
            <span style={{ marginLeft:6, opacity:.6 }}>{profile?.nim || profile?.nidn || ''}</span>
          </div>
        )}
        <button onClick={signOut}
          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid #fecaca', background:'#fff1f2', color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer', transition:'background .12s' }}
          onMouseEnter={e => e.currentTarget.style.background='#fee2e2'}
          onMouseLeave={e => e.currentTarget.style.background='#fff1f2'}>
          <LogOut size={15}/>
          Keluar / Logout
        </button>
      </div>
    </aside>
  )
}
