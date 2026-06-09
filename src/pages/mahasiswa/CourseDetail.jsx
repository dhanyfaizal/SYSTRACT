import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ClipboardList, MessageSquare, FileText,
  ExternalLink, Calendar, User, Star, CheckCircle2, Sparkles,
  PlayCircle, FileDown, BookMarked, Eye, Send, Loader2, Award, Clock,
  Info, RefreshCw
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAI } from '@/contexts/AIContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import courseBanner from '@/assets/course_banner.png'

const COUNTDOWN_SEC = 180 // 3 Menit untuk membaca/menonton materi

// Helper mapping untuk tipe materi
const MATTYPE = {
  'video/youtube':                        { label: 'Video YouTube', icon: '🎬', color: '#ff0000', bg: '#fff0f0' },
  'application/vnd.google-apps.document': { label: 'Google Drive',  icon: '📁', color: '#4285f4', bg: '#e8f0fe' },
  'application/pdf':                      { label: 'PDF Dokumen',   icon: '📄', color: '#ef4444', bg: '#fef2f2' },
  'text/html':                            { label: 'Artikel/Web',   icon: '🌐', color: '#10b981', bg: '#f0fdf4' },
}
function getMatType(mime) { return MATTYPE[mime] || { label: 'Tautan Link', icon: '🔗', color: 'var(--gray-500)', bg: 'var(--gray-100)' } }

// Helper YouTube embed ID
function getYouTubeId(url = '') {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function getEmbedUrl(mime, url = '') {
  if (mime === 'video/youtube') {
    const id = getYouTubeId(url)
    return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null
  }
  if (mime === 'application/vnd.google-apps.document') {
    const id = url.match(/\/file\/d\/([^/?\s]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1]
    return id ? `https://drive.google.com/file/d/${id}/preview` : null
  }
  if (mime === 'application/pdf') {
    const id = url.match(/\/file\/d\/([^/?\s]+)/)?.[1]
    if (id) return `https://drive.google.com/file/d/${id}/preview`
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
  }
  return null
}

// Map Kompetensi berdasarkan nama kursus
function getCompetencies(courseName = '') {
  const name = courseName.toLowerCase()
  if (name.includes('react') || name.includes('frontend')) {
    return [
      'Developing Interactive User Interfaces using React.js Components',
      'Implementing State Management with React Lifecycle and Context API',
      'Integrating Frontend Interfaces with Restful APIs and Supabase Cloud Services',
      'Deploying Web Application to Vercel Hosting Platform'
    ]
  }
  if (name.includes('database') || name.includes('sql')) {
    return [
      'Relational Database Modeling & Schema Normalization (1NF, 2NF, 3NF)',
      'Writing Advanced & Optimized SQL Queries, Triggers, and Stored Functions',
      'Managing Security Policies & Row Level Security (RLS) on Supabase Platform',
      'Designing Relational Integrity Constraints & Performance Indexes'
    ]
  }
  if (name.includes('php') || name.includes('backend') || name.includes('laravel')) {
    return [
      'Developing MVC Architecture and Modular REST APIs using Backend PHP/Laravel',
      'Database Migrations & Relational Eloquent ORM Integration',
      'Implementing Secure JWT/OAuth User Authentication & Session Controls',
      'Building Middleware Security & Serverless Functions Routing'
    ]
  }
  return [
    'Understanding Fundamental Theoretical Concepts of the Subject',
    'Practical Skill Execution and System Implementation',
    'Application of Industry Best Practices and Professional Design Standards'
  ]
}

// Countdown Ring SVG component
function CountdownRing({ seconds }) {
  const r = 12, circ = 2 * Math.PI * r
  const pct = ((COUNTDOWN_SEC - seconds) / COUNTDOWN_SEC)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return (
    <div style={{ width: 28, height: 28, flexShrink: 0, position: 'relative' }}>
      <svg width="28" height="28" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx="14" cy="14" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="#f59e0b" strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6.5, fontWeight: 800, color: '#d97706', lineHeight: 1 }}>
        {mins}:{String(secs).padStart(2, '0')}
      </div>
    </div>
  )
}

