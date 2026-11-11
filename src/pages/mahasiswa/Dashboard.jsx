import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth }  from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import AnnouncementCarousel from '@/components/AnnouncementCarousel'

// ── Beranda peserta ───────────────────────────────────────────
// Satu tujuan utama: kembali ke materi berikutnya secepat mungkin.
// Urutan: Terakhir dipelajari → Kursus Saya → Tenggat terdekat.

const pct = (done, total) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0)

async function loadCourses(userId) {
  const { data: enr } = await supabase
    .from('enrollments')
    .select('status, course:courses(id,code,name)')
    .eq('student_id', userId)

  const rows = (enr || []).filter((e) => e.course)
  const approvedIds = rows.filter((e) => e.status === 'approved').map((e) => e.course.id)

  let materials = []
  let progress = []
  if (approvedIds.length) {
    const [matRes, progRes, logRes] = await Promise.all([
      supabase.from('materials').select('id, course_id, title, week_number')
        .in('course_id', approvedIds).order('week_number', { ascending: true }),
      supabase.from('course_progress').select('course_id, material_id, completed_at')
        .eq('student_id', userId).in('course_id', approvedIds),
      supabase.from('points_log').select('course_id, reference_id')
        .eq('user_id', userId).eq('source', 'materi').in('course_id', approvedIds),
    ])
    materials = matRes.data || []
    progress = progRes.data || []

    // Sinkronkan progres yang tercatat di points_log tetapi belum ada di course_progress
    // (perilaku lama Beranda, dipertahankan).
    const ada = new Set(progress.map((p) => `${p.course_id}_${p.material_id}`))
    const kurang = []
    for (const pl of logRes.data || []) {
      const key = `${pl.course_id}_${pl.reference_id}`
      if (pl.reference_id && !ada.has(key)) {
        ada.add(key)
        kurang.push({ student_id: userId, course_id: pl.course_id, material_id: pl.reference_id })
      }
    }
    if (kurang.length) {
      await supabase.from('course_progress').insert(kurang)
      progress = progress.concat(kurang.map((k) => ({ ...k, completed_at: null })))
    }
  }

  return rows.map(({ status, course }) => {
    const mats = materials.filter((m) => m.course_id === course.id)
    const doneIds = new Set(progress.filter((p) => p.course_id === course.id).map((p) => p.material_id))
    const done = mats.filter((m) => doneIds.has(m.id)).length
    const lastAt = progress
      .filter((p) => p.course_id === course.id && p.completed_at)
      .reduce((max, p) => (p.completed_at > max ? p.completed_at : max), '')
    return {
      ...course,
      approved: status === 'approved',
      total: mats.length,
      done,
      percent: pct(done, mats.length),
      next: mats.find((m) => !doneIds.has(m.id)) || null,
      lastAt,
    }
  }).sort((a, b) =>
    (b.approved - a.approved) || b.lastAt.localeCompare(a.lastAt) || a.code.localeCompare(b.code))
}

// Kursus untuk kartu "Terakhir dipelajari": yang terakhir disentuh, atau
// kursus aktif pertama yang belum selesai bila belum ada progres sama sekali.
function pickResume(courses) {
  const aktif = courses.filter((c) => c.approved && c.next)
  const pernah = aktif.find((c) => c.lastAt)
  if (pernah) return { course: pernah, fresh: false }
  return aktif[0] ? { course: aktif[0], fresh: true } : null
}

export default function MahasiswaDashboard() {
  const { user } = useAuth()
  const [courses, setCourses] = useState(null)

  useEffect(() => {
    if (!user) return
    let batal = false
    loadCourses(user.id)
      .then((list) => { if (!batal) setCourses(list) })
      .catch((err) => {
        console.error('[SYSTRACT] Gagal memuat Beranda:', err)
        if (!batal) setCourses([])
      })
    return () => { batal = true }
  }, [user])

  const loading = courses === null
  const resume = loading ? null : pickResume(courses)

  return (
    <div className="home">
      <div className="page-header">
        <h1 className="page-title">Beranda</h1>
        <p className="page-subtitle">Kursus yang sedang Anda ikuti dan tenggat terdekat.</p>
      </div>

      <AnnouncementCarousel />

      {loading ? (
        <div className="card home-resume" aria-busy="true">
          <span className="sk" style={{ width: 168, height: 104 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="sk" style={{ width: 120, height: 12 }} />
            <span className="sk" style={{ width: '60%', height: 18 }} />
            <span className="sk" style={{ width: '40%', height: 12 }} />
          </div>
        </div>
      ) : resume ? (
        <ResumeCard {...resume} />
      ) : null}

      <div className="home-grid">
        <section className="card home-list home-list-wide" aria-labelledby="home-kursus">
          <div className="card-header">
            <h2 id="home-kursus" className="home-h2">Kursus Saya</h2>
            <Link to="/mata-kuliah" className="home-link">Lihat semua</Link>
          </div>
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="home-row"><span className="sk" style={{ width: '100%', height: 40 }} /></div>
            ))
          ) : courses.length === 0 ? (
            <div className="home-empty">
              <p>Anda belum mengikuti kursus apa pun.</p>
              <Link to="/katalog" className="btn btn-primary btn-sm">Jelajahi kursus</Link>
            </div>
          ) : (
            courses.map((c) => <CourseRow key={c.id} c={c} />)
          )}
        </section>

        <section className="card home-list" aria-labelledby="home-tenggat">
          <div className="card-header">
            <h2 id="home-tenggat" className="home-h2">Tenggat terdekat</h2>
          </div>
          <Deadlines userId={user?.id} />
        </section>
      </div>
    </div>
  )
}

