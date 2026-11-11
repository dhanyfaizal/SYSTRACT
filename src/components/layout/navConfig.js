// Susunan menu sidebar per peran, dalam format NAV milik AppShell (src/shell).
//   { section: 'Judul bagian' }
//   { id, label, icon, to }                   -> item biasa
//   { id, label, icon, children: [...] }      -> modul (sidebar masuk ke sub-menu)
import {
  LayoutDashboard, Search, BookOpen, BookMarked, BarChart2, UserRound,
  ClipboardList, MessageSquare, FileText, Database, UserCheck, Award,
  Megaphone, Users, GraduationCap, CalendarDays,
} from 'lucide-react'

const courseLabel = (c) => `${c.code} · ${c.name}`

function pesertaNav(courses) {
  return [
    { section: 'Beranda' },
    { id: 'beranda', label: 'Beranda', icon: LayoutDashboard, to: '/dashboard' },
    { id: 'katalog', label: 'Jelajahi Kursus', icon: Search, to: '/katalog' },
    { section: 'Belajar' },
    {
      id: 'kursus-saya', label: 'Kursus Saya', icon: BookOpen,
      children: [
        { to: '/mata-kuliah', label: 'Semua kursus saya', icon: BookOpen },
        ...(courses.length ? [{ section: 'Kursus yang diikuti' }] : []),
        ...courses.map((c) => ({ to: `/mata-kuliah/${c.id}`, label: courseLabel(c), icon: BookMarked })),
      ],
    },
    { id: 'nilai', label: 'Nilai & Sertifikat', icon: BarChart2, to: '/nilai' },
    { section: 'Akun' },
    { id: 'profil', label: 'Profil', icon: UserRound, to: '/profile' },
  ]
}

const DOSEN_COURSE_SUBS = [
  { label: 'Materi',    icon: BookMarked,    path: '/materi'    },
  { label: 'Tugas',     icon: ClipboardList, path: '/tugas'     },
  { label: 'Forum',     icon: MessageSquare, path: '/forum'     },
  { label: 'Ujian',     icon: FileText,      path: '/ujian'     },
  { label: 'Bank Soal', icon: Database,      path: '/bank-soal' },
  { label: 'Presensi',  icon: UserCheck,     path: '/absensi'   },
]

function dosenNav(courses) {
  return [
    { section: 'Beranda' },
    { id: 'beranda', label: 'Beranda', icon: LayoutDashboard, to: '/dashboard' },
    { section: 'Kursus yang diampu' },
    ...courses.map((c) => ({
      id: `kursus-${c.id}`, label: courseLabel(c), icon: BookOpen,
      children: DOSEN_COURSE_SUBS.map((s) => ({ to: `${s.path}?courseId=${c.id}`, label: s.label, icon: s.icon })),
    })),
    { section: 'Penilaian' },
    { id: 'analitik',    label: 'Analitik',    icon: BarChart2,     to: '/analitik'    },
    { id: 'penilaian',   label: 'Penilaian',   icon: ClipboardList, to: '/penilaian'   },
    { id: 'nilai-akhir', label: 'Nilai Akhir', icon: Award,         to: '/nilai-akhir' },
    { section: 'Informasi' },
    { id: 'pengumuman', label: 'Pengumuman', icon: Megaphone, to: '/pengumuman' },
    { section: 'Akun' },
    { id: 'profil', label: 'Profil', icon: UserRound, to: '/profile' },
  ]
}

function adminNav() {
  return [
    { section: 'Beranda' },
    { id: 'beranda', label: 'Beranda', icon: LayoutDashboard, to: '/dashboard' },
    { section: 'Manajemen Pengguna' },
    { id: 'pengguna',   label: 'Pengguna',   icon: Users,         to: '/admin/users'      },
    { id: 'enrollment', label: 'Enrollment', icon: GraduationCap, to: '/admin/enrollment' },
    { section: 'Akademik' },
    { id: 'kursus', label: 'Kursus',        icon: BookOpen,      to: '/mata-kuliah'         },
    { id: 'prodi',  label: 'Program Studi', icon: GraduationCap, to: '/admin/program-studi' },
    { section: 'Sistem' },
    { id: 'pengumuman', label: 'Pengumuman', icon: Megaphone,    to: '/admin/announcements' },
    { id: 'semester',   label: 'Semester',   icon: CalendarDays, to: '/admin/semester'      },
    { section: 'Akun' },
    { id: 'profil', label: 'Profil', icon: UserRound, to: '/profile' },
  ]
}

export function buildNav(role, courses = []) {
  if (role === 'admin') return adminNav()
  if (role === 'dosen') return dosenNav(courses)
  return pesertaNav(courses)
}

export const ROLE_LABEL = { admin: 'Administrator', dosen: 'Instruktur', mahasiswa: 'Peserta' }
