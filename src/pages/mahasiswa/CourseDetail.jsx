import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ClipboardList, MessageSquare, ExternalLink, CheckCircle2, FileDown, BookMarked, Send, Loader2, Award, ChevronUp, ChevronDown, ChevronRight, Lock, PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/components/layout/AppLayout'
import { useAI } from '@/contexts/AIContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { generateWebSlideHtml } from '@/lib/webslideTemplate'
import WebSlidePlayer from '@/components/mahasiswa/WebSlidePlayer'
import CoursePreview from '@/components/mahasiswa/CoursePreview'
import { COUNTDOWN_SEC, getMatType, getEmbedUrl } from './courseDetail/materiHelpers'
import CountdownRing from './courseDetail/CountdownRing'
import { urlVerifikasi, buatQrDataUrl, unduhSertifikatPdf } from '@/lib/sertifikat'
import { SertifikatDepan, SertifikatBelakang, SkalaHalaman } from './courseDetail/SertifikatDesainB'
import { groupMaterialsIntoModules } from '@/lib/modules'


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
  const [courseAssignments, setCourseAssignments] = useState([])
  const [activeTugas, setActiveTugas] = useState(null)
  
  const [subTab, setSubTab] = useState('belajar') // 'belajar' | 'diskusi'
  const [syllabusOpen, setSyllabusOpen] = useState(true)
  const { focusMode, setFocusMode } = useSidebar()
  // Mode fokus hanya berlaku di halaman ini; matikan saat keluar.
  useEffect(() => () => setFocusMode(false), [setFocusMode])
  const [loading, setLoading] = useState(true)

  const groupedModules = groupMaterialsIntoModules(syllabusItems, 'week')

  const isModuleCompleted = (mod) => {
    if (!mod || !mod.items || mod.items.length === 0) return true
    return mod.items.every(item => {
      if (item.type === 'materi') return completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
      if (item.type === 'tugas') return !!submissionsMap[item.data.id]
      if (item.type === 'ujian') return (examAnswersMap[item.data.id] || 0) >= (item.data.passing_grade ?? 70)
      return false
    })
  }

  const isModuleLocked = (modIdx) => {
    if (modIdx <= 0) return false
    for (let i = 0; i < modIdx; i++) {
      if (!isModuleCompleted(groupedModules[i])) return true
    }
    return false
  }

  const getLockingModule = (modIdx) => {
    if (modIdx <= 0) return null
    for (let i = 0; i < modIdx; i++) {
      if (!isModuleCompleted(groupedModules[i])) return groupedModules[i]
    }
    return null
  }

  const isItemLocked = (item) => {
    if (!item) return false
    const modIdx = groupedModules.findIndex(mod => {
      if (mod.id === 0 && item.week === 0) return true
      if (mod.id === 99 && item.week === 99) return true
      return mod.weeks.includes(item.week)
    })
    return isModuleLocked(modIdx)
  }

  const [isEnrolled, setIsEnrolled] = useState(false)
  const [enrollStatus, setEnrollStatus] = useState(null)
  const [certificateStatus, setCertificateStatus] = useState('unvalidated')
  const [certificateNotes, setCertificateNotes] = useState('')
  const [sertifikat, setSertifikat] = useState(null)        // baris certificates (nomor resmi)
  const [qrSertifikat, setQrSertifikat] = useState('')
  const [mengunduhPdf, setMengunduhPdf] = useState(false)
  const sertifikatRef = useRef(null)
  const [enrollmentId, setEnrollmentId] = useState(null)
  const [expandedSidebarModules, setExpandedSidebarModules] = useState({
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 99: true
  })
  const [materials, setMaterials] = useState([])
  const [enrolling, setEnrolling] = useState(false)

  // Pratinjau dibuka lewat /katalog/:id. Bila ternyata sudah terdaftar, pindah ke
  // alamat kursus agar menu "Kursus Saya" yang aktif di sidebar.
  const location = useLocation()
  useEffect(() => {
    if (isEnrolled && location.pathname.startsWith('/katalog/')) {
      navigate(`/mata-kuliah/${courseId}`, { replace: true })
    } else if (!loading && course && !enrollStatus && location.pathname.startsWith('/mata-kuliah/')) {
      // Belum mendaftar sama sekali: tampilkan sebagai pratinjau katalog.
      navigate(`/katalog/${courseId}`, { replace: true })
    }
  }, [isEnrolled, enrollStatus, loading, course, location.pathname, courseId, navigate])

  // Countdown timer state untuk materi aktif
  const [_elapsed, _setElapsed] = useState(0)
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
    if (!course) {
      setLoading(true)
    }
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
        .select('id, status, certificate_status, certificate_notes')
        .eq('course_id', courseId)
        .eq('student_id', user.id)
        .maybeSingle()

      const enrolled = !!enrollDataCheck && enrollDataCheck.status === 'approved'
      setIsEnrolled(enrolled)
      setEnrollStatus(enrollDataCheck ? enrollDataCheck.status : null)
      setCertificateStatus(enrollDataCheck ? (enrollDataCheck.certificate_status || 'unvalidated') : 'unvalidated')
      setCertificateNotes(enrollDataCheck ? (enrollDataCheck.certificate_notes || '') : '')
      setEnrollmentId(enrollDataCheck ? enrollDataCheck.id : null)

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
      setCourseAssignments(assigns || [])
      if (assigns && assigns.length > 0) {
        setActiveTugas(assigns[0])
      }

      // 4. Fetch exams
      // exams_peserta: daftar ujian tanpa kolom soal/kunci jawaban
      const { data: exams } = await supabase
        .from('exams_peserta')
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
      } catch { /* abaikan data lokal yang rusak */ }

      // Combine database progress
      progressData?.forEach(_p => {
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
        .select('reference_id, reason')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('source', 'materi')

      const existingMatIds = new Set(progressData?.map(p => p.material_id) || [])
      const missingMatIds = []

      pointsData?.forEach(p => {
        // reason is like: "Selesai lampiran 1 materi UUID"
        const m = p.reason.match(/Selesai lampiran (\d+) materi (.+)/)
        if (m) {
          const idx = parseInt(m[1]) - 1
          const matId = m[2]
          localDone.add(`mat_${matId}_${idx}`)
        }
        if (p.reference_id && !existingMatIds.has(p.reference_id)) {
          missingMatIds.push(p.reference_id)
          existingMatIds.add(p.reference_id)
        }
      })

      // Sync missing progressData to heal database course_progress table
      if (missingMatIds.length > 0) {
        const syncRows = missingMatIds.map(mId => ({
          student_id: user.id,
          course_id: courseId,
          material_id: mId
        }))
        supabase.from('course_progress').insert(syncRows).then(({ error }) => {
          if (error) console.error('[SYSTRACT] Progress auto-heal error:', error)
          else console.log('[SYSTRACT] Progress auto-heal synced', syncRows.length, 'rows')
        })
      }

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
        ...(exams || []).map(e => {
          if (e.type === 'uts') return 8
          if (e.type === 'uas') return 16
          return 1
        })
      ])

      const sortedWeeks = Array.from(weeks).sort((a, b) => a - b)
      
      sortedWeeks.forEach(w => {
        const weekMaterials = (mats || []).filter(m => (m.week_number || 0) === w)
        const weekExams = (exams || []).filter(e => {
          if (e.type === 'uts') return w === 8
          if (e.type === 'uas') return w === 16
          return w === 1
        })

        weekMaterials.forEach(m => {
          let attachments = m.attachments?.length > 0 
            ? [...m.attachments] 
            : (m.webview_link ? [{ mime: m.mime_type, url: m.webview_link, label: 'Materi Utama' }] : [])
          
          if (attachments.length === 0 && m.webslide_content) {
            attachments.push({ mime: 'text/html', url: '#', label: m.title || 'Materi Presentasi' })
          }

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

        // Add exams for this week
        weekExams?.forEach(e => {
          syllabus.push({
            id: `exam_${e.id}`,
            week: w,
            type: 'ujian',
            label: `${e.type === 'kuis' ? 'Quiz' : 'Evaluasi'}: ${e.title}`,
            icon: '🧠',
            data: e
          })
        })
      })

      setSyllabusItems(syllabus)
      
      // Select active item: first uncompleted item, or fallback to first item
      if (syllabus.length > 0) {
        let firstUncompleted = syllabus.find(item => {
          if (item.type === 'materi') return !localDone.has(`mat_${item.data.id}_${item.subIdx}`)
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
    const toastId = toast.loading('Mengirim pendaftaran...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .insert({
          course_id: courseId,
          student_id: user.id,
          status: 'pending'
        })

      if (error) throw error

      toast.success('Pendaftaran dikirim! Menunggu konfirmasi instruktur. ⏳', { id: toastId })
      setEnrollStatus('pending')
      window.dispatchEvent(new Event('systract:courses-changed'))
      setIsEnrolled(false)
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
      // Server mencatat course_progress dan memberi +3 poin (sekali per lampiran).
      const { error: ptErr } = await supabase.rpc('klaim_poin_materi', {
        p_material_id: materialId,
        p_sub_idx: subIdx,
      })
      if (ptErr) throw ptErr

      // Update local state
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
    } catch (_err) {
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
    } catch (_err) {
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
    if (item.type === 'ujian') return (examAnswersMap[item.data.id] || 0) >= (item.data.passing_grade ?? 70)
    return false
  }).length
  const overallPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const allAssignmentsSubmitted = courseAssignments.length === 0 || courseAssignments.every(a => !!submissionsMap[a.id])
  const isAllDone = totalSteps > 0 && completedSteps === totalSteps && allAssignmentsSubmitted

  // Auto-submit certificate for validation
  useEffect(() => {
    if (isAllDone && enrollmentId && (certificateStatus === 'unvalidated' || certificateStatus === 'returned')) {
      // Server memeriksa ulang syaratnya (materi, ujian, tugas) sebelum mengubah status.
      supabase.rpc('ajukan_sertifikat', { p_course_id: courseId })
        .then(({ data, error }) => {
          if (error) {
            console.warn('[SYSTRACT] Pengajuan sertifikat ditolak server:', error.message)
            return
          }
          if (data === 'pending') {
            setCertificateStatus('pending')
            toast.success('Persyaratan lengkap! Pengajuan sertifikasi otomatis dikirim ke Instruktur 📨')
          }
        })
    }
  }, [isAllDone, enrollmentId, certificateStatus, courseId])

  // Nomor sertifikat resmi diterbitkan server saat instruktur memvalidasi (trg_terbitkan_sertifikat).
  useEffect(() => {
    if (certificateStatus !== 'validated' || !courseId || !user?.id) return
    let batal = false
    const ambil = (kolom) => supabase.from('certificates').select(kolom)
      .eq('student_id', user.id).eq('course_id', courseId).maybeSingle()
    ;(async () => {
      let { data, error } = await ambil('certificate_code, issued_at, revoked_at, score, total_menit, sks_setara, rincian')
      // kolom jam/rincian ada sejak migrasi 20261112200000; sebelum itu pakai kolom dasar
      if (error) ({ data } = await ambil('certificate_code, issued_at, revoked_at, score'))
      if (batal || !data) return
      setSertifikat(data)
      try { setQrSertifikat(await buatQrDataUrl(urlVerifikasi(data.certificate_code))) } catch { /* QR opsional */ }
    })()
    return () => { batal = true }
  }, [certificateStatus, courseId, user?.id])

  async function handleUnduhPdf() {
    if (!sertifikatRef.current) return
    setMengunduhPdf(true)
    const toastId = toast.loading('Menyiapkan PDF sertifikat...')
    try {
      const nama = (profile?.full_name || 'Peserta').replace(/[^\p{L}\p{N}]+/gu, '-')
      await unduhSertifikatPdf(sertifikatRef.current, `Sertifikat-${nama}-${sertifikat?.certificate_code || course?.code || 'SYSTRACT'}.pdf`)
      toast.success('PDF sertifikat diunduh', { id: toastId })
    } catch (err) {
      console.error('[SYSTRACT] Gagal membuat PDF:', err)
      toast.error('Gagal membuat PDF. Gunakan tombol Cetak lalu pilih "Simpan sebagai PDF".', { id: toastId, duration: 6000 })
    } finally {
      setMengunduhPdf(false)
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
  if (!course) return <div className="empty-state"><p>Kursus tidak ditemukan.</p></div>

  if (!isEnrolled) {
    return (
      <CoursePreview
        course={course}
        materials={materials}
        enrollStatus={enrollStatus}
        enrolling={enrolling}
        onEnroll={handleEnroll}
        onBack={() => navigate('/katalog')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: 520 }}>
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--gray-200)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Tampilan: sembunyikan silabus / mode fokus (menyembunyikan menu aplikasi) */}
        {subTab === 'belajar' && (
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={!syllabusOpen}
            onClick={() => setSyllabusOpen(v => !v)}>
            {syllabusOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            {syllabusOpen ? 'Sembunyikan silabus' : 'Tampilkan silabus'}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm shell-hide-mobile" aria-pressed={focusMode}
          onClick={() => setFocusMode(!focusMode)}>
          {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {focusMode ? 'Keluar mode fokus' : 'Mode fokus'}
        </button>

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
            onClick={() => setSubTab('tugas')}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: subTab === 'tugas' ? '#fff' : 'transparent',
              color: subTab === 'tugas' ? 'var(--indigo-600)' : 'var(--gray-500)',
              boxShadow: subTab === 'tugas' ? 'var(--shadow-xs)' : 'none',
              transition: 'all .2s'
            }}
          >
            <ClipboardList size={13} style={{ marginRight: 4, display: 'inline' }} /> Tugas ({courseAssignments.length})
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
      </div>

      {/* Main Body */}
      {subTab === 'belajar' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 14 }}>
          {/* LEFT: Sidebar Syllabus */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--gray-200)', display: syllabusOpen ? 'flex' : 'none', flexDirection: 'column', paddingRight: 16, overflowY: 'auto' }}>
            
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groupedModules.map((mod, modIdx) => {
                const isExpanded = !!expandedSidebarModules[mod.id]
                const isCompleted = isModuleCompleted(mod)
                const isLocked = isModuleLocked(modIdx)
                return (
                  <div key={mod.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Module Header Toggle */}
                    <div 
                      onClick={() => setExpandedSidebarModules(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                      style={{ 
                        background: 'var(--gray-50)', 
                        padding: '8px 12px', 
                        borderRadius: 8,
                        border: '1px solid var(--gray-200)',
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        marginBottom: 4,
                        opacity: isLocked ? 0.75 : 1
                      }}
                    >
                      <span style={{ fontWeight: 750, fontSize: 11, color: isLocked ? 'var(--gray-500)' : 'var(--indigo-700)', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 16, 
                          height: 16, 
                          borderRadius: '50%', 
                          background: isLocked ? 'var(--gray-100)' : isCompleted ? '#dcfce7' : '#e0e7ff', 
                          color: isLocked ? 'var(--gray-400)' : isCompleted ? '#15803d' : 'var(--indigo-600)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          border: isLocked ? '1px solid var(--gray-300)' : isCompleted ? '1px solid #bbf7d0' : '1px solid #c7d2fe',
                          fontSize: 9,
                          fontWeight: 800,
                          flexShrink: 0
                        }}>
                          {isLocked ? <Lock size={9} /> : isCompleted ? '✓' : '•'}
                        </div>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {mod.name}
                        </span>
                      </span>
                      {isExpanded ? <ChevronUp size={14} color="var(--gray-400)"/> : <ChevronDown size={14} color="var(--gray-400)"/>}
                    </div>

                    {/* Module Items (Collapsable) */}
                    {isExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                        {mod.items.map((item, idx) => {
                          const isActive = activeItem?.id === item.id
                          let isDone = false
                          if (item.type === 'materi') isDone = completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
                          if (item.type === 'tugas') isDone = !!submissionsMap[item.data.id]
                          if (item.type === 'ujian') isDone = (examAnswersMap[item.data.id] || 0) >= 70

                          const prefix = mod.id === 0 ? '0' : mod.id === 99 ? '+' : `${mod.id}.${idx}`

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (isLocked) {
                                  toast.error(`Bagian ini terkunci. Silakan selesaikan topik sebelumnya terlebih dahulu!`);
                                  return;
                                }
                                setActiveItem(item);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 8, 
                                cursor: isLocked ? 'not-allowed' : 'pointer', textAlign: 'left',
                                background: isActive ? 'var(--indigo-50)' : 'transparent',
                                color: isLocked ? 'var(--gray-400)' : (isActive ? 'var(--indigo-700)' : 'var(--gray-600)'),
                                fontWeight: isActive ? 700 : 500,
                                fontSize: 11, transition: 'all .15s',
                                opacity: isLocked ? 0.6 : 1
                              }}
                            >
                              {isLocked ? (
                                <Lock size={11} color="var(--gray-400)" style={{ flexShrink: 0 }} />
                              ) : isDone ? (
                                <CheckCircle2 size={13} color="var(--success)" fill="#d1fae5" style={{ flexShrink: 0 }} />
                              ) : (
                                <span style={{ fontSize: 13, flexShrink: 0, width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--gray-400)' }}>
                                  •
                                </span>
                              )}
                              <span style={{ fontSize: 10, fontWeight: 700, color: isLocked ? 'var(--gray-300)' : 'var(--gray-400)', flexShrink: 0 }}>
                                {prefix}
                              </span>
                              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

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

          {/* RIGHT: Content Pane */}
          <div style={{ flex: 1, paddingLeft: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {isItemLocked(activeItem) ? (
              <div className="card animate-fade-in" style={{ padding: 32, textAlign: 'center', margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, border: '1px solid var(--gray-200)', background: 'linear-gradient(135deg, #f8fafc, #ffffff)', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', borderRadius: 16, maxWidth: 500, alignSelf: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid #fca5a5', color: '#dc2626', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.1)'
                }}>
                  <Lock size={32} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)' }}>Topik Terkunci</h3>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.6, margin: 0 }}>
                  Topik ini belum dapat diakses. Anda harus menyelesaikan materi dan tugas di topik sebelumnya terlebih dahulu untuk membuka konten ini.
                </p>
                {(() => {
                  const activeModIdx = groupedModules.findIndex(mod => {
                    if (mod.id === 0 && activeItem.week === 0) return true
                    if (mod.id === 99 && activeItem.week === 99) return true
                    return mod.weeks.includes(activeItem.week)
                  })
                  const lockingModule = getLockingModule(activeModIdx)
                  if (!lockingModule) return null

                  const pendingItems = lockingModule.items.filter(item => {
                    if (item.type === 'materi') return !completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
                    if (item.type === 'tugas') return !submissionsMap[item.data.id]
                    if (item.type === 'ujian') return (examAnswersMap[item.data.id] || 0) < 70
                    return false
                  })

                  return (
                    <div style={{ width: '100%', textAlign: 'left', marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.5px' }}>
                        Topik yang Harus Diselesaikan:
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--indigo-700)', marginBottom: 12 }}>
                        {lockingModule.name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pendingItems.map((item, _idx) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (!isItemLocked(item)) {
                                setActiveItem(item)
                              } else {
                                toast.error('Topik ini juga masih terkunci!')
                              }
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ justifyContent: 'flex-start', fontSize: 11, gap: 8, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 12px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center' }}
                          >
                            <span style={{ fontSize: 12 }}>{item.icon}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                            <span style={{ fontSize: 10, color: 'var(--indigo-600)', fontWeight: 600 }}>Kerjakan &rarr;</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <>
                {activeItem?.type === 'materi' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* WebSlide Integration */}
                {activeItem.data.webslide_content && (
                  <div style={{ marginBottom: 16 }}>
                    <WebSlidePlayer
                      courseName={course.name}
                      prodiName={profile?.program_studi || 'Teknik Informatika'}
                      meetingNo={activeItem.data.week_number || 1}
                      slideData={activeItem.data.webslide_content}
                      askWithContext={askWithContext}
                      onOpenNewTab={() => {
                        const htmlContent = generateWebSlideHtml(
                          course.name,
                          profile?.program_studi || 'Teknik Informatika',
                          activeItem.data.week_number || 1,
                          activeItem.data.webslide_content
                        );
                        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                        window.open(URL.createObjectURL(blob), '_blank');
                      }}
                    />
                  </div>
                )}

                {/* Embedded preview if supported */}
                {activeItem.attach.url !== '#' && (
                  getEmbedUrl(activeItem.attach.mime, activeItem.attach.url) ? (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: activeItem.attach.mime === 'video/youtube' ? '16/9' : '4/3', borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid var(--gray-200)' }}>
                      <iframe
                        src={getEmbedUrl(activeItem.attach.mime, activeItem.attach.url)}
                        title={activeItem.label}
                        referrerPolicy="strict-origin-when-cross-origin"
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
                  )
                )}

                {/* Description */}
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{activeItem.label}</h3>
                  {activeItem.data.description && <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{activeItem.data.description}</p>}
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
                  Ujian/Kuis ini merupakan evaluasi kompetensi mandiri. Anda harus lulus ujian ini dengan nilai minimal **{activeItem.data.passing_grade ?? 70}** untuk memenuhi kualifikasi sertifikat kompetensi.
                </p>

                <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderTop: '1px solid var(--gray-100)', borderBottom: '1px solid var(--gray-100)', padding: '12px 0' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Durasi</div>
                    <strong style={{ fontSize: 14, color: 'var(--gray-700)' }}>{activeItem.data.duration_minutes} Menit</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Passing Grade</div>
                    <strong style={{ fontSize: 14, color: 'var(--success)' }}>{activeItem.data.passing_grade ?? 70} / 100</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Status Kelulusan</div>
                    <strong style={{ fontSize: 14, color: (examAnswersMap[activeItem.data.id] || 0) >= (activeItem.data.passing_grade ?? 70) ? 'var(--success)' : 'var(--danger)' }}>
                      {(examAnswersMap[activeItem.data.id] || 0) >= (activeItem.data.passing_grade ?? 70) ? 'LULUS KOMPETEN' : 'BELUM LULUS'}
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
              <div style={{ textAlign: 'left', padding: '10px 0' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--gray-200)' }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-950)', margin: 0, fontFamily: 'Outfit, sans-serif' }}>Laporan Kelayakan Sertifikasi Kompetensi</h2>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, margin: 0 }}>
                      Evaluasi kesiapan sertifikat kompetensi berbasis penyelesaian topik dan penugasan mandiri.
                    </p>
                  </div>
                  
                  {/* Cetak Button */}
                  {certificateStatus === 'validated' ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleUnduhPdf}
                        disabled={mengunduhPdf}
                        style={{ gap: 6, fontWeight: 700, background: '#10b981', color: '#fff', borderColor: '#10b981' }}
                      >
                        {mengunduhPdf ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : <FileDown size={14} />} Unduh PDF
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ gap: 6, fontWeight: 700 }}>
                        Cetak
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled
                      style={{ gap: 6, fontWeight: 700, cursor: 'not-allowed', opacity: 0.6 }}
                      title="Menunggu validasi instruktur untuk dapat mencetak sertifikat"
                    >
                      <Lock size={14} /> Cetak Sertifikat (Belum Valid)
                    </button>
                  )}
                </div>

                {/* Status Banner */}
                {certificateStatus === 'validated' ? (
                  <div className="card animate-fade-in" style={{ padding: '16px 20px', background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46', borderRadius: 12, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#34d399', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 850, fontSize: 18, flexShrink: 0 }}>✓</div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Sertifikat Terverifikasi &amp; Valid!</h4>
                      <p style={{ fontSize: 11, color: '#047857', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        Instruktur telah memverifikasi pencapaian kompetensi Anda. File cetak dan pratinjau sertifikat diaktifkan di bawah ini.
                      </p>
                    </div>
                  </div>
                ) : certificateStatus === 'pending' ? (
                  <div className="card animate-fade-in" style={{ padding: '16px 20px', background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', borderRadius: 12, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Loader2 size={20} className="spinner" style={{ animation: 'spin 1.5s linear infinite', color: '#d97706', flexShrink: 0 }} />
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Menunggu Validasi Instruktur</h4>
                      <p style={{ fontSize: 11, color: '#b45309', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        Pekerjaan dan progres belajar Anda sedang dalam peninjauan oleh Instruktur kelas. Sertifikat dapat dicetak segera setelah disetujui.
                      </p>
                    </div>
                  </div>
                ) : certificateStatus === 'returned' ? (
                  <div className="card animate-fade-in" style={{ padding: '16px 20px', background: '#fff5f5', borderColor: '#fee2e2', color: '#991b1b', borderRadius: 12, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f87171', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>↩</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Sertifikat Dikembalikan untuk Revisi</h4>
                      <p style={{ fontSize: 11, color: '#b91c1c', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        Instruktur meminta Anda untuk melakukan revisi/perbaikan tugas agar dapat divalidasi.
                      </p>
                      {certificateNotes && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff', border: '1px solid #fee2e2', borderRadius: 8, fontSize: 11, color: '#374151' }}>
                          <strong style={{ display: 'block', color: '#991b1b', marginBottom: 2 }}>Catatan Instruktur:</strong>
                          {certificateNotes}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card animate-fade-in" style={{ padding: '16px 20px', background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569', borderRadius: 12, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#94a3b8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>!</div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Persyaratan Belum Lengkap</h4>
                      <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        Selesaikan seluruh materi kuliah, lulus ujian kompetensi (nilai &gt;= 70), dan kumpulkan seluruh tugas untuk mengajukan sertifikat.
                      </p>
                    </div>
                  </div>
                )}

                {/* Progress Stats Widget */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Progres Pembelajaran</span>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-950)', margin: '6px 0', fontFamily: 'Outfit, sans-serif' }}>{completedSteps} / {totalSteps} Selesai</h3>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${overallPercent}%`, background: 'var(--indigo-600)' }} />
                    </div>
                  </div>

                  <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Pengumpulan Tugas</span>
                    {(() => {
                      const submitted = courseAssignments.filter(a => !!submissionsMap[a.id]).length
                      const total = courseAssignments.length
                      return (
                        <>
                          <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-950)', margin: '6px 0', fontFamily: 'Outfit, sans-serif' }}>{submitted} / {total} Dikirim</h3>
                          <span style={{ fontSize: 10, color: submitted === total ? 'var(--success)' : 'var(--gray-400)', fontWeight: 600 }}>
                            {submitted === total ? '✓ Semua tugas selesai dikirim' : 'Harap kirimkan semua tugas kelas'}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Detailed Topics and Tasks List */}
                <div className="card animate-fade-in" style={{ padding: 20, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--gray-950)', marginBottom: 12, fontFamily: 'Outfit, sans-serif' }}>Detail Pencapaian Pembelajaran</h3>
                  
                  {/* Module List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groupedModules.map((mod, _modIdx) => {
                      return (
                        <div key={mod.id} style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: 12 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--indigo-700)', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px 0' }}>
                                                        <span style={{ color: 'var(--gray-800)' }}>{mod.name}</span>
                          </h4>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12 }}>
                            {mod.items.map((item, _idx) => {
                              let itemDone = false
                              let scoreText = ''
                              if (item.type === 'materi') {
                                itemDone = completedRefs.has(`mat_${item.data.id}_${item.subIdx}`)
                                scoreText = itemDone ? 'Selesai Dibaca' : 'Belum Dibaca'
                              } else if (item.type === 'ujian') {
                                const score = examAnswersMap[item.data.id] || 0
                                itemDone = score >= (item.data.passing_grade ?? 70)
                                scoreText = score > 0 ? `Nilai: ${score} (Lulus >= ${item.data.passing_grade ?? 70})` : 'Belum Ujian'
                              }

                              return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                                  <span style={{ color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>{item.type === 'materi' ? '📖' : '🧠'}</span>
                                    <span>{item.label}</span>
                                  </span>
                                  <span style={{ fontWeight: 700, color: itemDone ? 'var(--success)' : 'var(--gray-400)' }}>
                                    {scoreText} {itemDone ? '✓' : ''}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Assignment List */}
                <div className="card animate-fade-in" style={{ padding: 20, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--gray-950)', marginBottom: 12, fontFamily: 'Outfit, sans-serif' }}>Pemeriksaan Tugas &amp; Proyek</h3>
                  
                  {courseAssignments.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>Tidak ada penugasan terdaftar pada kelas ini.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {courseAssignments.map(a => {
                        const sub = submissionsMap[a.id]
                        const isGraded = sub?.status === 'graded'
                        const isRevision = sub?.status === 'revision'
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-800)' }}>{a.title}</span>
                              <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>Nilai Maksimal: {a.max_score}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {sub ? (
                                <>
                                  <span className={`badge-pill ${isGraded ? 'badge-green' : isRevision ? 'badge-amber' : 'badge-indigo'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                                    {isGraded ? `Dinilai: ${sub.grade}` : isRevision ? 'Perlu Revisi' : 'Terkirim / Menunggu Nilai'}
                                  </span>
                                  {sub.webview_link && (
                                    <a href={sub.webview_link} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600, color: 'var(--indigo-600)', textDecoration: 'none' }}>
                                      Buka Tugas ↗
                                    </a>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                                  Belum Dikirim!
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Printable Certificate Container Preview (only shown if validated) */}
                {certificateStatus === 'validated' && (
                  <div style={{ marginTop: 32 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--gray-950)', marginBottom: 16, fontFamily: 'Outfit, sans-serif' }}>Pratinjau Sertifikat</h3>
                    
                    {/* Printable container encompassing both pages */}
                    <div ref={sertifikatRef} className="printable-certificate-container" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  
                  <SkalaHalaman>
                    <SertifikatDepan
                      nama={profile?.full_name}
                      kursus={course.name}
                      skor={sertifikat?.score}
                      terbit={sertifikat?.issued_at}
                      totalMenit={sertifikat?.total_menit}
                      sksSetara={sertifikat?.sks_setara}
                      nomor={sertifikat?.certificate_code}
                      qr={qrSertifikat}
                    />
                  </SkalaHalaman>
                  <SkalaHalaman>
                    <SertifikatBelakang
                      nama={profile?.full_name}
                      kursus={course.name}
                      nomor={sertifikat?.certificate_code}
                      terbit={sertifikat?.issued_at}
                      totalMenit={sertifikat?.total_menit}
                      sksSetara={sertifikat?.sks_setara}
                      rincian={sertifikat?.rincian}
                      qr={qrSertifikat}
                    />
                  </SkalaHalaman>
                </div>
                </div>
                )}

                <style>{`
                  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                  @media print {
                    @page { size: A4 landscape; margin: 0; }
                    body { margin: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body * { visibility: hidden; }
                    .printable-certificate-container, .printable-certificate-container * { visibility: visible; }
                    .printable-certificate-container { position: absolute !important; left: 0 !important; top: 0 !important; gap: 0 !important; margin: 0 !important; padding: 0 !important; }
                    .sert-wadah { width: 1123px !important; max-width: none !important; height: 794px !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; break-after: page; page-break-after: always; }
                    .sert-skala { transform: none !important; }
                  }
                `}</style>
              </div>
            )}
          </>
        )}
      </div>
    </div>
      )}

      {/* TUGAS / ASSIGNMENT TAB BODY */}
      {subTab === 'tugas' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 14 }}>
          {/* LEFT: Sidebar Tugas */}
          <div style={{ width: 280, borderRight: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', paddingRight: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '.4px' }}>
                Daftar Tugas
              </div>
              {courseAssignments.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: 'var(--gray-400)' }}>
                  Belum ada tugas untuk mata kuliah ini.
                </div>
              ) : (
                courseAssignments.map((a, _idx) => {
                  const sub = submissionsMap[a.id]
                  const isDone = !!sub
                  const isActive = activeTugas?.id === a.id
                  return (
                    <button
                      key={a.id}
                      onClick={() => setActiveTugas(a)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 8, 
                        cursor: 'pointer', textAlign: 'left',
                        background: isActive ? 'var(--indigo-50)' : 'transparent',
                        color: isActive ? 'var(--indigo-700)' : 'var(--gray-600)',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: 11, transition: 'all .15s',
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 size={13} color="var(--success)" fill="#d1fae5" style={{ flexShrink: 0 }} />
                      ) : (
                        <span style={{ fontSize: 13, flexShrink: 0, width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--gray-400)' }}>
                          •
                        </span>
                      )}
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.title}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* RIGHT: Content Pane for Selected Tugas */}
          <div style={{ flex: 1, paddingLeft: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {activeTugas ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div className="card-header">
                    <strong style={{ fontSize: 14 }}>{activeTugas.title}</strong>
                    {submissionsMap[activeTugas.id] ? (
                      <span className={`badge-pill ${submissionsMap[activeTugas.id].status === 'graded' ? 'badge-green' : 'badge-indigo'}`}>
                        {submissionsMap[activeTugas.id].status === 'graded' ? '✓ Sudah Dinilai' : '📨 Dikumpulkan'}
                      </span>
                    ) : (
                      <span className="badge-pill badge-amber">Belum Dikumpulkan</span>
                    )}
                  </div>
                  <div className="card-body">
                    {activeTugas.description && (
                      <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 16 }}>
                        {activeTugas.description}
                      </p>
                    )}
                    
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
                      <span>📅 Batas Waktu: {activeTugas.due_date ? new Date(activeTugas.due_date).toLocaleString('id-ID') : 'Tidak ada'}</span>
                      <span>Nilai Maksimum: {activeTugas.max_score}</span>
                    </div>
                  </div>
                </div>

                {/* Submission Form */}
                {submissionsMap[activeTugas.id]?.status === 'graded' ? (
                  <div style={{ background: 'linear-gradient(135deg,#eef2ff,#f0fdf4)', border: '1px solid #c7d2fe', borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <CheckCircle2 size={20} color="#16a34a" />
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>
                        Nilai Kompetensi: <span style={{ fontSize: 22, color: 'var(--indigo-700)' }}>{submissionsMap[activeTugas.id].grade}</span>
                        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}> / {activeTugas.max_score}</span>
                      </div>
                    </div>
                    {submissionsMap[activeTugas.id].feedback && (
                      <div style={{ fontSize: 12, color: 'var(--gray-700)', background: '#fff', borderRadius: 8, padding: 10, border: '1px solid var(--gray-200)' }}>
                        <strong>Catatan Instruktur:</strong> {submissionsMap[activeTugas.id].feedback}
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
                      onClick={() => handleTugasSubmit(activeTugas.id)}
                      style={{ marginTop: 12 }}
                    >
                      {submittingTugas ? <Loader2 size={13} className="spinner" /> : <Send size={13} />}
                      {submissionsMap[activeTugas.id] ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>
                <ClipboardList size={48} style={{ marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Pilih tugas dari daftar untuk melihat detail dan mengirimkan hasil pekerjaan Anda.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCUSSION FORUM BODY */}
      {subTab === 'diskusi' && (
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
