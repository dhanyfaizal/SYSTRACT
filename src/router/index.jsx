import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Layout
import AppLayout from '@/components/layout/AppLayout'

// Auth
import Login from '@/pages/auth/Login'

// ── Mahasiswa ────────────────────────────────────────────────
import MahasiswaDashboard from '@/pages/mahasiswa/Dashboard'
import MahasiswaMataKuliah from '@/pages/mahasiswa/MataKuliah'
import CourseDetail       from '@/pages/mahasiswa/CourseDetail'
import TugasDetail        from '@/pages/mahasiswa/TugasDetail'
import UjianDetail        from '@/pages/mahasiswa/UjianDetail'
import Nilai              from '@/pages/mahasiswa/Nilai'
import Leaderboard        from '@/pages/mahasiswa/Leaderboard'
import AvatarShop         from '@/pages/mahasiswa/AvatarShop'
import AvatarEditor       from '@/pages/mahasiswa/AvatarEditor'

// ── Dosen ────────────────────────────────────────────────────
import DosenDashboard   from '@/pages/dosen/Dashboard'
import DosenMataKuliah from '@/pages/dosen/MataKuliahManager'
import MateriManager   from '@/pages/dosen/MateriManager'
import TugasManager    from '@/pages/dosen/TugasManager'
import UjianManager    from '@/pages/dosen/UjianManager'
import BankSoal        from '@/pages/dosen/BankSoal'
import ForumManager    from '@/pages/dosen/ForumManager'
import Penilaian           from '@/pages/dosen/Penilaian'
import AnnouncementManager from '@/pages/dosen/AnnouncementManager'
import AttendanceManager   from '@/pages/dosen/AttendanceManager'
import NilaiAkhir          from '@/pages/dosen/NilaiAkhir'
import DosenAnalytics      from '@/pages/dosen/DosenAnalytics'

// ── Admin ────────────────────────────────────────────────────
import AdminDashboard      from '@/pages/admin/Dashboard'
import AdminUsers          from '@/pages/admin/Users'
import AdminEnrollment     from '@/pages/admin/Enrollment'
import ProgramStudiManager from '@/pages/admin/ProgramStudiManager'
import AdminAnnouncements  from '@/pages/admin/Announcements'
import SemesterManager     from '@/pages/admin/SemesterManager'
import ShopItemManager     from '@/pages/admin/ShopItemManager'

// ── Shared ───────────────────────────────────────────────────
import ForumDetail      from '@/pages/shared/ForumDetail'
import AcademicCalendar from '@/pages/shared/AcademicCalendar'
import ProfilePage      from '@/pages/shared/ProfilePage'
import NotFound         from '@/pages/NotFound'

// ── Protected Route ──────────────────────────────────────────
function ProtectedRoute({ allowedRoles }) {
  const { user, role, loading, profileReady } = useAuth()

  // Tunggu auth selesai
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  )

  // Belum login → ke halaman login
  if (!user) return <Navigate to="/login" replace />

  // Ada role restriction: tunggu profile selesai load
  // agar tidak redirect salah karena role masih 'guest' sementara
  if (allowedRoles && !profileReady) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  )

  // Role tidak diizinkan → ke dashboard
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />

  return <Outlet />
}

// ── Smart Dashboard ──────────────────────────────────────────
function SmartDashboard() {
  const { role } = useAuth()
  if (role === 'admin') return <AdminDashboard />
  if (role === 'dosen') return <DosenDashboard />
  return <MahasiswaDashboard />
}

// ── Smart MataKuliah (role-aware) ────────────────────────────
function SmartMataKuliah() {
  const { role } = useAuth()
  if (role === 'dosen' || role === 'admin') return <DosenMataKuliah />
  return <MahasiswaMataKuliah />
}

// ── Smart Materi ─────────────────────────────────────────────
function SmartMateri() {
  const { role } = useAuth()
  if (role === 'dosen' || role === 'admin') return <MateriManager />
  // Mahasiswa melihat materi melalui CourseDetail, redirect ke mata kuliah
  return <Navigate to="/mata-kuliah" replace />
}

// ── Smart Tugas ──────────────────────────────────────────────
function SmartTugas() {
  const { role } = useAuth()
  if (role === 'dosen' || role === 'admin') return <TugasManager />
  return <MahasiswaMataKuliah />  // fallback: mahasiswa lihat MK list
}

// ── Smart Ujian ──────────────────────────────────────────────
function SmartUjian() {
  const { role } = useAuth()
  if (role === 'dosen' || role === 'admin') return <UjianManager />
  return <MahasiswaMataKuliah />  // fallback: mahasiswa lihat MK list
}

// ── Smart Forum ──────────────────────────────────────────────
function SmartForum() {
  const { role } = useAuth()
  if (role === 'dosen' || role === 'admin') return <ForumManager />
  return <Navigate to="/mata-kuliah" replace />
}

// ── Router ───────────────────────────────────────────────────
export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* All authenticated users */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard"          element={<SmartDashboard />} />
            <Route path="/profile"            element={<ProfilePage />} />
            <Route path="/mata-kuliah"         element={<SmartMataKuliah />} />
            <Route path="/mata-kuliah/:id"     element={<CourseDetail />} />
            <Route path="/materi"              element={<SmartMateri />} />
            <Route path="/tugas"               element={<SmartTugas />} />
            <Route path="/tugas/:id"           element={<TugasDetail />} />
            <Route path="/ujian"               element={<SmartUjian />} />
            <Route path="/ujian/:id"           element={<UjianDetail />} />
            <Route path="/forum"               element={<SmartForum />} />
            <Route path="/forum/:id"           element={<ForumDetail />} />
            <Route path="/nilai"               element={<Nilai />} />
            <Route path="/leaderboard"         element={<Leaderboard />} />
            <Route path="/toko-avatar"         element={<AvatarShop />} />
            <Route path="/avatar-editor"       element={<AvatarEditor />} />
            <Route path="/kalender"            element={<AcademicCalendar />} />

            {/* Dosen + Admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin','dosen']} />}>
              <Route path="/penilaian"    element={<Penilaian />} />
              <Route path="/bank-soal"   element={<BankSoal />} />
              <Route path="/pengumuman"  element={<AnnouncementManager />} />
              <Route path="/absensi"     element={<AttendanceManager />} />
              <Route path="/nilai-akhir" element={<NilaiAkhir />} />
              <Route path="/analitik"    element={<DosenAnalytics />} />
            </Route>

            {/* Admin only */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin/users"         element={<AdminUsers />} />
              <Route path="/admin/enrollment"    element={<AdminEnrollment />} />
              <Route path="/admin/program-studi" element={<ProgramStudiManager />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/semester"      element={<SemesterManager />} />
              <Route path="/admin/shop-items"   element={<ShopItemManager />} />
            </Route>
          </Route>
        </Route>

        {/* Redirects */}
        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