export default function CourseDetail() {
  const { id: courseId } = useParams()
  const { user, profile } = useAuth()
  const { askWithContext } = useAI()
  const navigate = useNavigate()

  const [course, setCourse] = useState(null)
  const [syllabusItems, setSyllabusItems] = useState([])
  const [activeItem, setActiveItem] = useState(null) // { type, data, subIdx? }
  const [completedRefs, setCompletedRefs] = useState(new Set()) // 'mat_{id}_{idx}'
  const [submissionsMap, setSubmissionsMap] = useState({}) // { assignment_id: submission }
  const [examAnswersMap, setExamAnswersMap] = useState({}) // { exam_id: score }
  
  const [subTab, setSubTab] = useState('belajar') // 'belajar' | 'diskusi'
  const [loading, setLoading] = useState(true)

  const [isEnrolled, setIsEnrolled] = useState(false)
  const [materials, setMaterials] = useState([])
  const [enrolling, setEnrolling] = useState(false)

  // Countdown timer state untuk materi aktif
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC)
  const timerRef = useRef(null)

  // State untuk form tugas
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [submittingTugas, setSubmittingTugas] = useState(false)

  // State untuk Forum Diskusi
  const [forumItems, setForumItems] = useState([])
  const [forumLoading, setForumLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creatingForum, setCreatingForum] = useState(false)

  useEffect(() => {
    if (user && courseId) {
      fetchCourseAndSyllabus()
    }
  }, [courseId, user])

  // Countdown controller
  useEffect(() => {
    if (activeItem?.type === 'materi' && subTab === 'belajar') {
      const matId = activeItem.data.id
      const subIdx = activeItem.subIdx ?? 0
      const refId = `mat_${matId}_${subIdx}`

      if (completedRefs.has(refId)) {
        setCountdown(0)
        return
      }

      // Check storage key for first opened timestamp
      const storageKey = `sy_mat_t_${user.id}_${matId}_${subIdx}`
      let openedAt = parseInt(localStorage.getItem(storageKey) || '0')
      if (!openedAt) {
        openedAt = Date.now()
        localStorage.setItem(storageKey, String(openedAt))
      }

      const currentElapsed = Math.floor((Date.now() - openedAt) / 1000)
      const remaining = Math.max(0, COUNTDOWN_SEC - currentElapsed)
      setCountdown(remaining)

      if (remaining > 0) {
        timerRef.current = setInterval(() => {
          setCountdown(c => {
            if (c <= 1) {
              clearInterval(timerRef.current)
              return 0
            }
            return c - 1
          })
        }, 1000)
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [activeItem, completedRefs, subTab])

  async function fetchCourseAndSyllabus() {
    setLoading(true)
    try {
      // 1. Fetch course details
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('*, dosen:profiles!courses_dosen_id_fkey(full_name, avatar_url)')
        .eq('id', courseId)
        .single()
      if (courseErr) throw courseErr
      setCourse(courseData)

      // Check enrollment
      const { data: enrollDataCheck } = await supabase
        .from('enrollments')
        .select('id')
        .eq('course_id', courseId)
        .eq('student_id', user.id)
        .maybeSingle()

      const enrolled = !!enrollDataCheck
      setIsEnrolled(enrolled)

      // 2. Fetch materials
      const { data: mats } = await supabase
        .from('materials')
        .select('*')
        .eq('course_id', courseId)
        .order('week_number')
        .order('created_at')
      setMaterials(mats || [])

      // 3. Fetch assignments
      const { data: assigns } = await supabase
        .from('assignments')
        .select('*')
        .eq('course_id', courseId)
        .order('due_date')

      // 4. Fetch exams
      const { data: exams } = await supabase
        .from('exams')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_published', true)
        .order('created_at')

      // 5. Fetch student progress (materials)
      const { data: progressData } = await supabase
        .from('course_progress')
        .select('material_id, id')
        .eq('student_id', user.id)
        .eq('course_id', courseId)

      // Get local progress fallbacks
      const localDone = new Set()
      try {
        const stored = JSON.parse(localStorage.getItem(`sy_done_${user.id}_${courseId}`) || '[]')
        stored.forEach(ref => localDone.add(ref))
      } catch (e) {}

      // Combine database progress
      progressData?.forEach(p => {
        // If a material has multiple attachments, they are index-based.
        // We ensure we map it appropriately. Let's make sure localDone contains database items.
        // For simplicity: DB saves material_id, which completes all attachments of that material, or we track each idx.
        // Let's assume database record represents overall completion, or check if we store material_id.
        // In the MOOC model, we track per attachment: `mat_{materialId}_{attachIdx}`
        // Let's seed completedRefs with the database items
      })

      // Let's query points_log to rebuild the accurate list of completed refs
      const { data: pointsData } = await supabase
        .from('points_log')
        .select('reason')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('source', 'materi')

      pointsData?.forEach(p => {
        // reason is like: "Selesai lampiran 1 materi UUID"
        const m = p.reason.match(/Selesai lampiran (\d+) materi (.+)/)
        if (m) {
          const idx = parseInt(m[1]) - 1
          const matId = m[2]
          localDone.add(`mat_${matId}_${idx}`)
        }
      })

      setCompletedRefs(localDone)

      // 6. Fetch student submissions (assignments)
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', user.id)
      const sMap = {}
      subs?.forEach(s => { sMap[s.assignment_id] = s })
      setSubmissionsMap(sMap)

      // 7. Fetch student exam scores
      const { data: answers } = await supabase
        .from('exam_answers')
        .select('exam_id, score, submitted_at')
        .eq('student_id', user.id)
      const eMap = {}
      answers?.filter(a => a.submitted_at)?.forEach(a => {
        eMap[a.exam_id] = Math.max(eMap[a.exam_id] || 0, a.score || 0)
      })
      setExamAnswersMap(eMap)

      // 8. Construct unified syllabus list
      // We will organize items by Week Number
      const syllabus = []
      const weeks = new Set([
        ...(mats || []).map(m => m.week_number || 0),
        ...(assigns || []).map(a => 1), // assume week 1 fallback if not specified
        ...(exams || []).map(e => 1)
      ])

      const sortedWeeks = Array.from(weeks).sort((a, b) => a - b)
      
      sortedWeeks.forEach(w => {
        const weekMaterials = (mats || []).filter(m => (m.week_number || 0) === w)
        const weekAssignments = w === 1 ? (assigns || []) : [] // show assignments in week 1 or distribute
        const weekExams = w === 1 ? (exams || []) : []

        weekMaterials.forEach(m => {
          const attachments = m.attachments?.length > 0 ? m.attachments : (m.webview_link ? [{ mime: m.mime_type, url: m.webview_link, label: 'Materi Utama' }] : [])
          attachments.forEach((a, idx) => {
            syllabus.push({
              id: `mat_${m.id}_${idx}`,
              week: w,
              type: 'materi',
              label: a.label || m.title,
              icon: getMatType(a.mime).icon,
              data: m,
              subIdx: idx,
              attach: a
            })
          })
        })

        // Add assignments for this week (or fallback to week 1)
        if (w === 1) {
          assigns?.forEach(a => {
            syllabus.push({
              id: `assign_${a.id}`,
              week: w,
              type: 'tugas',
              label: `Tugas: ${a.title}`,
              icon: '📝',
              data: a
            })
          })

          exams?.forEach(e => {
            syllabus.push({
              id: `exam_${e.id}`,
              week: w,
              type: 'ujian',
              label: `${e.type === 'kuis' ? 'Quiz' : e.type.toUpperCase()}: ${e.title}`,
              icon: '🧠',
              data: e
            })
          })
        }
      })

      setSyllabusItems(syllabus)
      
      // Select active item: first uncompleted item, or fallback to first item
      if (syllabus.length > 0) {
        let firstUncompleted = syllabus.find(item => {
          if (item.type === 'materi') return !localDone.has(`mat_${item.data.id}_${item.subIdx}`)
          if (item.type === 'tugas') return !sMap[item.data.id]
          if (item.type === 'ujian') return !eMap[item.data.id]
          return false
        })
        setActiveItem(firstUncompleted || syllabus[0])
      }
    } catch (err) {
      console.error('[SYSTRACT] Error building syllabus:', err)
      toast.error('Gagal memuat detail pembelajaran')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnroll() {
    setEnrolling(true)
    const toastId = toast.loading('Mendaftar ke kursus...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .insert({
          course_id: courseId,
          student_id: user.id
        })

      if (error) throw error

      toast.success(`Berhasil mendaftar di kursus: ${course?.name} 🎉`, { id: toastId })
      setIsEnrolled(true)
      fetchCourseAndSyllabus()
    } catch (err) {
      console.error('[SYSTRACT] Enroll error:', err)
      toast.error('Gagal mendaftar kursus. Silakan coba lagi.', { id: toastId })
    } finally {
      setEnrolling(false)
    }
  }

  // Tandai Materi Selesai & Lanjut
  async function handleMarkComplete(materialId, subIdx) {
    const refId = `mat_${materialId}_${subIdx}`
    if (completedRefs.has(refId)) {
      goToNextItem()
      return
    }

    const toastId = toast.loading('Menyimpan progres...')
    try {
      // 1. Simpan ke database points_log (+3 koin)
      const { data: sem } = await supabase.from('semesters').select('id').eq('is_active', true).maybeSingle()
      const { error: ptErr } = await supabase.from('points_log').insert({
        user_id: user.id,
        course_id: courseId,
        semester_id: sem?.id || null,
        points: 3,
        source: 'materi',
        reason: `Selesai lampiran ${subIdx + 1} materi ${materialId}`,
        reference_id: materialId
      })
      if (ptErr) throw ptErr

      // 2. Simpan ke course_progress
      await supabase.from('course_progress').upsert(
        { material_id: materialId, student_id: user.id, course_id: courseId, points_awarded: true },
        { onConflict: 'material_id,student_id' }
      )

      // 3. Update local state
      const nextDone = new Set(completedRefs)
      nextDone.add(refId)
      setCompletedRefs(nextDone)
      localStorage.setItem(`sy_done_${user.id}_${courseId}`, JSON.stringify(Array.from(nextDone)))

      toast.success('Materi selesai! +3 Poin ⭐', { id: toastId })
      
      // Auto advance
      goToNextItem()
    } catch (err) {
      console.error(err)
      toast.error('Gagal mencatat progres.', { id: toastId })
    }
  }

  function goToNextItem() {
    if (!activeItem) return
    const curIdx = syllabusItems.findIndex(item => item.id === activeItem.id)
    if (curIdx >= 0 && curIdx < syllabusItems.length - 1) {
      setActiveItem(syllabusItems[curIdx + 1])
    } else {
      // Reached the end! Let's check if they qualify for the certificate
      const allMaterialsDone = syllabusItems
        .filter(item => item.type === 'materi')
        .every(item => completedRefs.has(`mat_${item.data.id}_${item.subIdx}`))
      
      const examsPassed = syllabusItems
        .filter(item => item.type === 'ujian')
        .every(item => (examAnswersMap[item.data.id] || 0) >= 70)

      if (allMaterialsDone && examsPassed) {
        // Navigate to certificate completion view!
        setActiveItem({ type: 'sertifikat', id: 'sertifikat_completion' })
      } else {
        toast.info('Semua materi selesai! Pastikan Anda menyelesaikan tugas & kuis dengan nilai kelulusan >= 70 untuk memperoleh sertifikat.')
      }
    }
  }

  // Submit Tugas
  async function handleTugasSubmit(assignmentId) {
    if (!linkUrl.trim()) {
      toast.error('Masukkan link pengerjaan tugas terlebih dahulu!')
      return
    }
    setSubmittingTugas(true)
    const toastId = toast.loading('Mengirim tugas...')
    try {
      const payload = {
        assignment_id: assignmentId,
        student_id: user.id,
        webview_link: linkUrl.trim(),
        file_name: linkName.trim() || 'Link Pengerjaan Tugas',
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }

      const existing = submissionsMap[assignmentId]
      if (existing) {
        await supabase.from('submissions').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('submissions').insert(payload)
      }

      toast.success('Tugas berhasil dikirim! 📨', { id: toastId })
      
      // Refetch submissions
      const { data } = await supabase.from('submissions').select('*').eq('student_id', user.id)
      const sMap = {}
      data?.forEach(s => { sMap[s.assignment_id] = s })
      setSubmissionsMap(sMap)
      
      setLinkUrl('')
      setLinkName('')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim tugas.', { id: toastId })
    } finally {
      setSubmittingTugas(false)
    }
  }

  // Load Forum Diskusi
  async function fetchForumDiskusi() {
    setForumLoading(true)
    try {
      const { data, error } = await supabase
        .from('forums')
        .select('*, author:profiles(full_name), reply_count:forum_replies(count)')
        .eq('course_id', courseId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setForumItems(data || [])
    } catch (err) {
      toast.error('Gagal memuat diskusi forum')
    } finally {
      setForumLoading(false)
    }
  }

  async function handleCreateForum(e) {
    e.preventDefault()
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error('Judul dan isi diskusi wajib diisi!')
      return
    }
    setCreatingForum(true)
    try {
      const { error } = await supabase
        .from('forums')
        .insert({
          course_id: courseId,
          title: newTitle,
          body: newBody,
          author_id: user.id
        })
      if (error) throw error
      toast.success('Diskusi baru berhasil ditambahkan!')
      setNewTitle('')
      setNewBody('')
      fetchForumDiskusi()
    } catch (err) {
      toast.error('Gagal membuat diskusi')
    } finally {
      setCreatingForum(false)
    }
  }

  useEffect(() => {
    if (subTab === 'diskusi') {
      fetchForumDiskusi()
    }
  }, [subTab])

  // Hitung persentase progress keseluruhan kursus
  const totalSteps = syllabusItems.length
  const completedSteps = syllabusItems.filter(item => {
    if (item.type === 'materi') return completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
    if (item.type === 'tugas') return !!submissionsMap[item.data.id]
    if (item.type === 'ujian') return (examAnswersMap[item.data.id] || 0) >= 70
    return false
  }).length
  const overallPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const isAllDone = totalSteps > 0 && completedSteps === totalSteps

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  if (!course) return <div className="empty-state"><p>Kursus tidak ditemukan.</p></div>

  if (!isEnrolled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', overflowY: 'auto', paddingRight: 4 }}>
        {/* Top Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--gray-200)', flexShrink: 0, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate('/katalog')} title="Kembali ke Katalog">
              <ArrowLeft size={16} />
            </button>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--indigo-600)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                Pratinjau Kursus
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginTop: 2 }}>{course.name}</h1>
            </div>
          </div>
        </div>

        {/* Cisco Netacad Style Course Header Banner */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid var(--gray-200)',
          borderRadius: 12,
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          padding: '24px 28px',
          color: 'var(--gray-800)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)',
          position: 'relative',
          overflow: 'hidden',
          flexWrap: 'wrap',
          marginTop: 14
        }}>
          {/* Left Column (Details) */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>
                Katalog &gt; Kursus Mandiri
              </span>
              <span className="badge-pill badge-green" style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', height: 'auto', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                Cisco Academy Style
              </span>
              <span className="badge-pill badge-indigo" style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', height: 'auto', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                KURSUS
              </span>
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-950)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
              {course.name}
            </h2>
            
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: 0, fontWeight: 500, lineHeight: 1.4 }}>
              {course.description || 'Your on-ramp to global learning. Get familiar with the course outline and start building your skills.'}
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#fff', border: '1px solid var(--gray-200)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                💻 Self-Paced Online
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#fff', border: '1px solid var(--gray-200)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                🎓 Dipandu Instruktur
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleEnroll} 
                disabled={enrolling}
                style={{ background: '#22c55e', borderColor: '#22c55e', color: '#fff', fontWeight: 700, padding: '8px 18px', fontSize: 13, gap: 6, boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)' }}
              >
                {enrolling ? (
                  <>
                    <Loader2 size={14} className="spinner" style={{ animation: 'spin .7s linear infinite', borderTopColor: '#fff', marginRight: 4 }} />
                    Mendaftar...
                  </>
                ) : (
                  <>
                    Ikuti Kursus (Self-Paced)
                  </>
                )}
              </button>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>
                ⚡ 14.869.338 terdaftar
              </span>
            </div>
          </div>

          {/* Right Column (Banner Illustration) */}
          <div style={{ flex: '1 1 200px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img 
              src={courseBanner} 
              alt="Student Learning" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: 180, 
                objectFit: 'cover', 
                borderRadius: 10,
                border: '1px solid var(--gray-200)',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)'
              }} 
            />
          </div>
        </div>

        {/* Overview Layout */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 20, paddingBottom: 40 }}>
          {/* Left Column (Main Content) */}
          <div style={{ flex: '2 1 500px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Deskripsi Kursus */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>Deskripsi Kursus</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--gray-600)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {course.description || 'Deskripsi belum dirumuskan untuk kursus ini.'}
              </p>
            </div>

            {/* Here's what you will learn */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 16 }}>Here's what you will learn.</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {materials.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Rencana silabus modul belum tersedia.</span>
                  </div>
                ) : (
                  materials.sort((a,b) => a.week_number - b.week_number).map((m, index) => (
                    <div key={m.id || index} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--gray-100)' }}>
                      <div style={{ 
                        width: 24, 
                        height: 24, 
                        borderRadius: '50%', 
                        background: '#dcfce7', 
                        color: '#15803d', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        flexShrink: 0,
                        fontWeight: 700,
                        fontSize: 12,
                        border: '1px solid #bbf7d0'
                      }}>
                        ✓
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>
                          Modul {m.week_number}: {m.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                          {m.description || 'Fokus penguasaan materi dan latihan mandiri.'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column (Sidebar Widgets) */}
          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Ringkasan Metrik Kursus */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'GRATIS', sub: 'Biaya Kursus', icon: <Award size={16} color="var(--indigo-600)"/> },
                { label: `${course.credits * 16} JAM`, sub: 'Durasi Total', icon: <Clock size={16} color="var(--indigo-600)"/> },
                { label: 'PEMULA', sub: 'Tingkat Materi', icon: <Info size={16} color="var(--indigo-600)"/> },
                { label: 'MANDIRI', sub: 'Metode Belajar', icon: <RefreshCw size={16} color="var(--indigo-600)"/> }
              ].map((item, idx) => (
                <div key={idx} className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center', background: '#f8fafc' }}>
                  {item.icon}
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gray-800)' }}>{item.label}</span>
                  <span style={{ fontSize: 9, color: 'var(--gray-400)', fontWeight: 600 }}>{item.sub}</span>
                </div>
              ))}
            </div>

            {/* Achievements */}
            <div className="card" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center', background: '#f8fafc' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Achievements</span>
              <div style={{ 
                width: 70, 
                height: 70, 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '4px solid #bbf7d0',
                boxShadow: '0 4px 10px rgba(34, 197, 94, 0.2)'
              }}>
                <Award size={32} color="#fff"/>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)' }}>
                Lencana Kelulusan {course.code}
              </div>
              <p style={{ fontSize: 9, color: 'var(--gray-400)', margin: 0 }}>
                Dapatkan sertifikat resmi dari SYSTRACT Academy setelah menyelesaikan ujian akhir modul ini.
              </p>
            </div>

            {/* Skills You Will Learn */}
            <div className="card" style={{ padding: 15, background: '#f8fafc' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Skills You Will Learn</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {course.cpmk && course.cpmk.length > 0 ? (
                  course.cpmk.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--gray-600)' }}>
                      <CheckCircle2 size={12} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }}/>
                      <span>{c.deskripsi}</span>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Belum ada capaian keterampilan terdaftar.</span>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--gray-200)', flexShrink: 0, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate('/dashboard')} title="Kembali ke Beranda">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--indigo-600)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              {course.code} · {course.credits} SKS
            </div>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginTop: 2 }}>{course.name}</h1>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--gray-100)', padding: 3, borderRadius: 8 }}>
          <button
            onClick={() => setSubTab('belajar')}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: subTab === 'belajar' ? '#fff' : 'transparent',
              color: subTab === 'belajar' ? 'var(--indigo-600)' : 'var(--gray-500)',
              boxShadow: subTab === 'belajar' ? 'var(--shadow-xs)' : 'none',
              transition: 'all .2s'
            }}
          >
            <BookMarked size={13} style={{ marginRight: 4, display: 'inline' }} /> Ruang Kelas
          </button>
          <button
            onClick={() => setSubTab('diskusi')}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: subTab === 'diskusi' ? '#fff' : 'transparent',
              color: subTab === 'diskusi' ? 'var(--indigo-600)' : 'var(--gray-500)',
              boxShadow: subTab === 'diskusi' ? 'var(--shadow-xs)' : 'none',
              transition: 'all .2s'
            }}
          >
            <MessageSquare size={13} style={{ marginRight: 4, display: 'inline' }} /> Diskusi ({forumItems.length})
          </button>
        </div>
      </div>

      {/* Main Body */}
      {subTab === 'belajar' ? (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 14 }}>
          {/* LEFT: Sidebar Syllabus */}
          <div style={{ width: 280, borderRight: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', paddingRight: 16, overflowY: 'auto' }}>
            
            {/* Overall progress bar */}
            <div className="card" style={{ padding: 14, marginBottom: 16, background: 'linear-gradient(135deg, var(--indigo-50), #fff)', borderColor: '#c7d2fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--indigo-700)', marginBottom: 6 }}>
                <span>Progres Belajar</span>
                <span>{completedSteps}/{totalSteps} Selesai ({overallPercent}%)</span>
              </div>
              <div style={{ height: 6, background: '#e0e7ff', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${overallPercent}%`, background: overallPercent === 100 ? 'var(--success)' : 'var(--indigo-600)', borderRadius: 99, transition: 'width .4s ease' }} />
              </div>
            </div>

            {/* List items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {syllabusItems.map((item, idx) => {
                const isActive = activeItem?.id === item.id
                let isDone = false
                if (item.type === 'materi') isDone = completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
                if (item.type === 'tugas') isDone = !!submissionsMap[item.data.id]
                if (item.type === 'ujian') isDone = (examAnswersMap[item.data.id] || 0) >= 70

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveItem(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      background: isActive ? 'var(--indigo-50)' : 'transparent',
                      color: isActive ? 'var(--indigo-700)' : 'var(--gray-600)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 12, transition: 'all .15s'
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={14} color="var(--success)" fill="#d1fae5" style={{ flexShrink: 0 }} />
                    ) : (
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                    )}
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}

              {/* Certificate option (only visible or enabled when ready) */}
              <button
                onClick={() => {
                  if (isAllDone) {
                    setActiveItem({ type: 'sertifikat', id: 'sertifikat_completion' })
                  } else {
                    toast.error('Selesaikan seluruh materi, kuis (lulus >= 70), dan tugas untuk membuka Sertifikat Kompetensi!')
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px dashed', borderRadius: 8, cursor: isAllDone ? 'pointer' : 'not-allowed', textAlign: 'left',
                  borderColor: isAllDone ? '#f59e0b' : 'var(--gray-200)',
                  background: activeItem?.type === 'sertifikat' ? '#fef3c7' : 'transparent',
                  color: isAllDone ? '#d97706' : 'var(--gray-400)',
                  fontWeight: activeItem?.type === 'sertifikat' ? 700 : 500,
                  fontSize: 12, marginTop: 12, transition: 'all .15s'
                }}
              >
                <Award size={14} color={isAllDone ? '#f59e0b' : 'var(--gray-400)'} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Sertifikat Kompetensi</span>
                {!isAllDone && <span style={{ fontSize: 9, background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 10 }}>Locked</span>}
              </button>
            </div>
          </div>

          {/* RIGHT: Content Pane */}
          <div style={{ flex: 1, paddingLeft: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {activeItem?.type === 'materi' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Embedded preview if supported */}
                {getEmbedUrl(activeItem.attach.mime, activeItem.attach.url) ? (
                  <div style={{ position: 'relative', width: '100%', aspectRatio: activeItem.attach.mime === 'video/youtube' ? '16/9' : '4/3', borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid var(--gray-200)' }}>
                    <iframe
                      src={getEmbedUrl(activeItem.attach.mime, activeItem.attach.url)}
                      title={activeItem.label}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  </div>
                ) : (
                  <div className="card" style={{ padding: 24, textAlign: 'center', background: 'var(--gray-50)', marginBottom: 16 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{getMatType(activeItem.attach.mime).icon}</div>
                    <strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>{activeItem.label}</strong>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 16 }}>Materi eksternal harus dibuka di tab baru.</p>
                    <a
                      href={activeItem.attach.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                      style={{ display: 'inline-flex', margin: '0 auto' }}
                    >
                      Buka Materi <ExternalLink size={12} style={{ marginLeft: 4 }} />
                    </a>
                  </div>
                )}

                {/* Description & AI summary shortcut */}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{activeItem.label}</h3>
                    {activeItem.data.description && <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{activeItem.data.description}</p>}
                  </div>
                  
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ gap: 4, color: 'var(--indigo-600)', background: 'var(--indigo-50)', borderColor: '#c7d2fe' }}
                    onClick={() => askWithContext(`Jelaskan materi kuliah "${activeItem.label}" yang membahas tentang: ${activeItem.data.description || 'Tidak ada deskripsi'}. Berikan ringkasan poin-poin pentingnya.`)}
                  >
                    <Sparkles size={12} /> Tanya AI Ringkasan
                  </button>
                </div>

                {/* Bottom Complete & Continue bar */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--gray-200)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                  {completedRefs.has(`mat_${activeItem.data.id}_${activeItem.subIdx ?? 0}`) ? (
                    <button className="btn btn-primary btn-sm" onClick={goToNextItem}>
                      Lanjut ke Materi Berikutnya <ChevronRight size={13} />
                    </button>
                  ) : (
                    <>
                      {countdown > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: 20 }}>
                          <CountdownRing seconds={countdown} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>
                            Pelajari materi selama {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')} untuk menyelesaikan
                          </span>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ background: 'var(--success)', borderColor: '#059669', animation: 'pulse-green 1.5s infinite' }}
                          onClick={() => handleMarkComplete(activeItem.data.id, activeItem.subIdx ?? 0)}
                        >
                          ✓ Tandai Selesai & Lanjut (+3 pts)
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeItem?.type === 'tugas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div className="card-header">
                    <strong style={{ fontSize: 14 }}>{activeItem.data.title}</strong>
                    {submissionsMap[activeItem.data.id] ? (
                      <span className={`badge-pill ${submissionsMap[activeItem.data.id].status === 'graded' ? 'badge-green' : 'badge-indigo'}`}>
                        {submissionsMap[activeItem.data.id].status === 'graded' ? '✓ Sudah Dinilai' : '📨 Dikumpulkan'}
                      </span>
                    ) : (
                      <span className="badge-pill badge-amber">Belum Dikumpulkan</span>
                    )}
                  </div>
                  <div className="card-body">
                    {activeItem.data.description && (
                      <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 16 }}>
                        {activeItem.data.description}
                      </p>
                    )}
                    
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
                      <span>📅 Batas Waktu: {activeItem.data.due_date ? new Date(activeItem.data.due_date).toLocaleString('id-ID') : 'Tidak ada'}</span>
                      <span>Nilai Maksimum: {activeItem.data.max_score}</span>
                    </div>
                  </div>
                </div>

                {/* Submission Form */}
                {submissionsMap[activeItem.data.id]?.status === 'graded' ? (
                  <div style={{ background: 'linear-gradient(135deg,#eef2ff,#f0fdf4)', border: '1px solid #c7d2fe', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <CheckCircle2 size={20} color="#16a34a" />
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>
                        Nilai Kompetensi: <span style={{ fontSize: 22, color: 'var(--indigo-700)' }}>{submissionsMap[activeItem.data.id].grade}</span>
                        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}> / {activeItem.data.max_score}</span>
                      </div>
                    </div>
                    {submissionsMap[activeItem.data.id].feedback && (
                      <div style={{ fontSize: 12, color: 'var(--gray-700)', background: '#fff', borderRadius: 8, padding: 10, border: '1px solid var(--gray-200)' }}>
                        <strong>Catatan Instruktur:</strong> {submissionsMap[activeItem.data.id].feedback}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card" style={{ padding: 20 }}>
                    <strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>Kumpulkan Tugas Kompetensi Anda:</strong>
                    
                    <div className="input-group">
                      <label className="input-label">Link Hasil Pekerjaan (Google Drive / GitHub / URL) *</label>
                      <input
                        className="input"
                        placeholder="https://github.com/username/project"
                        value={linkUrl}
                        onChange={e => setLinkUrl(e.target.value)}
                      />
                    </div>

                    <div className="input-group" style={{ marginTop: 10 }}>
                      <label className="input-label">Nama File / Label Konten (opsional)</label>
                      <input
                        className="input"
                        placeholder="Contoh: Kode Aplikasi React SYSTRACT"
                        value={linkName}
                        onChange={e => setLinkName(e.target.value)}
                      />
                    </div>

                    <button
                      className="btn btn-primary btn-sm"
                      disabled={submittingTugas || !linkUrl.trim()}
                      onClick={() => handleTugasSubmit(activeItem.data.id)}
                      style={{ marginTop: 12 }}
                    >
                      {submittingTugas ? <Loader2 size={13} className="spinner" /> : <Send size={13} />}
                      {submissionsMap[activeItem.data.id] ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeItem?.type === 'ujian' && (
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span className="badge-pill badge-indigo">{activeItem.data.type === 'kuis' ? 'Quiz' : activeItem.data.type.toUpperCase()}</span>
                  <strong style={{ fontSize: 15 }}>{activeItem.data.title}</strong>
                </div>

                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 20 }}>
                  Ujian/Kuis ini merupakan evaluasi kompetensi mandiri. Anda harus lulus ujian ini dengan nilai minimal **70** untuk memenuhi kualifikasi sertifikat kompetensi.
                </p>

                <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderTop: '1px solid var(--gray-100)', borderBottom: '1px solid var(--gray-100)', padding: '12px 0' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Durasi</div>
                    <strong style={{ fontSize: 14, color: 'var(--gray-700)' }}>{activeItem.data.duration_minutes} Menit</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Passing Grade</div>
                    <strong style={{ fontSize: 14, color: 'var(--success)' }}>70 / 100</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Status Kelulusan</div>
                    <strong style={{ fontSize: 14, color: (examAnswersMap[activeItem.data.id] || 0) >= 70 ? 'var(--success)' : 'var(--danger)' }}>
                      {(examAnswersMap[activeItem.data.id] || 0) >= 70 ? 'LULUS KOMPETEN' : 'BELUM LULUS'}
                    </strong>
                  </div>
                </div>

                {examAnswersMap[activeItem.data.id] !== undefined && (
                  <div style={{ background: 'var(--gray-50)', padding: 14, borderRadius: 8, border: '1px solid var(--gray-200)', marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>
                      Nilai Tertinggi Anda: <span style={{ fontSize: 18, color: 'var(--indigo-600)' }}>{examAnswersMap[activeItem.data.id]}</span>
                    </div>
                  </div>
                )}

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/ujian/${activeItem.data.id}`)}
                >
                  {examAnswersMap[activeItem.data.id] !== undefined ? 'Coba Lagi / Tingkatkan Nilai' : 'Mulai Ujian Kompetensi'}
                </button>
              </div>
            )}

            {activeItem?.type === 'sertifikat' && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.print()}
                    style={{ gap: 4, fontWeight: 600 }}
                  >
                    <FileDown size={14} /> Cetak / Simpan PDF
                  </button>
                </div>

                {/* Certificate design */}
                <div className="printable-certificate" style={{
                  border: '14px double #d4af37',
                  padding: '40px 32px',
                  background: '#fff',
                  textAlign: 'center',
                  fontFamily: '"Georgia", serif',
                  boxShadow: 'var(--shadow-lg)',
                  maxWidth: '780px',
                  margin: '0 auto',
                  position: 'relative',
                  background: 'linear-gradient(to right, #fbfbfb, #ffffff, #fbfbfb)',
                  borderRadius: 6
                }}>
                  {/* Gold star seal */}
                  <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 18, color: '#d4af37' }}>★</div>
                  <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 18, color: '#d4af37' }}>★</div>

                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '4px', color: 'var(--gray-500)', marginBottom: 12 }}>
                    STIKOM Yos Sudarso Training Center
                  </div>
                  
                  <div style={{ fontSize: 26, fontWeight: 'bold', color: '#b8860b', textTransform: 'uppercase', fontFamily: '"Times New Roman", Times, serif', margin: '12px 0 6px', letterSpacing: '2px' }}>
                    Sertifikat Kompetensi
                  </div>
                  
                  <div style={{ fontSize: 10, color: 'var(--gray-400)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 24 }}>
                    No. Sertifikat: SYSTRACT/CERT/{course.code}/{user.id.slice(0, 8).toUpperCase()}
                  </div>
                  
                  <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--gray-500)', marginBottom: 8 }}>
                    Diberikan kepada:
                  </div>
                  
                  <div style={{ fontSize: 22, fontWeight: 'bold', color: 'var(--gray-900)', borderBottom: '2px solid #eaeaea', display: 'inline-block', paddingBottom: 6, minWidth: '280px', marginBottom: 6 }}>
                    {profile?.full_name}
                  </div>
                  
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 24 }}>
                    NIM: {profile?.nim || '-'} · Program Studi: {profile?.program_studi || '-'}
                  </div>
                  
                  <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: '1.7', maxWidth: '580px', margin: '0 auto 20px' }}>
                    Telah dinyatakan **LULUS & KOMPETEN** dalam menyelesaikan seluruh materi serta ujian akhir pada bidang kompetensi khusus untuk kursus:
                    <div style={{ fontWeight: 'bold', fontSize: 16, color: 'var(--indigo-700)', marginTop: 6 }}>
                      {course.name} ({course.code})
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--gray-600)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, textAlign: 'center' }}>
                    Daftar Kompetensi yang Dikuasai:
                  </div>
                  
                  <div style={{ background: 'var(--gray-50)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--gray-200)', maxWidth: '540px', margin: '0 auto 24px', textAlign: 'left' }}>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: 11, color: 'var(--gray-700)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {getCompetencies(course.name).map((comp, idx) => (
                        <li key={idx} style={{ listStyleType: 'none', position: 'relative', paddingLeft: 12 }}>
                          <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>✓</span>
                          {comp}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Signatures */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, padding: '0 20px' }}>
                    <div style={{ width: '160px' }}>
                      <div style={{ height: '40px' }} />
                      <div style={{ borderTop: '1px solid var(--gray-400)', paddingTop: 6, fontSize: 11, fontWeight: 'bold' }}>
                        Dhany Faizal Racma, M.Kom
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>
                        Direktur SYSTRACT
                      </div>
                    </div>
                    
                    {/* Decorative Stamp */}
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px double #d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4af37', fontWeight: 'bold', fontSize: 10, transform: 'rotate(-12deg)' }}>
                      SYSTRACT
                    </div>

                    <div style={{ width: '160px' }}>
                      <div style={{ height: '40px' }} />
                      <div style={{ borderTop: '1px solid var(--gray-400)', paddingTop: 6, fontSize: 11, fontWeight: 'bold' }}>
                        STIKOM Yos Sudarso
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>
                        Lembaga Sertifikasi
                      </div>
                    </div>
                  </div>
                </div>

                <style>{`
                  @media print {
                    body * { visibility: hidden; }
                    .printable-certificate, .printable-certificate * { visibility: visible; }
                    .printable-certificate {
                      position: absolute;
                      left: 0; top: 0;
                      width: 100%;
                      box-shadow: none !important;
                      border-width: 20px !important;
                    }
                  }
                `}</style>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DISCUSSION FORUM BODY */
        <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden', marginTop: 14 }}>
          {/* Discussion List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Forum Diskusi Kelas</h3>
            
            {forumLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
            ) : forumItems.length === 0 ? (
              <div className="empty-state card" style={{ padding: 32 }}>
                <MessageSquare size={32} color="var(--gray-200)" />
                <p className="empty-state-text">Belum ada diskusi</p>
                <p className="empty-state-sub">Jadilah yang pertama untuk memulai diskusi kelas!</p>
              </div>
            ) : (
              forumItems.map(f => (
                <div
                  key={f.id}
                  className="card"
                  onClick={() => navigate(`/forum/${f.id}`)}
                  style={{ padding: '14px 16px', cursor: 'pointer', transition: 'transform .15s, border-color .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--indigo-200)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {f.is_pinned && <span style={{ fontSize: 13, flexShrink: 0 }}>📌</span>}
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 13, color: 'var(--gray-900)' }}>{f.title}</strong>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                        Oleh {f.author?.full_name || 'Instruktur'} · {new Date(f.created_at).toLocaleDateString('id-ID')} · {f.reply_count?.[0]?.count || 0} Balasan
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* New Discussion Form */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <form className="card" onSubmit={handleCreateForum} style={{ padding: 16 }}>
              <strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>Buat Diskusi Baru</strong>
              
              <div className="input-group">
                <label className="input-label">Judul Diskusi</label>
                <input
                  className="input"
                  placeholder="Contoh: Pertanyaan tentang React Lifecycle"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="input-group" style={{ marginTop: 10 }}>
                <label className="input-label">Isi Pertanyaan / Topik</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Tulis detail topik yang ingin Anda diskusikan..."
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={creatingForum || !newTitle.trim() || !newBody.trim()}
                style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
              >
                {creatingForum ? <Loader2 size={13} className="spinner" /> : <Send size={12} />}
                Mulai Diskusi
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
