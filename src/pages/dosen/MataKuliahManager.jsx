import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, BookOpen, Users, Edit2, Trash2, Loader2, X, Copy,
  CheckCircle2, Circle, BookMarked, ExternalLink, ChevronDown,
  PlusCircle, Search, Sparkles, RefreshCw, FileText, Download,
  Share2, ArrowLeft, PenTool, CheckCircle, ChevronUp, Info, HelpCircle,
  Award, Clock
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import courseBanner from '@/assets/course_banner.png'

// AI & Template Imports
import {
  generateCourseDescription, generateCplForCourse, generateCpmk,
  generateWeeklyPlan, generateReferences, generateSlideContent,
  generateWebSlideData, generateEssayQuestions
} from '@/lib/ai'
import { generateWebSlideHtml } from '@/lib/webslideTemplate'

const COLORS   = ['#4f46e5','#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const SEMESTERS = ['Ganjil 2025/2026','Genap 2025/2026','Ganjil 2026/2027']

const MODULES = [
  { id: 1, name: 'Module 1: Fondasi & Konsep Dasar (Pertemuan 1 - 4)', weeks: [1, 2, 3, 4] },
  { id: 2, name: 'Module 2: Penerapan & Analisis Praktis (Pertemuan 5 - 7)', weeks: [5, 6, 7] },
  { id: 3, name: 'Module 3: Evaluasi Tengah Semester (UTS - Pertemuan 8)', weeks: [8] },
  { id: 4, name: 'Module 4: Pengembangan Sistem & Desain Lanjut (Pertemuan 9 - 12)', weeks: [9, 10, 11, 12] },
  { id: 5, name: 'Module 5: Integrasi & Pengujian Akhir (Pertemuan 13 - 15)', weeks: [13, 14, 15] },
  { id: 6, name: 'Module 6: Evaluasi Akhir Semester (UAS - Pertemuan 16)', weeks: [16] }
]

export function groupMaterialsIntoModules(materials) {
  const bins = MODULES.map(m => ({ ...m, items: [] }))
  const generalBin = { id: 0, name: '📢 Umum / Pengantar', weeks: [0], items: [] }
  const extraBin = { id: 99, name: '➕ Materi Tambahan', weeks: [], items: [] }

  materials.forEach(m => {
    const w = m.week_number || 0
    if (w === 0) {
      generalBin.items.push(m)
    } else {
      const target = bins.find(b => b.weeks.includes(w))
      if (target) {
        target.items.push(m)
      } else {
        extraBin.items.push(m)
      }
    }
  })

  return [generalBin, ...bins, extraBin].filter(b => b.items.length > 0)
}

const BLANK_COURSE_FORM = { code:'', name:'', description:'', credits:3, semester: SEMESTERS[0], cover_color:'#4f46e5', dosen_id:'' }

// ── Attachment type definitions ────────────────────────────────
const ATTACH_TYPES = [
  { id: 'drive',   label: 'Google Drive',   icon: '📁', color: '#4285f4', bg: '#e8f0fe', mime: 'application/vnd.google-apps.document', placeholder: 'https://drive.google.com/file/d/...' },
  { id: 'youtube', label: 'YouTube',         icon: '🎬', color: '#ff0000', bg: '#fff1f2', mime: 'video/youtube',                        placeholder: 'https://www.youtube.com/watch?v=...' },
  { id: 'pdf',     label: 'PDF / Dokumen',   icon: '📄', color: '#ef4444', bg: '#fef2f2', mime: 'application/pdf',                      placeholder: 'https://example.com/file.pdf' },
  { id: 'web',     label: 'Artikel / Web',   icon: '🌐', color: '#10b981', bg: '#f0fdf4', mime: 'text/html',                            placeholder: 'https://...' },
]

const BLANK_ATTACH = () => ({ mime: ATTACH_TYPES[0].mime, url: '', label: '' })
const BLANK_MATERIAL_FORM = () => ({ title: '', description: '', week_number: 1, attachments: [BLANK_ATTACH()] })

function typeOf(mime) { return ATTACH_TYPES.find(t => t.mime === mime) || ATTACH_TYPES[3] }

function extractYouTubeId(url = '') {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

// ── Row for one attachment ─────────────────────────────────────
function AttachRow({ attach, idx, onChange, onRemove, canRemove }) {
  const t = typeOf(attach.mime)
  const ytId = attach.mime === 'video/youtube' ? extractYouTubeId(attach.url) : null

  return (
    <div style={{ border:'1px solid var(--gray-200)', borderRadius:10, padding:'12px 14px', marginBottom:10, background:'var(--gray-50)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:18 }}>{t.icon}</span>
        <div style={{ position:'relative', flex:'0 0 160px' }}>
          <select
            className="input"
            value={attach.mime}
            onChange={e => onChange(idx, 'mime', e.target.value)}
            style={{ paddingRight:28, fontSize:12 }}
          >
            {ATTACH_TYPES.map(a => (
              <option key={a.id} value={a.mime}>{a.icon} {a.label}</option>
            ))}
          </select>
          <ChevronDown size={12} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--gray-400)' }}/>
        </div>
        <input
          className="input"
          placeholder="Label (opsional)"
          value={attach.label}
          onChange={e => onChange(idx, 'label', e.target.value)}
          style={{ flex:1, fontSize:12 }}
        />
        {canRemove && (
          <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)', flexShrink:0 }} onClick={() => onRemove(idx)}>
            <X size={14}/>
          </button>
        )}
      </div>

      <input
        className="input"
        placeholder={t.placeholder}
        value={attach.url}
        onChange={e => onChange(idx, 'url', e.target.value)}
        style={{ fontSize:12 }}
      />

      {ytId && (
        <div style={{ position:'relative', marginTop:8, borderRadius:8, overflow:'hidden', aspectRatio:'16/9', maxHeight:120, background:'#000' }}>
          <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="thumbnail" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:.85 }}/>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width:40, height:40, background:'#ff0000', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:16, color: '#fff' }}>▶</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main SPA component ─────────────────────────────────────────
export default function DosenMataKuliah() {
  const { user, profile, isAdmin } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'curriculum' | 'ai_assistant'

  // ── Course states ──────────────────────────────────────────
  const [courses,    setCourses]    = useState([])
  const [dosenList,  setDosenList]  = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [courseModal, setCourseModal] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [savingCourse, setSavingCourse] = useState(false)
  const [courseForm, setCourseForm] = useState(BLANK_COURSE_FORM)
  const [searchTerm, setSearchTerm] = useState('')

  // Active selected course
  const [selectedCourseId, setSelectedCourseId] = useState(null)

  // ── Copy states ────────────────────────────────────────────
  const [copyModal,  setCopyModal]  = useState(false)
  const [copySource, setCopySource] = useState(null)
  const [copying,    setCopying]    = useState(false)
  const [copyStep,   setCopyStep]   = useState('')
  const [copyForm,   setCopyForm]   = useState({ code:'', name:'', semester: SEMESTERS[0], dosen_id:'' })
  const [copyOpts,   setCopyOpts]   = useState({
    materials: true, assignments: true, questions: true, exams: true, forums: true,
  })

  // ── Materials states ────────────────────────────────────────
  const [materials, setMaterials] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [materialModal, setMaterialModal] = useState(false)
  const [editingMaterialId, setEditingMaterialId] = useState(null)
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [materialForm, setMaterialForm] = useState(BLANK_MATERIAL_FORM())
  const [expandedModules, setExpandedModules] = useState({
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 99: true
  })

  // ── Enrollments states ──────────────────────────────────────
  const [enrollments, setEnrollments] = useState([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  // ── AI Assistant states ─────────────────────────────────────
  const [aiProgressText, setAiProgressText] = useState('')
  const [aiGeneratingDesc, setAiGeneratingDesc] = useState(false)
  const [aiGeneratingCplCpmk, setAiGeneratingCplCpmk] = useState(false)
  const [aiGeneratingWeekly, setAiGeneratingWeekly] = useState(false)
  const [aiGeneratingRefs, setAiGeneratingRefs] = useState(false)
  const [aiActiveStep, setAiActiveStep] = useState(1)

  // Temp local state for generated AI content before saving to course
  const [tempDesc, setTempDesc] = useState('')
  const [topicsInput, setTopicsInput] = useState('')
  const [topicsModal, setTopicsModal] = useState(false)
  const [tempCpl, setTempCpl] = useState([])
  const [tempCpmk, setTempCpmk] = useState([])
  const [tempWeekly, setTempWeekly] = useState([])
  const [tempRefs, setTempRefs] = useState([])

  // ── AI Slide Generator states ───────────────────────────────
  const [slideModal, setSlideModal] = useState(false)
  const [activeMeeting, setActiveMeeting] = useState(null)
  const [loadingSlide, setLoadingSlide] = useState(false)
  const [generatingWebSlide, setGeneratingWebSlide] = useState(false)
  const [savingSlide, setSavingSlide] = useState(false)
  const [slideOutline, setSlideOutline] = useState(null)
  const [webslideData, setWebslideData] = useState(null)
  const [aiSlideProgressText, setAiSlideProgressText] = useState('')
  const [essayData, setEssayData] = useState(null) // for UTS/UAS questions

  const handleAiProgress = (event) => {
    if (typeof event === 'string') {
      setAiProgressText(event)
    } else if (event && event.type === 'chunk') {
      const chars = event.text.length
      setAiProgressText(`AI sedang merumuskan konten... (${chars.toLocaleString('id-ID')} karakter)`)
    }
  }

  const handleAiSlideProgress = (event) => {
    if (typeof event === 'string') {
      setAiSlideProgressText(event)
    } else if (event && event.type === 'chunk') {
      const chars = event.text.length
      setAiSlideProgressText(`AI sedang merancang WebSlide... (${chars.toLocaleString('id-ID')} karakter)`)
    }
  }

  // Load initial courses and config
  useEffect(() => {
    if (user) {
      fetchCourses()
      if (isAdmin) fetchDosenList()
    }
  }, [user, isAdmin])

  // React to course selection changes
  useEffect(() => {
    if (selectedCourseId) {
      fetchMaterials(selectedCourseId)
    } else {
      setMaterials([])
    }
  }, [selectedCourseId])

  // Track search query parameter changes (for sidebar links compatibility)
  const courseIdParam = searchParams.get('courseId')
  useEffect(() => {
    if (courseIdParam && courseIdParam !== selectedCourseId) {
      const match = courses.find(c => c.id === courseIdParam)
      if (match) {
        setSelectedCourseId(courseIdParam)
      }
    }
  }, [courseIdParam, courses])

  const selectedCourse = courses.find(c => c.id === selectedCourseId)

  // Initialize temp states for AI Generator when selecting another course or when it gets updated
  useEffect(() => {
    if (selectedCourse) {
      setTempDesc(selectedCourse.description || '')
      setTempCpl(selectedCourse.cpl || [])
      setTempCpmk(selectedCourse.cpmk || [])
      setTempWeekly(selectedCourse.weekly_plan || [])
      setTempRefs(selectedCourse.referensi || [])
    }
  }, [selectedCourseId, courses])

  // Reset tab and step only when the selected course ID changes
  useEffect(() => {
    if (selectedCourseId) {
      setActiveTab('overview')
      setAiActiveStep(1)
    }
  }, [selectedCourseId])

  // Fetch enrollments when courseId or activeTab is active
  useEffect(() => {
    if (selectedCourseId && activeTab === 'enrollments') {
      fetchEnrollments(selectedCourseId)
    }
  }, [selectedCourseId, activeTab])

  async function fetchEnrollments(courseId) {
    setLoadingEnrollments(true)
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, student:profiles(id, full_name, nim, email, avatar_url)')
        .eq('course_id', courseId)
        .order('enrolled_at', { ascending: false })
      if (error) throw error
      setEnrollments(data || [])
    } catch (e) {
      console.error('[SYSTRACT] Error fetching enrollments:', e)
      toast.error('Gagal memuat daftar pendaftaran mahasiswa')
    } finally {
      setLoadingEnrollments(false)
    }
  }

  async function handleApproveEnrollment(enrollId) {
    const toastId = toast.loading('Menyetujui pendaftaran...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'approved' })
        .eq('id', enrollId)
      if (error) throw error
      toast.success('Pendaftaran disetujui! 🎉', { id: toastId })
      if (selectedCourseId) fetchEnrollments(selectedCourseId)
      fetchCourses(selectedCourseId) // refresh course count in left sidebar
    } catch (e) {
      console.error('[SYSTRACT] Error approving enrollment:', e)
      toast.error('Gagal menyetujui pendaftaran', { id: toastId })
    }
  }

  async function handleRejectEnrollment(enrollId, studentName) {
    const ok = await showConfirm({
      title: 'Tolak / Batalkan Pendaftaran?',
      message: `Apakah Anda yakin ingin menolak/membatalkan pendaftaran untuk mahasiswa ${studentName}?`,
      confirmLabel: 'Ya, Batalkan/Tolak',
      variant: 'danger',
    })
    if (!ok) return

    const toastId = toast.loading('Memproses penolakan...')
    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', enrollId)
      if (error) throw error
      toast.success('Pendaftaran ditolak/dihapus.', { id: toastId })
      if (selectedCourseId) fetchEnrollments(selectedCourseId)
      fetchCourses(selectedCourseId) // refresh course count in left sidebar
    } catch (e) {
      console.error('[SYSTRACT] Error rejecting enrollment:', e)
      toast.error('Gagal menolak pendaftaran', { id: toastId })
    }
  }

  // ── Database Fetch functions ─────────────────────────────────
  async function fetchCourses(selectId = null) {
    let query = supabase
      .from('courses')
      .select(`
        *,
        enrollments(count),
        dosen:profiles!courses_dosen_id_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (!isAdmin) query = query.eq('dosen_id', user.id)

    const { data, error } = await query
    if (error) {
      console.error('[EduSYS] fetchCourses:', error)
      setLoadingCourses(false)
      return
    }

    setCourses(data || [])
    setLoadingCourses(false)

    // Sync selected state
    const paramId = selectId || searchParams.get('courseId')
    const match = paramId && data?.find(c => c.id === paramId)
    if (match) {
      setSelectedCourseId(match.id)
      if (searchParams.get('courseId') !== match.id) {
        setSearchParams({ courseId: match.id })
      }
    } else if (data?.length > 0) {
      setSelectedCourseId(data[0].id)
      setSearchParams({ courseId: data[0].id })
    } else {
      setSelectedCourseId(null)
    }
  }

  async function fetchDosenList() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'dosen')
      .order('full_name')
    setDosenList(data || [])
  }

  async function fetchMaterials(cid) {
    if (!cid) return
    setLoadingMaterials(true)
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('course_id', cid)
      .order('week_number')
      .order('created_at')

    if (error) console.error('[EduSYS] fetchMaterials:', error)
    setMaterials(data || [])
    setLoadingMaterials(false)
  }

  // ── Select Course helper ─────────────────────────────────────
  function handleSelectCourse(id) {
    setSelectedCourseId(id)
    setSearchParams({ courseId: id })
  }

  // ── Course Handlers ──────────────────────────────────────────
  function openNewCourse() {
    setCourseForm({ ...BLANK_COURSE_FORM, dosen_id: isAdmin ? '' : user.id })
    setEditingCourseId(null)
    setCourseModal(true)
  }

  function openEditCourse(c) {
    setCourseForm({
      code:        c.code,
      name:        c.name,
      description: c.description || '',
      credits:     c.credits,
      semester:    c.semester || SEMESTERS[0],
      cover_color: c.cover_color || '#4f46e5',
      dosen_id:    c.dosen_id || '',
    })
    setEditingCourseId(c.id)
    setCourseModal(true)
  }

  async function handleSaveCourse() {
    if (!courseForm.code || !courseForm.name) { toast.error('Kode dan nama wajib diisi'); return }
    if (isAdmin && !courseForm.dosen_id) { toast.error('Pilih dosen pengampu terlebih dahulu'); return }

    setSavingCourse(true)
    const payload = {
      ...courseForm,
      dosen_id: isAdmin ? courseForm.dosen_id : user.id,
    }

    let error
    let returnedData = null
    if (editingCourseId) {
      ;({ error } = await supabase.from('courses').update(payload).eq('id', editingCourseId))
    } else {
      const res = await supabase.from('courses').insert(payload).select().single()
      error = res.error
      returnedData = res.data
    }

    if (error) {
      console.error('[EduSYS] save course:', error)
      toast.error(`Gagal menyimpan: ${error.message}`)
    } else {
      toast.success(editingCourseId ? 'Kursus diperbarui' : 'Kursus ditambahkan')
      setCourseModal(false)
      const targetId = editingCourseId || returnedData?.id || null
      fetchCourses(targetId)
    }
    setSavingCourse(false)
  }

  async function handleDeleteCourse(id) {
    const ok = await showConfirm({
      title: 'Hapus Kursus?',
      message: 'Semua data terkait (tugas, ujian, materi, forum) akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return

    const { error, count } = await supabase
      .from('courses')
      .delete({ count: 'exact' })
      .eq('id', id)

    if (error) {
      console.error('[EduSYS] handleDelete error:', error)
      toast.error('Gagal menghapus: ' + error.message)
    } else if (count === 0) {
      toast.error('Tidak dapat menghapus. Pastikan kebijakan database mengizinkan operasi ini.')
    } else {
      toast.success('Kursus dihapus')
      const remaining = courses.filter(c => c.id !== id)
      const nextSelectId = remaining[0]?.id || null
      setCourses(remaining)
      if (nextSelectId) {
        handleSelectCourse(nextSelectId)
      } else {
        setSelectedCourseId(null)
        setSearchParams({})
      }
      fetchCourses(nextSelectId)
    }
  }

  // ── Copy Helpers ─────────────────────────────────────────────
  function openCopy(c) {
    setCopySource(c)
    setCopyForm({ code: c.code + '-COPY', name: 'Salinan ' + c.name, semester: SEMESTERS[0], dosen_id: c.dosen_id || '' })
    setCopyOpts({ materials: true, assignments: true, questions: true, exams: true, forums: true })
    setCopyStep('')
    setCopyModal(true)
  }

  async function handleCopy() {
    if (!copyForm.code.trim() || !copyForm.name.trim()) { toast.error('Kode dan nama wajib diisi'); return }
    if (!copyForm.dosen_id) { toast.error('Pilih dosen pengampu'); return }
    setCopying(true)
    try {
      setCopyStep('Membuat kursus baru...')
      const { data: newCourse, error: cErr } = await supabase.from('courses').insert({
        code: copyForm.code.trim(), name: copyForm.name.trim(),
        description: copySource.description || '',
        credits: copySource.credits, semester: copyForm.semester,
        cover_color: copySource.cover_color || '#4f46e5',
        dosen_id: copyForm.dosen_id, is_active: true,
      }).select().single()
      if (cErr) throw new Error('Gagal membuat kursus: ' + cErr.message)

      const sid = copySource.id, nid = newCourse.id

      await Promise.all([
        copyOpts.materials   && copyMaterials(sid, nid),
        copyOpts.assignments && copyAssignments(sid, nid),
        copyOpts.questions   && copyQuestions(sid, nid),
        copyOpts.exams       && copyExams(sid, nid),
        copyOpts.forums      && copyForums(sid, nid),
      ].filter(Boolean))

      toast.success(`Kursus "${newCourse.name}" berhasil disalin!`)
      setCopyModal(false)
      fetchCourses(nid)
    } catch (err) {
      toast.error(err.message || 'Gagal menyalin kursus')
    } finally {
      setCopying(false)
      setCopyStep('')
    }
  }

  async function copyMaterials(fromId, toId) {
    setCopyStep('Menyalin materi...')
    const { data } = await supabase.from('materials').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('materials').insert(rows)
  }

  async function copyAssignments(fromId, toId) {
    setCopyStep('Menyalin tugas...')
    const { data } = await supabase.from('assignments').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({
      ...rest, course_id: toId, due_date: null,
    }))
    await supabase.from('assignments').insert(rows)
  }

  async function copyQuestions(fromId, toId) {
    setCopyStep('Menyalin bank soal...')
    const { data } = await supabase.from('questions').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('questions').insert(rows)
  }

  async function copyExams(fromId, toId) {
    setCopyStep('Menyalin struktur ujian...')
    const { data } = await supabase.from('exams').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({
      ...rest, course_id: toId,
      is_published: false,
      start_at: null, end_at: null,
    }))
    await supabase.from('exams').insert(rows)
  }

  async function copyForums(fromId, toId) {
    setCopyStep('Menyalin forum...')
    const { data } = await supabase.from('forums').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('forums').insert(rows)
  }

  // ── Material & Attachments Handlers ──────────────────────────
  function openNewMaterial() {
    setMaterialForm(BLANK_MATERIAL_FORM())
    setEditingMaterialId(null)
    setMaterialModal(true)
  }

  function openEditMaterial(m) {
    const attachments = (m.attachments && m.attachments.length > 0)
      ? m.attachments
      : m.webview_link ? [{ mime: m.mime_type || ATTACH_TYPES[0].mime, url: m.webview_link, label: '' }]
      : [BLANK_ATTACH()]
    setMaterialForm({ title: m.title, description: m.description||'', week_number: m.week_number||1, attachments })
    setEditingMaterialId(m.id)
    setMaterialModal(true)
  }

  function updateAttach(idx, key, val) {
    setMaterialForm(f => {
      const arr = [...f.attachments]
      arr[idx] = { ...arr[idx], [key]: val }
      return { ...f, attachments: arr }
    })
  }

  const addAttach = () => setMaterialForm(f => ({ ...f, attachments: [...f.attachments, BLANK_ATTACH()] }))
  const removeAttach = (idx) => setMaterialForm(f => ({ ...f, attachments: f.attachments.filter((_,i) => i !== idx) }))

  async function handleSaveMaterial() {
    if (!materialForm.title.trim()) { toast.error('Judul wajib diisi'); return }
    const filled = materialForm.attachments.filter(a => a.url.trim())
    if (filled.length === 0) { toast.error('Tambahkan minimal 1 lampiran dengan URL'); return }
    setSavingMaterial(true)
    const first = filled[0]

    const payload = {
      title: materialForm.title,
      description: materialForm.description,
      week_number: materialForm.week_number,
      attachments: filled,
      webview_link: first.url,
      mime_type: first.mime,
    }

    let error
    if (editingMaterialId) {
      ;({ error } = await supabase.from('materials').update(payload).eq('id', editingMaterialId))
    } else {
      ;({ error } = await supabase.from('materials').insert({
        ...payload,
        course_id: selectedCourseId,
        uploaded_by: user.id
      }))
    }

    // Fallback if column not found
    if (error && error.message?.includes('attachments')) {
      toast('⚠️ Kolom attachments belum ada di server. Menyimpan dengan link tunggal...', { duration: 5000 })
      const fallbackPayload = {
        title: materialForm.title,
        description: materialForm.description,
        week_number: materialForm.week_number,
        webview_link: first.url,
        mime_type: first.mime
      }
      if (editingMaterialId) {
        ;({ error } = await supabase.from('materials').update(fallbackPayload).eq('id', editingMaterialId))
      } else {
        ;({ error } = await supabase.from('materials').insert({
          ...fallbackPayload,
          course_id: selectedCourseId,
          uploaded_by: user.id
        }))
      }
    }

    if (error) {
      toast.error('Gagal menyimpan: ' + error.message)
    } else {
      toast.success(editingMaterialId ? 'Materi diperbarui' : 'Materi ditambahkan')
      setMaterialModal(false)
      setEditingMaterialId(null)
      fetchMaterials(selectedCourseId)
    }
    setSavingMaterial(false)
  }

  async function handleDeleteMaterial(id) {
    const ok = await showConfirm({
      title: 'Hapus Materi?',
      message: 'Materi dan semua file terkait akan dihapus. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('materials').delete().eq('id', id)
    if (error) {
      toast.error('Gagal menghapus: ' + error.message)
    } else {
      toast('Materi dihapus', { icon: '🗑️' })
      fetchMaterials(selectedCourseId)
    }
  }

  // ── AI Assistant Actions ─────────────────────────────────────
  async function handleAiGenerateDesc() {
    setTopicsModal(false)
    setAiGeneratingDesc(true)
    setAiProgressText("Menganalisis Nama Kursus & Topik...")
    try {
      const res = await generateCourseDescription(selectedCourse.name, topicsInput, handleAiProgress)
      if (res && res.deskripsi) {
        setTempDesc(res.deskripsi)
        toast.success("Deskripsi kursus berhasil dirumuskan AI! 🤖")
      } else {
        throw new Error("Hasil deskripsi kosong.")
      }
    } catch (err) {
      toast.error("Gagal generate deskripsi: " + err.message)
    } finally {
      setAiGeneratingDesc(false)
      setAiProgressText('')
    }
  }

  async function handleSaveDesc() {
    const { error } = await supabase
      .from('courses')
      .update({ description: tempDesc })
      .eq('id', selectedCourse.id)

    if (error) {
      toast.error("Gagal menyimpan deskripsi: " + error.message)
    } else {
      toast.success("Deskripsi berhasil disimpan!")
      fetchCourses(selectedCourse.id)
    }
  }

  async function handleAiGenerateCplCpmk() {
    setAiGeneratingCplCpmk(true)
    setAiProgressText("Mengambil data CPL prodi kurikulum...")
    try {
      const cpls = await generateCplForCourse(selectedCourse.name, [], handleAiProgress)
      setTempCpl(cpls || [])

      setAiProgressText("Menganalisis keterkaitan CPL dan merumuskan CPMK...")
      const cpmks = await generateCpmk(selectedCourse.name, tempDesc || selectedCourse.description, cpls, handleAiProgress)
      setTempCpmk(cpmks || [])

      toast.success("CPL & CPMK berhasil disusun AI! 🎯")
    } catch (err) {
      toast.error("Gagal generate CPL/CPMK: " + err.message)
    } finally {
      setAiGeneratingCplCpmk(false)
      setAiProgressText('')
    }
  }

  async function handleSaveCplCpmk() {
    const { error } = await supabase
      .from('courses')
      .update({ cpl: tempCpl, cpmk: tempCpmk })
      .eq('id', selectedCourse.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Kolom database belum tersedia. Harap jalankan script migrasi supabase_migration_rps.sql di Supabase SQL Editor.', { duration: 6000 })
      } else {
        toast.error("Gagal menyimpan CPL & CPMK: " + error.message)
      }
    } else {
      toast.success("CPL & CPMK berhasil disimpan ke kursus!")
      fetchCourses(selectedCourse.id)
    }
  }

  async function handleAiGenerateWeekly() {
    setAiGeneratingWeekly(true)
    setAiProgressText("Menganalisis CPMK & menyusun outline silabus 16 pertemuan...")
    try {
      const list = await generateWeeklyPlan(
        selectedCourse.name,
        tempDesc || selectedCourse.description,
        tempCpmk.length > 0 ? tempCpmk : selectedCourse.cpmk || [],
        selectedCourse.credits || 3,
        handleAiProgress
      )
      setTempWeekly(list || [])
      toast.success("Outline 16 pertemuan berhasil disusun AI! 📅")
    } catch (err) {
      toast.error("Gagal generate silabus: " + err.message)
    } finally {
      setAiGeneratingWeekly(false)
      setAiProgressText('')
    }
  }

  function handleUpdateCplItem(index, value) {
    setTempCpl(prev => {
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }

  function handleAddCplItem() {
    setTempCpl(prev => [...prev, 'Mampu merancang dan mengimplementasikan...'])
  }

  function handleRemoveCplItem(index) {
    setTempCpl(prev => prev.filter((_, idx) => idx !== index))
  }

  function handleUpdateCpmkItem(index, key, value) {
    setTempCpmk(prev => {
      const updated = [...prev]
      if (key === 'cpl_ref') {
        const refs = value.split(',').map(s => s.trim()).filter(Boolean)
        updated[index] = { ...updated[index], cpl_ref: refs }
      } else {
        updated[index] = { ...updated[index], [key]: value }
      }
      return updated
    })
  }

  function handleAddCpmkItem() {
    setTempCpmk(prev => [
      ...prev,
      {
        kode: `CPMK-${prev.length + 1}`,
        deskripsi: 'Mahasiswa mampu...',
        cpl_ref: []
      }
    ])
  }

  function handleRemoveCpmkItem(index) {
    setTempCpmk(prev => {
      const filtered = prev.filter((_, idx) => idx !== index)
      return filtered.map((item, idx) => ({
        ...item,
        kode: `CPMK-${idx + 1}`
      }))
    })
  }

  function handleUpdateRefItem(index, value) {
    setTempRefs(prev => {
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }

  function handleAddRefItem() {
    setTempRefs(prev => [...prev, 'Nama Penulis. (Tahun). Judul Buku. Penerbit.'])
  }

  function handleRemoveRefItem(index) {
    setTempRefs(prev => prev.filter((_, idx) => idx !== index))
  }

  function handleUpdateWeeklyItem(index, key, value) {
    setTempWeekly(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [key]: value }
      return updated
    })
  }

  function handleAddWeeklyItem() {
    setTempWeekly(prev => {
      const nextNo = prev.length + 1
      const isUts = nextNo === 8
      const isUas = nextNo === 16
      let bahanKajian = ''
      let kemampuanAkhir = ''
      if (isUts) {
        bahanKajian = 'Ujian Tengah Semester (UTS)'
        kemampuanAkhir = 'Melakukan evaluasi tengah semester untuk mengukur pemahaman mahasiswa terhadap materi pertemuan 1-7'
      } else if (isUas) {
        bahanKajian = 'Ujian Akhir Semester (UAS)'
        kemampuanAkhir = 'Melakukan evaluasi akhir semester untuk mengukur pemahaman mahasiswa terhadap materi pertemuan 9-15'
      }
      return [
        ...prev,
        {
          no: nextNo,
          bahan_kajian: bahanKajian,
          kemampuan_akhir: kemampuanAkhir,
          waktu: 170,
          bobot: isUts || isUas ? 15 : 5,
          is_uts: isUts,
          is_uas: isUas
        }
      ]
    })
  }

  function handleRemoveWeeklyItem(index) {
    setTempWeekly(prev => {
      const filtered = prev.filter((_, idx) => idx !== index)
      return filtered.map((item, idx) => {
        const newNo = idx + 1
        const isUts = newNo === 8
        const isUas = newNo === 16
        return {
          ...item,
          no: newNo,
          bahan_kajian: item.bahan_kajian,
          kemampuan_akhir: item.kemampuan_akhir,
          waktu: item.waktu,
          bobot: item.bobot,
          is_uts: isUts,
          is_uas: isUas
        }
      })
    })
  }

  async function handleSaveWeeklyDraft() {
    if (!selectedCourse) return
    const loader = toast.loading("Menyimpan draf silabus...")
    try {
      const { error } = await supabase
        .from('courses')
        .update({ weekly_plan: tempWeekly })
        .eq('id', selectedCourse.id)

      if (error) {
        if (error.message?.includes('column')) {
          throw new Error('Kolom database "weekly_plan" belum tersedia. Harap jalankan script migrasi supabase_migration_rps.sql di Supabase SQL Editor.')
        }
        throw error
      }
      toast.success("Draf silabus berhasil disimpan!", { id: loader })
      fetchCourses(selectedCourse.id)
    } catch (err) {
      toast.error("Gagal menyimpan draf silabus: " + err.message, { id: loader })
    }
  }

  async function handleApplyWeekly() {
    if (tempWeekly.length === 0) return
    const ok = await showConfirm({
      title: 'Terapkan Rencana Pembelajaran?',
      message: 'Ini akan menghapus semua materi/pertemuan yang ada saat ini untuk kelas ini dan menggantinya dengan pertemuan baru dari rancangan silabus Anda. Lanjutkan?',
      confirmLabel: 'Ya, Ganti',
      variant: 'danger'
    })
    if (!ok) return

    const rows = tempWeekly.map(w => ({
      course_id: selectedCourse.id,
      title: w.bahan_kajian || `Materi Pertemuan ${w.no}`,
      description: w.kemampuan_akhir || `Kemampuan akhir pertemuan ${w.no}`,
      week_number: w.no,
      uploaded_by: user.id
    }))

    const loader = toast.loading("Menerapkan rencana pembelajaran ke silabus...")
    try {
      const { error: delErr } = await supabase.from('materials').delete().eq('course_id', selectedCourse.id)
      if (delErr) throw delErr

      const { error: insErr } = await supabase.from('materials').insert(rows)
      if (insErr) throw insErr

      // Auto-save the weekly plan draft to database as well
      await supabase.from('courses').update({ weekly_plan: tempWeekly }).eq('id', selectedCourse.id)

      toast.success("Silabus pertemuan berhasil diterapkan! 🚀", { id: loader })
      fetchCourses(selectedCourse.id)
      setActiveTab('curriculum')
      fetchMaterials(selectedCourse.id)
    } catch (err) {
      toast.error("Gagal menerapkan silabus: " + err.message, { id: loader })
    }
  }

  async function handleAiGenerateRefs() {
    setAiGeneratingRefs(true)
    setAiProgressText("Mencari referensi buku teks & jurnal ilmiah mutakhir...")
    try {
      const refs = await generateReferences(
        selectedCourse.name,
        tempCpmk.length > 0 ? tempCpmk : selectedCourse.cpmk || [],
        handleAiProgress
      )
      setTempRefs(refs || [])
      toast.success("Rekomendasi pustaka berhasil dirumuskan AI! 📚")
    } catch (err) {
      toast.error("Gagal generate referensi: " + err.message)
    } finally {
      setAiGeneratingRefs(false)
      setAiProgressText('')
    }
  }

  async function handleSaveRefs() {
    const { error } = await supabase
      .from('courses')
      .update({ referensi: tempRefs })
      .eq('id', selectedCourse.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Kolom database belum tersedia. Harap jalankan script migrasi supabase_migration_rps.sql di Supabase SQL Editor.', { duration: 6000 })
      } else {
        toast.error("Gagal menyimpan referensi: " + error.message)
      }
    } else {
      toast.success("Referensi pustaka berhasil disimpan!")
      fetchCourses(selectedCourse.id)
    }
  }

  // ── AI Slide Generator Actions ──────────────────────────────
  function openSlideGenerator(m) {
    setActiveMeeting(m)
    setSlideOutline(m.slide_content || null)
    setWebslideData(m.webslide_content || null)
    setEssayData(null)
    setAiSlideProgressText('')
    setSlideModal(true)
  }

  async function handleGenerateSlideOutline() {
    setLoadingSlide(true)
    setAiSlideProgressText("Menghubungi Gateway API Server...")

    let subTimer = null
    const steps = [
      "Menganalisis Kemampuan Akhir & Bahan Kajian...",
      "Mengintegrasikan Referensi Pustaka RPS...",
      "Merancang Outline & Struktur Presentasi (Minimal 15 Slide)...",
      "Mengembangkan Contoh Kasus & Penerapan Industri...",
      "Menyusun Perbandingan Konsep & Penjelasan Detail...",
      "Mempersiapkan Output Draft Slide..."
    ]
    let currentStep = 0

    const handleProgress = (event) => {
      if (typeof event === 'string') {
        if (event === "AI sedang memikirkan materi & merumuskan konten (proses ini memakan waktu)...") {
          setAiSlideProgressText(steps[0])
          subTimer = setInterval(() => {
            currentStep++
            if (currentStep < steps.length) {
              setAiSlideProgressText(steps[currentStep])
            } else {
              setAiSlideProgressText("AI sedang merampungkan konten... Mohon tunggu sebentar lagi...")
            }
          }, 2500)
        } else {
          if (subTimer) clearInterval(subTimer)
          setAiSlideProgressText(event)
        }
      } else if (event && event.type === 'chunk') {
        if (subTimer) clearInterval(subTimer)
        const slideMatches = event.text.match(/"slide_no"\s*:\s*(\d+)/g)
        let currentSlide = 1
        if (slideMatches && slideMatches.length > 0) {
          const lastMatch = slideMatches[slideMatches.length - 1]
          const numMatch = lastMatch.match(/\d+/)
          if (numMatch) currentSlide = parseInt(numMatch[0])
        }
        setAiSlideProgressText(`AI sedang menyusun Slide ${currentSlide}... (${event.text.length.toLocaleString('id-ID')} karakter)`)
      }
    }

    try {
      const result = await generateSlideContent(
        selectedCourse.name,
        activeMeeting.week_number,
        activeMeeting.title,
        activeMeeting.description,
        selectedCourse.referensi || [],
        handleProgress
      )
      setSlideOutline(result)
      toast.success("Outline slide berhasil disusun AI! 🤖")
    } catch (err) {
      toast.error("Gagal generate outline slide: " + err.message)
    } finally {
      if (subTimer) clearInterval(subTimer)
      setLoadingSlide(false)
      setAiSlideProgressText('')
    }
  }

  async function handleGenerateEssayQuestions() {
    setLoadingSlide(true)
    setAiSlideProgressText("Menghubungi Gateway API Server...")

    let subTimer = null
    const steps = [
      "Menganalisis Kemampuan Akhir & Topik Evaluasi...",
      "Merancang Soal Essay berbasis HOTS (Higher Order Thinking Skills)...",
      "Menyusun Rubrik Penilaian & Kriteria Koreksi...",
      "Menyeimbangkan Bobot Nilai Soal (Total 100%)...",
      "Mempersiapkan Output Draft Soal..."
    ]
    let currentStep = 0

    const handleProgress = (event) => {
      if (typeof event === 'string') {
        if (event === "AI sedang memikirkan materi & merumuskan konten (proses ini memakan waktu)...") {
          setAiSlideProgressText(steps[0])
          subTimer = setInterval(() => {
            currentStep++
            if (currentStep < steps.length) {
              setAiSlideProgressText(steps[currentStep])
            } else {
              setAiSlideProgressText("AI sedang merumuskan soal...")
            }
          }, 2500)
        } else {
          if (subTimer) clearInterval(subTimer)
          setAiSlideProgressText(event)
        }
      } else if (event && event.type === 'chunk') {
        if (subTimer) clearInterval(subTimer)
        const matches = event.text.match(/"no"\s*:\s*(\d+)/g)
        let currentQuestion = 1
        if (matches && matches.length > 0) {
          const lastMatch = matches[matches.length - 1]
          const numMatch = lastMatch.match(/\d+/)
          if (numMatch) currentQuestion = parseInt(numMatch[0])
        }
        setAiSlideProgressText(`AI sedang merumuskan Soal Essay ${currentQuestion}... (${event.text.length.toLocaleString('id-ID')} karakter)`)
      }
    }

    try {
      const examType = activeMeeting.week_number === 8 ? 'UTS' : 'UAS'
      const result = await generateEssayQuestions(
        selectedCourse.name,
        examType,
        activeMeeting.title,
        activeMeeting.description,
        handleProgress
      )
      setEssayData(result)
      toast.success("Soal Ujian Essay berhasil disusun AI! 📝")
    } catch (err) {
      toast.error("Gagal generate soal: " + err.message)
    } finally {
      if (subTimer) clearInterval(subTimer)
      setLoadingSlide(false)
      setAiSlideProgressText('')
    }
  }

  async function handleGenerateWebSlide() {
    if (!slideOutline) return
    setGeneratingWebSlide(true)
    setAiSlideProgressText("Menganalisis materi slide & merancang tata letak (layout) interaktif...")
    try {
      const prodiName = profile?.program_studi || 'Teknik Informatika'
      const result = await generateWebSlideData(
        selectedCourse.name,
        prodiName,
        activeMeeting.week_number,
        slideOutline,
        handleAiSlideProgress
      )
      setWebslideData(result)
      toast.success("Tampilan WebSlide berhasil digenerate! 🎬")
    } catch (err) {
      toast.error("Gagal generate WebSlide: " + err.message)
    } finally {
      setGeneratingWebSlide(false)
      setAiSlideProgressText('')
    }
  }

  async function handleSaveAiSlideContent() {
    setSavingSlide(true)
    const { error } = await supabase
      .from('materials')
      .update({
        slide_content: slideOutline,
        webslide_content: webslideData
      })
      .eq('id', activeMeeting.id)

    if (error) {
      if (error.message?.includes('column')) {
        toast.error('⚠️ Kolom database belum tersedia. Harap jalankan script migrasi supabase_migration_rps.sql di Supabase SQL Editor.', { duration: 6000 })
      } else {
        toast.error('Gagal menyimpan ke database: ' + error.message)
      }
    } else {
      toast.success('Rancangan Slide berhasil disimpan ke Silabus!')
      setSlideModal(false)
      fetchMaterials(selectedCourseId)
    }
    setSavingSlide(false)
  }

  function handlePreviewWebSlide() {
    if (!webslideData) return
    const prodiName = profile?.program_studi || 'Teknik Informatika'
    const htmlContent = generateWebSlideHtml(selectedCourse.name, prodiName, activeMeeting.week_number, webslideData)
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
  }

  function handleDownloadWebSlide() {
    if (!webslideData) return
    const prodiName = profile?.program_studi || 'Teknik Informatika'
    const htmlContent = generateWebSlideHtml(selectedCourse.name, prodiName, activeMeeting.week_number, webslideData)
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    
    const cleanCourseName = selectedCourse.name.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `WebSlide_Pertemuan_${activeMeeting.week_number}_${cleanCourseName}.html`
    
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    }, 100)
    
    toast.success('WebSlide HTML berhasil diunduh!')
  }

  function handleCopySlideOutline() {
    if (!slideOutline) return
    let text = `=== ${slideOutline.title} ===\n\n`
    slideOutline.slides?.forEach(slide => {
      text += `Slide ${slide.slide_no}: ${slide.title}\n`
      slide.content?.forEach(poin => {
        text += `- ${poin}\n`
      })
      text += `\n`
    })
    navigator.clipboard.writeText(text)
    toast.success('Outline slide berhasil disalin ke clipboard!')
  }

  function handleCopyEssayQuestions() {
    if (!essayData) return
    let text = `=== ${essayData.title} ===\n\n`
    essayData.questions?.forEach(q => {
      text += `Soal ${q.no} (Bobot: ${q.max_score}%)\n`
      text += `Pertanyaan:\n${q.question}\n`
      text += `Rubrik/Kriteria Penilaian:\n${q.rubric}\n\n`
    })
    navigator.clipboard.writeText(text)
    toast.success('Soal essay & rubrik berhasil disalin ke clipboard!')
  }

  // ── Logic Data Grouping ──────────────────────────────────────
  const filteredCourses = courses.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group materials by week
  const materialsByWeek = materials.reduce((acc, m) => {
    const w = m.week_number || 0
    if (!acc[w]) acc[w] = []
    acc[w].push(m)
    return acc
  }, {})

  const pageTitle = isAdmin ? 'Semua Kursus & Silabus' : 'Manajemen Kursus & Silabus (SPA)'

  return (
    <>
    {confirmDialog}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      
      {/* Page Header */}
      <div>
        <h1 className="page-title">{pageTitle}</h1>
        <p className="page-subtitle">Kelola kelas kursus, rancangan silabus modul, dan material ajar secara interaktif dalam satu layar terpadu.</p>
      </div>

      {loadingCourses ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="spa-wrapper" style={{
          display: 'flex',
          gap: 24,
          alignItems: 'stretch',
          minHeight: 'calc(100vh - 200px)',
          flexWrap: 'wrap'
        }}>
          
          {/* ── LEFT PANEL: Courses Sidebar ── */}
          <div className="courses-sidebar-pane" style={{
            width: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderRight: '1px solid var(--gray-200)',
            paddingRight: 20,
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Kursus Saya ({filteredCourses.length})
              </span>
              <button className="btn btn-primary btn-sm" onClick={openNewCourse} style={{ padding: '4px 10px', fontSize: 11, gap: 4 }}>
                <Plus size={12}/> Tambah Kursus
              </button>
            </div>

            {/* Search filter */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input
                className="input"
                placeholder="Cari kode atau nama..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 30, fontSize: 12, height: 34 }}
              />
            </div>

            {/* Courses List scroll area */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 270px)',
              paddingRight: 4
            }}>
              {filteredCourses.length === 0 ? (
                <div className="card" style={{ padding: '24px 12px', textAlign: 'center', border: '1px dashed var(--gray-200)' }}>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Kursus tidak ditemukan</span>
                </div>
              ) : (
                filteredCourses.map((c, i) => {
                  const isSelected = selectedCourseId === c.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCourse(c.id)}
                      style={{
                        display: 'flex',
                        background: isSelected ? '#f5f6ff' : 'var(--surface)',
                        border: isSelected ? '1px solid var(--indigo-500)' : '1px solid var(--gray-200)',
                        boxShadow: isSelected ? '0 4px 12px rgba(79, 70, 229, 0.06)' : '0 2px 4px rgba(0,0,0,0.01)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        flexShrink: 0
                      }}
                      onMouseEnter={e => { if(!isSelected) e.currentTarget.style.borderColor = 'var(--gray-300)' }}
                      onMouseLeave={e => { if(!isSelected) e.currentTarget.style.borderColor = 'var(--gray-200)' }}
                    >
                      <div style={{ width: 5, background: c.cover_color || COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{c.code}</span>
                          <span className="badge-pill badge-slate" style={{ fontSize: 9, padding: '2px 6px' }}>{c.credits} SKS</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? 'var(--indigo-950)' : 'var(--gray-800)', lineHeight: 1.3 }}>
                          {c.name}
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users size={11}/> {c.enrollments?.[0]?.count || 0} mhs
                          </span>
                          
                          <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                            <button className="btn btn-ghost btn-icon btn-xs" style={{ padding: 4 }} onClick={() => openEditCourse(c)} title="Edit"><Edit2 size={12}/></button>
                            {isAdmin && (
                              <button className="btn btn-ghost btn-icon btn-xs" style={{ padding: 4, color: 'var(--indigo-600)' }} onClick={() => openCopy(c)} title="Salin"><Copy size={12}/></button>
                            )}
                            <button className="btn btn-ghost btn-icon btn-xs" style={{ padding: 4, color: 'var(--danger)' }} onClick={() => handleDeleteCourse(c.id)} title="Hapus"><Trash2 size={12}/></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Active Course Workspace & Materials ── */}
          <div className="course-workspace-pane" style={{
            flex: 1,
            minWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
              {selectedCourse ? (
                <>
                 {/* Course Header Info */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 4px 12px 4px' }}>
                   <div>
                     <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                       PENGELOLAAN KURSUS
                     </span>
                     <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-900)', margin: '2px 0 0 0' }}>
                       {selectedCourse.name} ({selectedCourse.code})
                     </h2>
                   </div>
                 </div>

                 {/* SPA Tabs */}
                 <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--gray-200)', margin: '0 4px 8px 4px' }}>
                  <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'overview' ? '3px solid var(--indigo-600)' : '3px solid transparent',
                      color: activeTab === 'overview' ? 'var(--indigo-700)' : 'var(--gray-500)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    📂 Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('curriculum')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'curriculum' ? '3px solid var(--indigo-600)' : '3px solid transparent',
                      color: activeTab === 'curriculum' ? 'var(--indigo-700)' : 'var(--gray-500)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    📖 Curriculum
                  </button>
                  <button
                    onClick={() => setActiveTab('ai_assistant')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'ai_assistant' ? '3px solid var(--indigo-600)' : '3px solid transparent',
                      color: activeTab === 'ai_assistant' ? 'var(--indigo-700)' : 'var(--gray-500)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Sparkles size={14} color="var(--indigo-600)"/> AI RPS & Slide Generator
                  </button>
                  <button
                    onClick={() => setActiveTab('enrollments')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'enrollments' ? '3px solid var(--indigo-600)' : '3px solid transparent',
                      color: activeTab === 'enrollments' ? 'var(--indigo-700)' : 'var(--gray-500)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    👥 Persetujuan
                  </button>
                </div>


                {/* ── TAB 0: OVERVIEW ── */}
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {/* Left Column (Main Content) */}
                    <div style={{ flex: '2 1 500px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                      
                      {/* Deskripsi Kursus */}
                      <div className="card" style={{ padding: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>Deskripsi Kursus</h3>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--gray-600)', whiteSpace: 'pre-wrap', margin: 0 }}>
                          {selectedCourse.description || 'Deskripsi belum dirumuskan untuk kursus ini. Silakan gunakan tab "AI RPS & Slide Generator" untuk merancang konten dengan asisten AI.'}
                        </p>
                      </div>

                      {/* Here's what you will learn */}
                      <div className="card" style={{ padding: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 16 }}>Here's what you will learn.</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {materials.length === 0 ? (
                            <div style={{ padding: '20px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Rencana silabus modul belum diterapkan. Gunakan generator AI di tab sebelah untuk membuat rencana 16 pertemuan secara instan.</span>
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
                          { label: `${selectedCourse.credits * 16} JAM`, sub: 'Durasi Total', icon: <Clock size={16} color="var(--indigo-600)"/> },
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
                          Lencana Kelulusan {selectedCourse.code}
                        </div>
                        <p style={{ fontSize: 9, color: 'var(--gray-400)', margin: 0 }}>
                          Dapatkan sertifikat resmi dari SYSTRACT Academy setelah menyelesaikan ujian akhir modul ini.
                        </p>
                      </div>

                      {/* Skills You Will Learn (Maps CPMK & CPL) */}
                      <div className="card" style={{ padding: 15, background: '#f8fafc' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Skills You Will Learn</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {selectedCourse.cpmk && selectedCourse.cpmk.length > 0 ? (
                            selectedCourse.cpmk.map((c, idx) => (
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
                )}

                {/* ── TAB 1: CURRICULUM (SILABUS & MATERI) ── */}
                {activeTab === 'curriculum' && (
                  <>

                    {/* Syllabus Area Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--gray-100)', paddingBottom: 10, marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BookMarked size={16} color="var(--indigo-600)"/>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', margin: 0 }}>Silabus & Dokumen Materi</h3>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={openNewMaterial} style={{ gap: 6, fontSize: 12 }}>
                        <Plus size={13}/> Tambah Materi
                      </button>
                    </div>

                    {/* Materials List */}
                    {loadingMaterials ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 8 }}>
                        <Loader2 size={24} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--indigo-600)' }} />
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Memuat materi silabus...</span>
                      </div>
                    ) : materials.length === 0 ? (
                      <div className="empty-state card" style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--surface)', border: '2px dashed var(--gray-200)' }}>
                        <BookMarked size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
                        <p className="empty-state-text" style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-600)', margin: 0 }}>Belum Ada Materi</p>
                        <p className="empty-state-sub" style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4, marginBottom: 16 }}>Gunakan fitur AI RPS Assistant atau klik tombol di bawah untuk menambah materi silabus.</p>
                        <button className="btn btn-primary btn-sm" onClick={openNewMaterial}><Plus size={13}/> Tambah Materi</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(100vh - 360px)', paddingRight: 4 }}>
                        {groupMaterialsIntoModules(materials).map((mod) => {
                          const isExpanded = !!expandedModules[mod.id]
                          return (
                            <div key={mod.id} className="card" style={{ flexShrink: 0, padding: 0, overflow: 'hidden', border: '1px solid var(--gray-200)', borderRadius: 10 }}>
                              
                              {/* Module Header Toggle */}
                              <div 
                                onClick={() => setExpandedModules(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                                style={{ 
                                  background: 'var(--gray-50)', 
                                  padding: '12px 18px', 
                                  borderBottom: isExpanded ? '1px solid var(--gray-200)' : 'none', 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  cursor: 'pointer',
                                  userSelect: 'none'
                                }}
                              >
                                <span style={{ fontWeight: 750, fontSize: 13, color: 'var(--indigo-700)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{
                                    width: 20, 
                                    height: 20, 
                                    borderRadius: '50%', 
                                    background: '#dcfce7', 
                                    color: '#15803d', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    border: '1px solid #bbf7d0',
                                    fontSize: 10,
                                    fontWeight: 800
                                  }}>
                                    ✓
                                  </div>
                                  {mod.name}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span className="badge-pill badge-slate" style={{ fontSize: 10, padding: '2px 8px' }}>
                                    {mod.items.length} Materi
                                  </span>
                                  {isExpanded ? <ChevronUp size={16} color="var(--gray-400)"/> : <ChevronDown size={16} color="var(--gray-400)"/>}
                                </div>
                              </div>
                              
                              {/* Module Items (Collapsable) */}
                              {isExpanded && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  {mod.items.sort((a,b) => (a.week_number || 0) - (b.week_number || 0)).map((m, idx) => {
                                    const links = (m.attachments && m.attachments.length)
                                      ? m.attachments
                                      : m.webview_link ? [{ mime: m.mime_type, url: m.webview_link, label: '' }]
                                      : []
                                      
                                    const isExam = m.week_number === 8 || m.week_number === 16

                                    return (
                                      <div key={m.id} style={{
                                        padding: '14px 18px',
                                        borderTop: idx > 0 ? '1px solid var(--gray-100)' : 'none',
                                        transition: 'background 0.2s',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 16
                                      }}>
                                        <div style={{
                                          fontSize: 11, 
                                          fontWeight: 800, 
                                          color: 'var(--gray-400)', 
                                          marginTop: 2, 
                                          width: 32, 
                                          textAlign: 'right', 
                                          flexShrink: 0 
                                        }}>
                                          {m.week_number === 0 ? 'P' : `${m.week_number}.0`}
                                        </div>
                                        
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-900)' }}>{m.title}</div>
                                          {m.description && (
                                            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.4 }}>
                                              {m.description}
                                            </div>
                                          )}
                                          
                                          {/* AI slide availability */}
                                          {(m.slide_content || m.webslide_content) && (
                                            <div style={{ marginTop: 8, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--indigo-700)', fontWeight: 600 }}>
                                              <Sparkles size={11} color="var(--indigo-600)" /> 
                                              Slide AI Tersedia!
                                              {m.webslide_content && <span style={{ color: '#10b981' }}>(WebSlide Aktif)</span>}
                                            </div>
                                          )}

                                          {/* Attachment chips */}
                                          {links.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                              {links.map((a, ai) => {
                                                const t = typeOf(a.mime)
                                                return (
                                                  <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer"
                                                    style={{
                                                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                                      borderRadius: 20, fontSize: 11, fontWeight: 600, textDecoration: 'none',
                                                      color: t.color, background: t.bg, border: `1px solid ${t.color}25`,
                                                      cursor: 'pointer', transition: 'all 0.15s',
                                                    }}
                                                  >
                                                    <span style={{ fontSize: 12 }}>{t.icon}</span>
                                                    {a.label || t.label}
                                                    <ExternalLink size={10} style={{ opacity: 0.7 }}/>
                                                  </a>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Slide Generator Actions */}
                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                                          <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => openSlideGenerator(m)}
                                            style={{
                                              gap: 4,
                                              fontSize: 11,
                                              padding: '4px 8px',
                                              borderColor: 'var(--indigo-300)',
                                              background: '#f8f8ff',
                                              color: 'var(--indigo-700)'
                                            }}
                                          >
                                            <Sparkles size={12} color="var(--indigo-600)" />
                                            {isExam ? 'Soal AI' : 'Slide AI'}
                                          </button>
                                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditMaterial(m)} title="Edit"><Edit2 size={13}/></button>
                                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteMaterial(m.id)} title="Hapus"><Trash2 size={13}/></button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB 2: AI RPS & SLIDE ASSISTANT ── */}
                {activeTab === 'ai_assistant' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {aiProgressText && (
                      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#eef2ff', borderColor: '#c7d2fe', color: 'var(--indigo-700)', padding: 14 }}>
                        <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{aiProgressText}</span>
                      </div>
                    )}

                    {/* Stepper Header Navigation */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: 10, 
                      background: '#f8fafc', 
                      border: '1px solid var(--gray-200)', 
                      borderRadius: 12, 
                      padding: '16px 20px',
                      flexWrap: 'wrap',
                      gap: 12
                    }}>
                      {[
                        { step: 1, title: 'Deskripsi', desc: 'Detail Pengantar', isDone: !!tempDesc },
                        { step: 2, title: 'CPMK & CPL', desc: 'Target Kompetensi', isDone: tempCpmk.length > 0 },
                        { step: 3, title: 'Referensi', desc: 'Daftar Pustaka', isDone: tempRefs.length > 0 },
                        { step: 4, title: 'Silabus Ajar', desc: '16 Modul Pertemuan', isDone: tempWeekly.length > 0 }
                      ].map((s) => {
                        const isActive = aiActiveStep === s.step;
                        const isDone = s.isDone;
                        return (
                          <div 
                            key={s.step} 
                            onClick={() => setAiActiveStep(s.step)}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 10, 
                              cursor: 'pointer',
                              flex: '1 1 140px',
                              justifyContent: 'center',
                              position: 'relative'
                            }}
                          >
                            <div style={{ 
                              width: 28, 
                              height: 28, 
                              borderRadius: '50%', 
                              background: isActive ? 'var(--indigo-600)' : isDone ? '#dcfce7' : 'var(--gray-200)',
                              color: isActive ? '#fff' : isDone ? '#15803d' : 'var(--gray-500)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 12,
                              border: isActive ? '3px solid #c7d2fe' : 'none',
                              flexShrink: 0
                            }}>
                              {isDone && !isActive ? '✓' : s.step}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? 'var(--indigo-900)' : 'var(--gray-600)' }}>{s.title}</span>
                              <span style={{ fontSize: 9, color: 'var(--gray-400)', fontWeight: 500 }}>{s.desc}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Step 1: Deskripsi Kursus */}
                    {aiActiveStep === 1 && (
                      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 1: Deskripsi Kursus</span>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ gap: 4 }}
                            onClick={() => {
                              setTopicsInput('')
                              setTopicsModal(true)
                            }}
                            disabled={aiGeneratingDesc}
                          >
                            <Sparkles size={13} color="var(--indigo-600)"/> Generate AI
                          </button>
                        </div>
                        <textarea
                          className="input"
                          rows={6}
                          style={{ fontSize: 13, lineHeight: 1.5 }}
                          placeholder="Deskripsi kursus akan dihasilkan di sini oleh AI..."
                          value={tempDesc}
                          onChange={e => setTempDesc(e.target.value)}
                        />
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <div>
                            {tempDesc !== selectedCourse.description && tempDesc.trim() !== '' && (
                              <button className="btn btn-primary btn-sm" onClick={handleSaveDesc}>
                                Simpan Deskripsi
                              </button>
                            )}
                          </div>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => setAiActiveStep(2)}
                            disabled={!tempDesc}
                          >
                            Lanjut ke CPMK & CPL &rarr;
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: CPL & CPMK */}
                    {aiActiveStep === 2 && (
                      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 2: Keterampilan & Capaian (CPL & CPMK)</span>
                          <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleAiGenerateCplCpmk} disabled={aiGeneratingCplCpmk || !tempDesc}>
                            <Sparkles size={13} color="var(--indigo-600)"/> Generate CPL & CPMK
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {/* CPL Section */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>CPL yang Didukung (Bisa Diedit):</span>
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm" 
                                onClick={handleAddCplItem}
                                style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                              >
                                <Plus size={12} /> Tambah CPL
                              </button>
                            </div>
                            
                            {tempCpl.length === 0 ? (
                              <div style={{ padding: '15px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data CPL. Klik "Generate CPL & CPMK" atau "+ Tambah CPL".</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                                {tempCpl.map((c, idx) => (
                                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#ffffff', border: '1px solid var(--gray-200)', padding: 6, borderRadius: 6 }}>
                                    <span className="badge-pill badge-green" style={{ height: 24, fontSize: 10 }}>CPL-{idx+1}</span>
                                    <input 
                                      type="text" 
                                      className="input" 
                                      style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                                      value={c} 
                                      onChange={e => handleUpdateCplItem(idx, e.target.value)} 
                                      placeholder="Deskripsi Capaian Pembelajaran Lulusan..."
                                    />
                                    <button 
                                      type="button" 
                                      className="btn btn-ghost btn-icon btn-sm" 
                                      style={{ color: 'var(--danger)', height: 24, width: 24 }}
                                      onClick={() => handleRemoveCplItem(idx)}
                                      title="Hapus CPL"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* CPMK Section */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>Rancangan CPMK (Bisa Diedit):</span>
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm" 
                                onClick={handleAddCpmkItem}
                                style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                              >
                                <Plus size={12} /> Tambah CPMK
                              </button>
                            </div>
                            
                            {tempCpmk.length === 0 ? (
                              <div style={{ padding: '15px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data CPMK. Klik "Generate CPL & CPMK" atau "+ Tambah CPMK".</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                                {tempCpmk.map((c, idx) => (
                                  <div 
                                    key={idx} 
                                    style={{ 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: 6, 
                                      background: '#ffffff', 
                                      border: '1px solid var(--gray-200)', 
                                      padding: 10, 
                                      borderRadius: 8 
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <input 
                                        type="text" 
                                        className="input" 
                                        style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', width: 100, height: 28 }}
                                        value={c.kode || `CPMK-${idx+1}`} 
                                        onChange={e => handleUpdateCpmkItem(idx, 'kode', e.target.value)} 
                                        placeholder="Kode CPMK"
                                      />
                                      <button 
                                        type="button" 
                                        className="btn btn-ghost btn-icon btn-sm" 
                                        style={{ color: 'var(--danger)', height: 24, width: 24 }}
                                        onClick={() => handleRemoveCpmkItem(idx)}
                                        title="Hapus CPMK"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                    
                                    <div>
                                      <textarea 
                                        className="input" 
                                        rows={2}
                                        style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1.4, resize: 'vertical' }}
                                        value={c.deskripsi || ''} 
                                        onChange={e => handleUpdateCpmkItem(idx, 'deskripsi', e.target.value)} 
                                        placeholder="Deskripsi Capaian Pembelajaran Mata Kuliah..."
                                      />
                                    </div>
                                    
                                    <div>
                                      <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>
                                        Referensi CPL (koma dipisah, contoh: CPL-1, CPL-2)
                                      </label>
                                      <input 
                                        type="text" 
                                        className="input" 
                                        style={{ fontSize: 11, padding: '4px 8px', height: 24 }}
                                        value={c.cpl_ref ? c.cpl_ref.join(', ') : ''} 
                                        onChange={e => handleUpdateCpmkItem(idx, 'cpl_ref', e.target.value)} 
                                        placeholder="Contoh: CPL-1, CPL-2"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(1)}>
                            &larr; Kembali
                          </button>
                          
                          <div style={{ display: 'flex', gap: 8 }}>
                            {(tempCpl.length > 0 || tempCpmk.length > 0) && (
                              <button className="btn btn-primary btn-sm" onClick={handleSaveCplCpmk}>
                                Simpan ke Kursus
                              </button>
                            )}
                            <button 
                              className="btn btn-secondary btn-sm" 
                              onClick={() => setAiActiveStep(3)}
                              disabled={tempCpmk.length === 0}
                            >
                              Lanjut ke Referensi &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Referensi Pustaka */}
                    {aiActiveStep === 3 && (
                      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 3: Referensi Pustaka</span>
                          <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleAiGenerateRefs} disabled={aiGeneratingRefs || tempCpmk.length === 0}>
                            <Sparkles size={13} color="var(--indigo-600)"/> Generate Pustaka
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>Daftar Pustaka (Bisa Diedit):</span>
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-sm" 
                              onClick={handleAddRefItem}
                              style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                            >
                              <Plus size={12} /> Tambah Referensi
                            </button>
                          </div>
                          
                          {tempRefs.length === 0 ? (
                            <div style={{ padding: '15px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada data referensi. Klik "Generate Pustaka" atau "+ Tambah Referensi".</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                              {tempRefs.map((r, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fde68a', padding: 8, borderRadius: 6 }}>
                                  <span style={{ fontSize: 14, marginTop: 4 }}>📚</span>
                                  <textarea 
                                    className="input" 
                                    rows={2}
                                    style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1.4, resize: 'vertical', flex: 1, background: '#ffffff' }}
                                    value={r} 
                                    onChange={e => handleUpdateRefItem(idx, e.target.value)} 
                                    placeholder="Format APA Style, contoh: Duckett, J. (2023). HTML and CSS..."
                                  />
                                  <button 
                                    type="button" 
                                    className="btn btn-ghost btn-icon btn-sm" 
                                    style={{ color: 'var(--danger)', height: 28, width: 28 }}
                                    onClick={() => handleRemoveRefItem(idx)}
                                    title="Hapus Referensi"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(2)}>
                            &larr; Kembali
                          </button>
                          
                          <div style={{ display: 'flex', gap: 8 }}>
                            {tempRefs.length > 0 && (
                              <button className="btn btn-primary btn-sm" onClick={handleSaveRefs}>
                                Simpan Referensi
                              </button>
                            )}
                            <button 
                              className="btn btn-secondary btn-sm" 
                              onClick={() => setAiActiveStep(4)}
                              disabled={tempRefs.length === 0}
                            >
                              Lanjut ke Silabus &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 4: 16 Pertemuan Silabus */}
                    {aiActiveStep === 4 && (
                      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Langkah 4: Struktur Silabus (16 Pertemuan)</span>
                          <button className="btn btn-secondary btn-sm" style={{ gap: 4 }} onClick={handleAiGenerateWeekly} disabled={aiGeneratingWeekly || tempCpmk.length === 0}>
                            <Sparkles size={13} color="var(--indigo-600)"/> Generate 16 Pertemuan
                          </button>
                        </div>

                        {tempWeekly.length === 0 && (
                          <div style={{ padding: '30px 0', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--gray-200)', borderRadius: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Belum ada rancangan silabus 16 pertemuan. Klik "Generate 16 Pertemuan" untuk merumuskan draf silabus atau klik tombol "+ Tambah Pertemuan" di bawah.</span>
                            <div style={{ marginTop: 12 }}>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddWeeklyItem} style={{ gap: 4 }}>
                                <Plus size={13} /> Tambah Pertemuan Pertama
                              </button>
                            </div>
                          </div>
                        )}

                        {tempWeekly.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)' }}>Rancangan Silabus Pertemuan (Bisa Diedit):</span>
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm" 
                                onClick={handleAddWeeklyItem}
                                style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                              >
                                <Plus size={12} /> Tambah Pertemuan
                              </button>
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: 12, 
                              marginTop: 4, 
                              maxHeight: 400, 
                              overflowY: 'auto', 
                              border: '1px solid var(--gray-200)', 
                              borderRadius: 8, 
                              padding: 12,
                              background: 'var(--gray-50)'
                            }}>
                              {tempWeekly.map((w, idx) => (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: 8, 
                                    background: w.is_uts || w.is_uas ? '#fff5f5' : '#ffffff', 
                                    border: w.is_uts || w.is_uas ? '1px solid #feb2b2' : '1px solid var(--gray-200)',
                                    padding: 12, 
                                    borderRadius: 8, 
                                    position: 'relative',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                  }}
                                >
                                  {/* Row Header with Meeting No and Delete button */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 800, color: 'var(--indigo-600)', fontSize: 12 }}>
                                      Pertemuan {w.no} {w.is_uts ? '(UTS)' : w.is_uas ? '(UAS)' : ''}
                                    </span>
                                    <button 
                                      type="button" 
                                      className="btn btn-ghost btn-icon btn-sm" 
                                      style={{ color: 'var(--danger)', height: 24, width: 24 }}
                                      onClick={() => handleRemoveWeeklyItem(idx)}
                                      title="Hapus Pertemuan"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>

                                  {/* Inputs */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Bahan Kajian (Materi / Topik) *</label>
                                      <input 
                                        type="text" 
                                        className="input" 
                                        style={{ fontSize: 12, padding: '6px 8px' }}
                                        value={w.bahan_kajian || ''} 
                                        onChange={e => handleUpdateWeeklyItem(idx, 'bahan_kajian', e.target.value)}
                                        placeholder="Contoh: Pengenalan dasar pemrograman Python"
                                      />
                                    </div>
                                    
                                    <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Kemampuan Akhir yang Diharapkan *</label>
                                      <textarea 
                                        className="input" 
                                        rows={2}
                                        style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1.4, resize: 'vertical' }}
                                        value={w.kemampuan_akhir || ''} 
                                        onChange={e => handleUpdateWeeklyItem(idx, 'kemampuan_akhir', e.target.value)}
                                        placeholder="Contoh: Mahasiswa mampu memahami sintaks dasar dan tipe data dalam Python"
                                      />
                                    </div>

                                    <div style={{ display: 'flex', gap: 10 }}>
                                      <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>🕒 Waktu (Menit)</label>
                                        <input 
                                          type="number" 
                                          className="input" 
                                          style={{ fontSize: 12, padding: '6px 8px' }}
                                          value={w.waktu || 170} 
                                          onChange={e => handleUpdateWeeklyItem(idx, 'waktu', parseInt(e.target.value) || 0)}
                                        />
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>⚖️ Bobot (%)</label>
                                        <input 
                                          type="number" 
                                          className="input" 
                                          style={{ fontSize: 12, padding: '6px 8px' }}
                                          value={w.bobot || 0} 
                                          onChange={e => handleUpdateWeeklyItem(idx, 'bobot', parseInt(e.target.value) || 0)}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAiActiveStep(3)}>
                            &larr; Kembali
                          </button>
                          
                          <div style={{ display: 'flex', gap: 8 }}>
                            {tempWeekly.length > 0 && (
                              <>
                                <button className="btn btn-secondary btn-sm" onClick={handleSaveWeeklyDraft}>
                                  Simpan Draf Silabus
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={handleApplyWeekly}>
                                  Terapkan ke Silabus / Materi Kelas
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 3: ENROLLMENTS (PERSERTA / PENDAFTARAN) ── */}
                {activeTab === 'enrollments' && (
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Persetujuan Mahasiswa</h3>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 20 }}>Kelola dan konfirmasi pendaftaran mahasiswa ke dalam kursus ini.</p>

                    {loadingEnrollments ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 8 }}>
                        <Loader2 size={24} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--indigo-600)' }} />
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Memuat pendaftaran...</span>
                      </div>
                    ) : enrollments.length === 0 ? (
                      <div className="empty-state" style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--gray-200)', borderRadius: 10 }}>
                        <Users size={32} color="var(--gray-300)" style={{ marginBottom: 8 }} />
                        <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-600)', margin: 0 }}>Belum Ada Mahasiswa</p>
                        <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, marginBottom: 0 }}>Belum ada mahasiswa yang terdaftar atau mengajukan pendaftaran di kursus ini.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                        {enrollments.map((e, idx) => {
                          const isPending = e.status === 'pending'
                          return (
                            <div 
                              key={e.id} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 14, 
                                padding: '12px 18px', 
                                background: isPending ? '#fffbeb' : '#fff', 
                                border: isPending ? '1px solid #fde68a' : '1px solid var(--gray-200)',
                                borderRadius: 10,
                                transition: 'all 0.2s'
                              }}
                            >
                              <div className="avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--indigo-50)', color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                                {e.student?.full_name?.[0] || 'M'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {e.student?.full_name}
                                  {isPending && (
                                    <span style={{ fontSize: 9, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 12, fontWeight: 700, border: '1px solid #fde68a' }}>
                                      Menunggu Konfirmasi
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                                  NIM: {e.student?.nim || '-'} · Email: {e.student?.email || '-'}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                {isPending ? (
                                  <>
                                    <button 
                                      className="btn btn-primary btn-sm" 
                                      style={{ background: 'var(--success)', borderColor: 'var(--success)', fontSize: 11, padding: '5px 12px', fontWeight: 700 }}
                                      onClick={() => handleApproveEnrollment(e.id)}
                                    >
                                      Setujui
                                    </button>
                                    <button 
                                      className="btn btn-secondary btn-sm" 
                                      style={{ fontSize: 11, padding: '5px 12px' }}
                                      onClick={() => handleRejectEnrollment(e.id, e.student?.full_name)}
                                    >
                                      Tolak
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    className="btn btn-ghost btn-sm" 
                                    style={{ color: 'var(--danger)', fontSize: 11, padding: '5px 12px' }}
                                    onClick={() => handleRejectEnrollment(e.id, e.student?.full_name)}
                                  >
                                    Hapus Akses
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="card" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed var(--gray-200)',
                background: 'var(--gray-50)',
                padding: '80px 24px',
                textAlign: 'center',
                borderRadius: 12
              }}>
                <BookOpen size={48} color="var(--indigo-300)" style={{ marginBottom: 16 }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-700)', margin: 0 }}>Pilih Kursus</h3>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', maxWidth: 360, marginTop: 6, lineHeight: 1.4 }}>
                  Silakan pilih salah satu kelas di panel sebelah kiri untuk mulai mengelola silabus pertemuan, mengunggah materi, dan menyusun kurikulum Kursus interaktif.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Tambah / Edit Mata Kuliah ── */}
      {courseModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">{editingCourseId ? 'Edit' : 'Tambah'} Mata Kuliah</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCourseModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              {isAdmin && (
                <div className="input-group">
                  <label className="input-label">Instruktur Pengampu *</label>
                  <select className="input" value={courseForm.dosen_id} onChange={e => setCourseForm(f => ({...f, dosen_id: e.target.value}))}>
                    <option value="">— Pilih Instruktur —</option>
                    {dosenList.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name} ({d.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label">Kode Kursus *</label>
                  <input className="input" placeholder="MIF123" value={courseForm.code} onChange={e => setCourseForm(f=>({...f, code:e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">SKS</label>
                  <input className="input" type="number" min={1} max={6} value={courseForm.credits} onChange={e => setCourseForm(f=>({...f, credits:+e.target.value}))}/>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Nama Kursus *</label>
                <input className="input" placeholder="Pemrograman Web" value={courseForm.name} onChange={e => setCourseForm(f=>({...f, name:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Deskripsi</label>
                <textarea className="input" rows={2} style={{ resize:'vertical' }} value={courseForm.description} onChange={e => setCourseForm(f=>({...f, description:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Semester</label>
                <select className="input" value={courseForm.semester} onChange={e => setCourseForm(f=>({...f, semester:e.target.value}))}>
                  {SEMESTERS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Warna Kelas</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setCourseForm(f=>({...f,cover_color:c}))}
                      style={{ width:28, height:28, borderRadius:'50%', background:c,
                        border: courseForm.cover_color===c ? '3px solid var(--gray-900)' : '3px solid transparent',
                        cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setCourseModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCourse} disabled={savingCourse}>
                {savingCourse ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : null}
                {editingCourseId ? 'Simpan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Salin Kursus (Admin Only) ── */}
      {copyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Copy size={15} color="var(--indigo-600)"/>
                <span className="modal-title">Salin Kursus</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCopyModal(false)} disabled={copying}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div style={{ background:'var(--gray-50)', borderRadius:10, padding:'10px 14px', marginBottom:16, border:'1px solid var(--gray-200)' }}>
                <div style={{ fontSize:11, color:'var(--gray-400)', fontWeight:600, marginBottom:3 }}>SUMBER KURSUS</div>
                <div style={{ fontWeight:700, fontSize:14 }}>{copySource?.name}</div>
                <div style={{ fontSize:12, color:'var(--gray-400)' }}>{copySource?.code} · {copySource?.semester} · {copySource?.credits} SKS</div>
              </div>

              <div className="input-group">
                <label className="input-label">Instruktur Pengampu Baru *</label>
                <select className="input" value={copyForm.dosen_id} onChange={e => setCopyForm(f => ({...f, dosen_id: e.target.value}))}>
                  <option value="">— Pilih Instruktur —</option>
                  {dosenList.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.email})</option>)}
                </select>
              </div>

              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label">Kode Kursus Baru *</label>
                  <input className="input" placeholder="MIF123-COPY" value={copyForm.code} onChange={e => setCopyForm(f => ({...f, code: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Semester Baru</label>
                  <select className="input" value={copyForm.semester} onChange={e => setCopyForm(f => ({...f, semester: e.target.value}))}>
                    {SEMESTERS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Nama Kursus Baru *</label>
                <input className="input" value={copyForm.name} onChange={e => setCopyForm(f => ({...f, name: e.target.value}))}/>
              </div>

              <div style={{ marginTop:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--gray-600)', marginBottom:8 }}>Salin Konten Silabus:</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {[
                    { key:'materials',   label:'Materi & Modul',        desc:'Semua berkas lampiran materi per minggu' },
                    { key:'assignments', label:'Tugas Praktik/Kelas',   desc:'Struktur tugas (deadline dikosongkan)' },
                    { key:'questions',   label:'Bank Soal',              desc:'Semua soal pilihan ganda dari modul' },
                    { key:'exams',       label:'Ujian',                  desc:'Struktur ujian (di-reset, belum dipublikasi)' },
                    { key:'forums',      label:'Topik Forum Diskusi',    desc:'Thread forum baru (tanpa balasan diskusi)' },
                  ].map(({ key, label, desc }) => (
                    <div key={key}
                      onClick={() => !copying && setCopyOpts(o => ({...o, [key]: !o[key]}))}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8,
                        background: copyOpts[key] ? '#eef2ff' : 'var(--gray-50)',
                        border: `1px solid ${copyOpts[key] ? '#c7d2fe' : 'var(--gray-200)'}`,
                        cursor: copying ? 'default' : 'pointer', transition:'all .15s' }}
                    >
                      {copyOpts[key]
                        ? <CheckCircle2 size={15} color="var(--indigo-600)" style={{ flexShrink:0 }}/>
                        : <Circle size={15} color="var(--gray-300)" style={{ flexShrink:0 }}/>}
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color: copyOpts[key] ? 'var(--indigo-700)' : 'var(--gray-700)' }}>{label}</div>
                        <div style={{ fontSize:11, color:'var(--gray-400)' }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {copying && copyStep && (
                <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:8, color:'var(--indigo-600)', fontSize:13 }}>
                  <Loader2 size={14} style={{ animation:'spin .7s linear infinite', flexShrink:0 }}/>
                  {copyStep}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setCopyModal(false)} disabled={copying}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleCopy} disabled={copying}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {copying
                  ? <><Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> Menyalin...</>
                  : <><Copy size={13}/> Salin Sekarang</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Tambah / Edit Materi ── */}
      {materialModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:540, maxHeight:'85vh', overflow:'auto' }}>
            <div className="modal-header" style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <BookMarked size={16} color="var(--indigo-600)"/>
                <span className="modal-title">{editingMaterialId ? 'Edit Materi' : 'Tambah Materi'}</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMaterialModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Judul Materi *</label>
                <input className="input" placeholder="cth: Pengantar Jaringan Komputer" value={materialForm.title} onChange={e => setMaterialForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Deskripsi</label>
                <textarea className="input" rows={2} style={{ resize:'vertical' }} value={materialForm.description} onChange={e => setMaterialForm(f=>({...f,description:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Nomor Pertemuan</label>
                <input className="input" type="number" min={0} max={16} value={materialForm.week_number} onChange={e => setMaterialForm(f=>({...f,week_number:+e.target.value}))}/>
                <span className="input-hint">Isi 0 untuk materi umum / pendahuluan kelas</span>
              </div>

              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent: 'space-between', marginBottom:10 }}>
                  <label className="input-label" style={{ margin:0 }}>
                    Lampiran Berkas ({materialForm.attachments.length})
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={addAttach} style={{ gap:5, color:'var(--indigo-600)', padding: '2px 8px', fontSize: 12 }}>
                    <PlusCircle size={13}/> Tambah Lampiran
                  </button>
                </div>

                {materialForm.attachments.map((a, i) => (
                  <AttachRow
                    key={i}
                    attach={a}
                    idx={i}
                    onChange={updateAttach}
                    onRemove={removeAttach}
                    canRemove={materialForm.attachments.length > 1}
                  />
                ))}
              </div>
            </div>
            <div className="modal-footer" style={{ position:'sticky', bottom:0, background:'var(--surface)', zIndex:1 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setMaterialModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveMaterial} disabled={savingMaterial}>
                {savingMaterial ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : editingMaterialId ? <Edit2 size={13}/> : <Plus size={13}/>}
                {editingMaterialId ? 'Simpan Materi' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Input Topik untuk Deskripsi ── */}
      {topicsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Fokus Materi / Topik Deskripsi</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setTopicsModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600, fontSize: 13 }}>
                  Topik / Fokus Materi (Opsional)
                </label>
                <textarea
                  className="input"
                  rows={4}
                  style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
                  placeholder="Masukkan topik-topik kunci, kata kunci, atau fokus materi yang ingin dibahas dalam deskripsi kursus ini (misal: pengenalan algoritma, struktur data dasar, sorting, pencarian)..."
                  value={topicsInput}
                  onChange={e => setTopicsInput(e.target.value)}
                />
                <span className="input-hint" style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  AI akan mengembangkan topik-topik di atas menjadi deskripsi mata kuliah yang komprehensif.
                </span>
              </div>
            </div>
            <div className="modal-footer" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', zIndex: 1 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setTopicsModal(false)}>Batal</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAiGenerateDesc}
                disabled={aiGeneratingDesc}
              >
                {aiGeneratingDesc ? (
                  <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }}/>
                ) : (
                  <Sparkles size={13}/>
                )}
                Rumuskan Deskripsi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AI Slide / WebSlide / Essay Generator ── */}
      {slideModal && activeMeeting && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 650, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="var(--indigo-600)" />
                <span className="modal-title">
                  {+activeMeeting.week_number === 8 || +activeMeeting.week_number === 16 ? 'AI Essay Questions Generator' : 'AI Slide & WebSlide Generator'}
                </span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSlideModal(false)}><X size={14}/></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Meeting Info */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--gray-200)' }}>
                <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Pertemuan {activeMeeting.week_number}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginTop: 2 }}>{activeMeeting.title}</div>
                {activeMeeting.description && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{activeMeeting.description}</div>}
              </div>

              {/* Progress feedback */}
              {aiSlideProgressText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eef2ff', border: '1px solid #c7d2fe', padding: 12, borderRadius: 8, color: 'var(--indigo-700)', fontSize: 12, fontWeight: 600 }}>
                  <Loader2 size={14} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{aiSlideProgressText}</span>
                </div>
              )}

              {/* ── FLOW FOR UTS/UAS: Essay Questions ── */}
              {(+activeMeeting.week_number === 8 || +activeMeeting.week_number === 16) ? (
                <div>
                  {!essayData && !loadingSlide && (
                    <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                      <HelpCircle size={40} color="var(--indigo-300)" style={{ marginBottom: 12 }} />
                      <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Belum ada soal ujian essay yang dirumuskan AI untuk evaluasi ini.</p>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 12, gap: 6 }} onClick={handleGenerateEssayQuestions}>
                        <Sparkles size={13} /> Susun Soal Ujian (HOTS)
                      </button>
                    </div>
                  )}

                  {essayData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Draf Soal Essay AI:</span>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: 11, gap: 4 }} onClick={handleCopyEssayQuestions}>
                          <Copy size={12}/> Salin Soal
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, maxHeight: 300, overflowY: 'auto' }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px 0', color: 'var(--gray-800)' }}>{essayData.title}</h4>
                        {essayData.questions?.map((q, idx) => (
                          <div key={idx} style={{ borderBottom: idx < essayData.questions.length - 1 ? '1px solid var(--gray-200)' : 'none', paddingBottom: idx < essayData.questions.length - 1 ? 10 : 0, paddingTop: idx > 0 ? 8 : 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--indigo-700)' }}>Soal {q.no} ({q.max_score} Poin)</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-800)', marginTop: 4, fontWeight: 600 }}>{q.question}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, background: '#f1f5f9', padding: 6, borderRadius: 4 }}>
                              <strong>Rubrik:</strong> {q.rubric}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <button className="btn btn-secondary btn-sm" style={{ gap: 4, alignSelf: 'flex-start' }} onClick={handleGenerateEssayQuestions} disabled={loadingSlide}>
                        <RefreshCw size={12}/> Generate Ulang Soal
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* ── FLOW FOR LECTURES: Slides & WebSlide ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  
                  {/* Step A: Outline Slide */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>1. Outline Materi Slide</span>
                    {!slideOutline && !loadingSlide && (
                      <button className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={handleGenerateSlideOutline}>
                        <Sparkles size={13} /> Generate Outline Slide AI (Min 15 Slide)
                      </button>
                    )}

                    {slideOutline && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-600)' }}>{slideOutline.title}</span>
                          <button className="btn btn-ghost btn-xs" style={{ gap: 4, color: 'var(--indigo-600)' }} onClick={handleCopySlideOutline}>
                            <Copy size={11}/> Salin Outline
                          </button>
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, fontSize: 12, background: '#fafafa' }}>
                          {slideOutline.slides?.map(s => (
                            <div key={s.slide_no} style={{ marginBottom: 8 }}>
                              <strong>Slide {s.slide_no}: {s.title}</strong>
                              <ul style={{ paddingLeft: 16, margin: '2px 0 0 0', color: 'var(--gray-500)' }}>
                                {s.content?.map((c, ci) => <li key={ci}>{c}</li>)}
                              </ul>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-xs" style={{ gap: 4 }} onClick={handleGenerateSlideOutline}>
                            <RefreshCw size={11}/> Outline Ulang
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step B: WebSlide Presentation layouts */}
                  {slideOutline && (
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>2. Tampilan Presentasi WebSlide</span>
                      {!webslideData && !generatingWebSlide && (
                        <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={handleGenerateWebSlide}>
                          <Sparkles size={13} /> Rancang WebSlide (Layout Dinamis AI)
                        </button>
                      )}

                      {webslideData && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={handlePreviewWebSlide}>
                              <ExternalLink size={13}/> Buka Preview Presentasi
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ gap: 6 }} onClick={handleDownloadWebSlide}>
                              <Download size={13}/> Unduh File HTML
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button className="btn btn-ghost btn-xs" style={{ gap: 4 }} onClick={handleGenerateWebSlide} disabled={generatingWebSlide}>
                              <RefreshCw size={11}/> Rancang Ulang WebSlide
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save to materials button */}
                  {(slideOutline || webslideData) && (
                    <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveAiSlideContent} disabled={savingSlide}>
                        {savingSlide ? <Loader2 size={13} className="spinner" style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13}/>}
                        Simpan Rancangan Slide ke Silabus
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', zIndex: 2 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSlideModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