function ResumeCard({ course, fresh }) {
  const next = course.next
  return (
    <section className="card home-resume" aria-labelledby="home-resume-title">
      <div className="home-thumb" aria-hidden="true">{course.code}</div>
      <div className="home-resume-body">
        <span className="home-eyebrow">{fresh ? 'Mulai belajar' : 'Terakhir dipelajari'}</span>
        <h2 id="home-resume-title" className="home-resume-title">{course.name}</h2>
        {next && (
          <p className="home-resume-next">
            Berikutnya: {next.week_number ? `Pertemuan ${next.week_number} · ` : ''}{next.title}
          </p>
        )}
        <div className="home-progress-row">
          <Progress value={course.percent} label={`Progres ${course.name}`} />
          <span>{course.done} dari {course.total} materi</span>
        </div>
      </div>
      <Link to={`/mata-kuliah/${course.id}`} className="btn btn-primary home-resume-btn">
        {fresh ? 'Mulai' : 'Lanjutkan'}
      </Link>
    </section>
  )
}

function CourseRow({ c }) {
  const status = !c.approved
    ? { label: 'Menunggu konfirmasi', cls: 'badge-amber' }
    : c.total > 0 && c.percent === 100
      ? { label: 'Selesai', cls: 'badge-green' }
      : { label: 'Berjalan', cls: 'badge-indigo' }
  return (
    <Link to={`/mata-kuliah/${c.id}`} className="home-row home-row-link">
      <span className="home-code">{c.code}</span>
      <span className="home-row-main">
        <span className="home-row-title">{c.name}</span>
        {c.approved ? (
          <span className="home-progress-row">
            <Progress value={c.percent} label={`Progres ${c.name}`} />
            <span>{c.percent}%</span>
          </span>
        ) : (
          <span className="home-row-sub">Instruktur akan mengonfirmasi pendaftaran Anda.</span>
        )}
      </span>
      <span className={`badge-pill ${status.cls}`}>{status.label}</span>
    </Link>
  )
}

function Progress({ value, label }) {
  return (
    <span className="home-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </span>
  )
}

function Deadlines({ userId }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!userId) return
    let batal = false
    supabase
      .from('assignments')
      .select('id, title, due_date, course:courses!inner(name, code, enrollments!inner(student_id))')
      .eq('courses.enrollments.student_id', userId)
      .gte('due_date', new Date().toISOString())
      .order('due_date', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (batal) return
        const now = Date.now()
        setItems((data || []).map((a) => ({ ...a, days: Math.ceil((new Date(a.due_date) - now) / 86400000) })))
      })
    return () => { batal = true }
  }, [userId])

  if (items === null) {
    return [1, 2, 3].map((i) => (
      <div key={i} className="home-row"><span className="sk" style={{ width: '100%', height: 34 }} /></div>
    ))
  }
  if (items.length === 0) {
    return <div className="home-empty"><p>Tidak ada tenggat dalam waktu dekat.</p></div>
  }

  return items.map((a) => {
    const due = new Date(a.due_date)
    const days = a.days
    const left = days <= 0 ? 'Hari ini' : days === 1 ? 'Besok' : `${days} hari`
    const tone = days <= 2 ? 'home-due-soon' : days <= 7 ? 'home-due-mid' : ''
    return (
      <Link key={a.id} to={`/tugas/${a.id}`} className="home-row home-row-link">
        <span className="home-row-main">
          <span className="home-row-title">{a.title}</span>
          <span className="home-row-sub">{a.course?.name}</span>
        </span>
        <span className="home-due">
          <span className={tone}>{left}</span>
          <span className="home-row-sub">{due.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
        </span>
      </Link>
    )
  })
}
