import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Layout
import AppLayout from '@/components/layout/AppLayout'

// Auth
import Login from '@/pages/auth/Login'

// ── Mahasiswa ────────────────────────────────────────────────
const MahasiswaDashboard = lazy(() => import('@/pages/mahasiswa/Dashboard'))
const MahasiswaMataKuliah = lazy(() => import('@/pages/mahasiswa/MataKuliah'))
const CourseDetail = lazy(() => import('@/pages/mahasiswa/CourseDetail'))
const TugasDetail = lazy(() => import('@/pages/mahasiswa/TugasDetail'))
const UjianDetail = lazy(() => import('@/pages/mahasiswa/UjianDetail'))
const Nilai = lazy(() => import('@/pages/mahasiswa/Nilai'))
const KatalogKursus = lazy(() => import('@/pages/mahasiswa/KatalogKursus'))


// ── Dosen ────────────────────────────────────────────────────
const DosenDashboard = lazy(() => import('@/pages/dosen/Dashboard'))
const DosenMataKuliah = lazy(() => import('@/pages/dosen/MataKuliahManager'))
const TugasManager = lazy(() => import('@/pages/dosen/TugasManager'))
const UjianManager = lazy(() => import('@/pages/dosen/UjianManager'))
const BankSoal = lazy(() => import('@/pages/dosen/BankSoal'))
const ForumManager = lazy(() => import('@/pages/dosen/ForumManager'))
const Penilaian = lazy(() => import('@/pages/dosen/Penilaian'))
const AnnouncementManager = lazy(() => import('@/pages/dosen/AnnouncementManager'))
const AttendanceManager = lazy(() => import('@/pages/dosen/AttendanceManager'))
const NilaiAkhir = lazy(() => import('@/pages/dosen/NilaiAkhir'))
const DosenAnalytics = lazy(() => import('@/pages/dosen/DosenAnalytics'))

// ── Admin ────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/Users'))
const AdminEnrollment = lazy(() => import('@/pages/admin/Enrollment'))
const ProgramStudiManager = lazy(() => import('@/pages/admin/ProgramStudiManager'))
const AdminAnnouncements = lazy(() => import('@/pages/admin/Announcements'))
const SemesterManager = lazy(() => import('@/pages/admin/SemesterManager'))


// ── Shared ───────────────────────────────────────────────────
const ForumDetail = lazy(() => import('@/pages/shared/ForumDetail'))
const AcademicCalendar = lazy(() => import('@/pages/shared/AcademicCalendar'))
const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const WebSlidePreviewPage = lazy(() => import('@/pages/dosen/WebSlidePreviewPage'))

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
  if (role === 'dosen' || role === 'admin') return <DosenMataKuliah />
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
      <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}><div className="spinner" /></div>}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* All authenticated users */}
        <Route element={<ProtectedRoute />}>
          <Route path="/webslide-preview"    element={<WebSlidePreviewPage />} />
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
            <Route path="/katalog"             element={<KatalogKursus />} />
            <Route path="/katalog/:id"         element={<CourseDetail />} />
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

            </Route>
          </Route>
        </Route>

        {/* Redirects */}
        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
