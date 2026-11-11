import { Component, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppShell }     from '@/shell/AppShell'
import { filterNav }    from '@/shell/navUtils'
import { useAuth }      from '@/contexts/AuthContext'
import { supabase }     from '@/lib/supabase'
import HeaderActions    from './Header'
import AIAssistant      from '@/components/ai/AIAssistant'
import { buildNav, ROLE_LABEL } from './navConfig'

const LOGO_URL = 'https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png'
const BRAND = { name: 'SYSTRACT', sub: 'STIKOM Yos Sudarso', logo: LOGO_URL }

// Dipakai halaman ujian untuk menyembunyikan sidebar selama ujian berlangsung.
// `open`/`setOpen` dipertahankan agar pemanggil lama tetap berjalan.
export const SidebarContext = createContext({ open: true, toggle: () => {}, setOpen: () => {}, examMode: false, setExamMode: () => {}, focusMode: false, setFocusMode: () => {} })
export const useSidebar = () => useContext(SidebarContext)

/** Error Boundary */
class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('[SYSTRACT] Render error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:16, padding:32 }}>
          <h2 style={{ fontSize:18, fontWeight:700, color:'var(--gray-800)' }}>Terjadi Kesalahan</h2>
          <p style={{ fontSize:13, color:'var(--gray-500)', textAlign:'center', maxWidth:400 }}>
            Halaman ini mengalami error. Silakan refresh halaman atau kembali ke Beranda.
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Refresh</button>
            <button className="btn btn-primary btn-sm" onClick={() => { this.setState({ hasError:false }); window.location.href='/dashboard' }}>Ke Beranda</button>
          </div>
          {import.meta.env.DEV && (
            <pre style={{ fontSize:11, color:'var(--danger)', background:'#fff1f2', padding:12, borderRadius:8, maxWidth:600, overflow:'auto', marginTop:8 }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// Kursus yang tampil di sidebar: yang diampu (instruktur) atau yang diikuti (peserta).
// Halaman yang menambah/menghapus kursus atau pendaftaran mengirim event
// 'systract:courses-changed' agar daftar ini dimuat ulang.
function useSidebarCourses(role, userId) {
  const [courses, setCourses] = useState([])
  const [versi, setVersi] = useState(0)
  const aktif = Boolean(userId) && (role === 'dosen' || role === 'mahasiswa')
  useEffect(() => {
    const muatUlang = () => setVersi((v) => v + 1)
    window.addEventListener('systract:courses-changed', muatUlang)
    return () => window.removeEventListener('systract:courses-changed', muatUlang)
  }, [])
  useEffect(() => {
    if (!aktif) return
    let batal = false
    const req = role === 'dosen'
      ? supabase.from('courses').select('id,code,name').eq('dosen_id', userId).eq('is_active', true).order('code')
          .then(({ data }) => data || [])
      : supabase.from('enrollments').select('course:courses(id,code,name)').eq('student_id', userId)
          .then(({ data }) => (data || []).map((e) => e.course).filter(Boolean).sort((a, b) => a.code.localeCompare(b.code)))
    req.then((list) => { if (!batal) setCourses(list) })
    return () => { batal = true }
  }, [aktif, role, userId, versi])
  return aktif ? courses : TANPA_KURSUS
}
const TANPA_KURSUS = []

export default function AppLayout() {
  const { role, user, profile } = useAuth()
  const [examMode, setExamMode] = useState(false)
  // Mode fokus (ruang kelas): menu aplikasi disembunyikan di layar lebar.
  const [focusMode, setFocusMode] = useState(false)
  const courses = useSidebarCourses(role, user?.id)
  const nav = useMemo(() => filterNav(buildNav(role, courses), { role }), [role, courses])

  const ctx = useMemo(() => ({
    open: !examMode, toggle: () => {}, setOpen: () => {}, examMode, setExamMode, focusMode, setFocusMode,
  }), [examMode, focusMode])

  const shellClass = [examMode && 'exam-mode', focusMode && 'focus-mode'].filter(Boolean).join(' ') || undefined

  const footer = profile ? (
    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
      Masuk sebagai {ROLE_LABEL[role] || 'Pengguna'}
    </div>
  ) : null

  return (
    <SidebarContext.Provider value={ctx}>
      <div className={shellClass} style={{ height: '100%' }}>
        <AppShell
          nav={nav}
          brand={BRAND}
          sidebarFooter={footer}
          headerRight={<HeaderActions />}
          storageKey="systract-shell"
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </AppShell>
      </div>
      <AIAssistant />
    </SidebarContext.Provider>
  )
}
