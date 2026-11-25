import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Users, Edit2, Trash2, Loader2, Copy, Search, Info } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { generateSlideContent, generateWebSlideData, generateSingleSlide, generateSingleWebSlideData, PROGRES_MENUNGGU } from '@/lib/ai'
import { generateWebSlideHtml } from '@/lib/webslideTemplate'
import { parseWebSlideHtml, WebSlideImportError } from '@/lib/webslideImport'
import { slideVideo, spaDariSlideVideo, terapkanSlideVideo } from '@/lib/sisipSlide'
import LaporanProgresMateri from '@/components/dosen/LaporanProgresMateri'
import LengkapiBebanCpmk from '@/components/dosen/LengkapiBebanCpmk'
import StudioSlide from './mataKuliah/StudioSlide'
import TabRingkasan from './mataKuliah/TabRingkasan'
import TabPendaftar from './mataKuliah/TabPendaftar'
import TabSilabus from './mataKuliah/TabSilabus'
import BatasGalat from '@/components/ui/BatasGalat'
import ModalKursus from './mataKuliah/ModalKursus'
import ModalSalinKursus from './mataKuliah/ModalSalinKursus'
import ModalSoalUjian from './mataKuliah/ModalSoalUjian'

const TabGeneratorRps = lazy(() => import('./mataKuliah/TabGeneratorRps'))

// Pertemuan 8 dan 16 adalah UTS/UAS: jendela soal pilihan ganda, bukan studio slide.
const pertemuanUjian = (m) => +m?.week_number === 8 || +m?.week_number === 16


// ── Main SPA component ─────────────────────────────────────────
export default function DosenMataKuliah() {
  const { user, profile, isAdmin } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rpsDibuka, setRpsDibuka] = useState(false) // tab Generator RPS dimuat saat pertama dibuka
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'curriculum' | 'ai_assistant'

  // ── Course states ──────────────────────────────────────────
  const [courses,    setCourses]    = useState([])
  const [dosenList,  setDosenList]  = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [modalKursus, setModalKursus] = useState(null) // null | { kursus: null (baru) | objek kursus }
  const [searchTerm, setSearchTerm] = useState('')

  // Active selected course
  const [selectedCourseId, setSelectedCourseId] = useState(null)

  // ── Copy states ────────────────────────────────────────────
  const [salinDari, setSalinDari] = useState(null) // kursus sumber saat modal salin terbuka

  // ── Materials states ────────────────────────────────────────
  const [materials, setMaterials] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)

  // ── Enrollments states ──────────────────────────────────────


  // ── AI Slide Generator states ───────────────────────────────
  const [slideModal, setSlideModal] = useState(false)
  const [activeMeeting, setActiveMeeting] = useState(null)
  const [loadingSlide, setLoadingSlide] = useState(false)
  const [generatingWebSlide, setGeneratingWebSlide] = useState(false)
  const [savingSlide, setSavingSlide] = useState(false)
  const [slideOutline, setSlideOutline] = useState(null)
  const [webslideData, setWebslideData] = useState(null)
  const [aiSlideProgressText, setAiSlideProgressText] = useState('')
  const [soalUjian, setSoalUjian] = useState(null) // materi UTS/UAS yang modal soalnya terbuka

  const [regeneratingSlideNo, setRegeneratingSlideNo] = useState(null)
  const [regeneratingLayoutSlideNo, setRegeneratingLayoutSlideNo] = useState(null)
  const [snapshotSlide, setSnapshotSlide] = useState('') // isi outline+SPA terakhir yang tersimpan di database
  const [laporanMateri, setLaporanMateri] = useState(null) // materi yang laporan progresnya sedang dibuka
  const [lengkapiBeban, setLengkapiBeban] = useState(false) // alat isi beban & CPMK sekaligus



  const handleAiSlideProgress = (event) => {
    if (typeof event === 'string') {
      setAiSlideProgressText(event)
    } else if (event && event.type === 'chunk') {
      const chars = event.text.length
      setAiSlideProgressText(`AI sedang membangun SPA... (${chars.toLocaleString('id-ID')} karakter)`)
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
    if (!courseIdParam) {
      if (selectedCourseId) setSelectedCourseId(null)
    } else if (courseIdParam !== selectedCourseId) {
      const match = courses.find(c => c.id === courseIdParam)
      if (match) {
        setSelectedCourseId(courseIdParam)
      }
    }
  }, [courseIdParam, courses])

  const selectedCourse = courses.find(c => c.id === selectedCourseId)


  // Reset tab and step only when the selected course ID changes
  useEffect(() => {
    if (selectedCourseId) {
      setActiveTab('overview')
    }
  }, [selectedCourseId])

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
    } else {
      // Tanpa courseId: tampilkan daftar kursus (kursus dipilih lewat sidebar atau daftar).
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
  const openNewCourse = () => setModalKursus({ kursus: null })
  const openEditCourse = (c) => setModalKursus({ kursus: c })

  // Kursus baru langsung dibuka; edit dari daftar tetap di daftar.
  function kursusTersimpan({ id, baru }) {
    setModalKursus(null)
    fetchCourses(baru ? id : (searchParams.get('courseId') ? id : null))
    window.dispatchEvent(new Event('systract:courses-changed'))
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
      // Kembali ke daftar kursus.
      setCourses(courses.filter(c => c.id !== id))
      setSelectedCourseId(null)
      setSearchParams({})
      fetchCourses(null)
      window.dispatchEvent(new Event('systract:courses-changed'))
    }
  }

  // ── Salin kursus (ModalSalinKursus) ──────────────────────────
  const openCopy = (c) => setSalinDari(c)

  // ── Material & Attachments Handlers ──────────────────────────

  // ── AI Slide Generator Actions ──────────────────────────────
  function openSlideGenerator(m) {
    if (pertemuanUjian(m)) { setSoalUjian(m); return } // UTS/UAS: modal soal pilihan ganda
    setActiveMeeting(m)
    setSlideOutline(m.slide_content || null)
    setWebslideData(m.webslide_content || null)
    setSnapshotSlide(JSON.stringify({ o: m.slide_content || null, w: m.webslide_content || null }))
    setAiSlideProgressText('')
    setSlideModal(true)
  }

  // Outline/SPA di studio berbeda dengan yang tersimpan di database.
  const slideBelumDisimpan = slideModal && JSON.stringify({ o: slideOutline, w: webslideData }) !== snapshotSlide

  async function tutupSlideModal() {
    if (slideBelumDisimpan) {
      const ok = await showConfirm({
        title: 'Tutup tanpa menyimpan?',
        message: 'Perubahan outline, slide video, dan pertanyaan video belum tersimpan ke silabus, jadi peserta belum akan melihatnya. Tekan "Simpan ke Silabus" bila ingin menyimpannya.',
        confirmLabel: 'Tutup tanpa menyimpan',
        variant: 'danger',
      })
      if (!ok) return
    }
    setSlideModal(false)
  }

  async function handleGenerateSlideOutline() {
    setLoadingSlide(true)
    setAiSlideProgressText("Menghubungi Gateway API Server...")

    let subTimer = null
    const steps = [
      "Menganalisis Kemampuan Akhir & Bahan Kajian...",
      "Mengintegrasikan Referensi Pustaka RPS...",
      "Memetakan sub-topik & merancang 26–34 bagian materi...",
      "Mengembangkan Contoh Kasus & Penerapan Industri...",
      "Menyusun Perbandingan Konsep & Penjelasan Detail...",
      "Mempersiapkan Output Draft Slide..."
    ]
    let currentStep = 0

    const handleProgress = (event) => {
      if (typeof event === 'string') {
        if (event === PROGRES_MENUNGGU) {
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
        handleProgress,
        {
          // Judul pertemuan lain agar AI tidak mengambil alih materinya.
          pertemuanLain: [...new Map(
            materials
              .filter(m => m.week_number && m.week_number !== activeMeeting.week_number)
              .map(m => [m.week_number, `Pertemuan ${m.week_number}: ${m.title}`])
          ).values()],
        }
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


  async function handleRegenerateSlide(slideNo, slideTitle, currentContent) {
    setRegeneratingSlideNo(slideNo)
    try {
      const result = await generateSingleSlide(
        selectedCourse.name,
        activeMeeting.week_number,
        activeMeeting.title,
        slideNo,
        slideTitle,
        currentContent
      )

      if (result && result.content) {
        const updatedSlides = slideOutline.slides.map(s => {
          if (s.slide_no === slideNo) {
            return {
              ...s,
              title: result.title || s.title,
              content: result.content,
              image_url: s.image_url // Keep existing image/media url
            }
          }
          return s
        })

        setSlideOutline({
          ...slideOutline,
          slides: updatedSlides
        })

        // Sync changes to webslideData (SPA Layout)
        syncWebSlideWithOutline(updatedSlides, slideNo, 'update')

        toast.success(`Slide ${slideNo} berhasil di-generate ulang! 🤖`)
      } else {
        throw new Error("Respons AI tidak valid")
      }
    } catch (err) {
      toast.error(`Gagal meregenerasi Slide ${slideNo}: ` + err.message)
    } finally {
      setRegeneratingSlideNo(null)
    }
  }

  async function handleRegenerateSlideLayout(slideNo) {
    if (!slideOutline) return
    const outlineSlide = slideOutline.slides.find(s => s.slide_no === slideNo)
    if (!outlineSlide) return
    if (slideVideo(outlineSlide)) {
      // Slide video selalu satu pemutar video satu layar; tidak perlu AI.
      setWebslideData({
        ...webslideData,
        slides: (webslideData?.slides || []).map(s => s.slide_no === slideNo ? spaDariSlideVideo(outlineSlide) : s),
      })
      return
    }

    setRegeneratingLayoutSlideNo(slideNo)
    try {
      const prodiName = profile?.program_studi || 'Teknik Informatika'
      const result = await generateSingleWebSlideData(
        selectedCourse.name,
        prodiName,
        activeMeeting.week_number,
        slideNo,
        outlineSlide
      )

      if (result && result.layout) {
        // Keep the outline slide's image_url if it was set
        if (outlineSlide.image_url) {
          result.image_url = outlineSlide.image_url
        }

        const updatedWebslides = (webslideData?.slides || []).map(s => {
          if (s.slide_no === slideNo) {
            return result
          }
          return s
        })

        setWebslideData({
          ...webslideData,
          slides: updatedWebslides
        })
        toast.success(`Layout SPA untuk Slide ${slideNo} berhasil di-generate ulang! 🎨`)
      } else {
        throw new Error("Respons AI tidak valid")
      }
    } catch (err) {
      toast.error(`Gagal meregenerasi layout Slide ${slideNo}: ` + err.message)
    } finally {
      setRegeneratingLayoutSlideNo(null)
    }
  }

  // ── Sync Slide Outline with WebSlide Layouts (Student SPA) ──
  function syncWebSlideWithOutline(updatedOutlineSlides, activeSlideNo = null, actionType = 'update') {
    if (!webslideData || !webslideData.slides) return

    let updatedWebslides = [...webslideData.slides]

    if (actionType === 'delete') {
      updatedWebslides = updatedWebslides.filter(s => s.slide_no !== activeSlideNo)
      updatedWebslides = updatedWebslides.map((s, idx) => ({ ...s, slide_no: idx + 1 }))
    } else if (actionType === 'update') {
      const outlineSlide = updatedOutlineSlides.find(s => s.slide_no === activeSlideNo)
      if (outlineSlide) {
        updatedWebslides = updatedWebslides.map(s => {
          if (s.slide_no === activeSlideNo && slideVideo(outlineSlide)) return spaDariSlideVideo(outlineSlide)
          if (s.slide_no === activeSlideNo) {
            const newTitle = outlineSlide.title
            const newImgUrl = outlineSlide.image_url || s.image_url
            const newContent = outlineSlide.content || []

            let updatedSlide = {
              ...s,
              title: newTitle,
              image_url: newImgUrl,
              content: newContent
            }

            if (s.layout === 'split') {
              updatedSlide.split_right = newContent
            } else if (s.layout === 'list') {
              updatedSlide.list_items = newContent.map(text => ({ text, color: 'blue' }))
            } else if (s.layout === 'grid') {
              updatedSlide.grid_items = newContent.map((desc, i) => ({ 
                title: `Poin ${i + 1}`, 
                desc, 
                icon: 'fa-solid fa-lightbulb' 
              }))
            } else if (s.layout === 'media') {
              updatedSlide.description = newContent.join(' ')
            } else if (s.layout === 'accordion') {
              updatedSlide.accordion_items = newContent.map((content, i) => ({ 
                header: `Poin ${i + 1}`, 
                content 
              }))
            }

            return updatedSlide
          }
          return s
        })
      }
    }

    setWebslideData({
      ...webslideData,
      slides: updatedWebslides
    })
  }

  async function handleGenerateWebSlide() {
    if (!slideOutline) return
    setGeneratingWebSlide(true)
    setAiSlideProgressText("Menganalisis materi slide & membangun tata letak SPA interaktif...")
    try {
      const prodiName = profile?.program_studi || 'Teknik Informatika'
      const result = await generateWebSlideData(
        selectedCourse.name,
        prodiName,
        activeMeeting.week_number,
        slideOutline,
        handleAiSlideProgress
      )

      // Merge custom image/video URLs from the outline slides
      if (result && result.slides && slideOutline && slideOutline.slides) {
        result.slides = result.slides.map(s => {
          const outlineSlide = slideOutline.slides.find(os => os.slide_no === s.slide_no)
          if (outlineSlide && outlineSlide.image_url) {
            return {
              ...s,
              image_url: outlineSlide.image_url
            }
          }
          return s
        })
      }

      if (result?.slides) result.slides = terapkanSlideVideo(slideOutline.slides, result.slides)
      setWebslideData(result)
      toast.success("Aplikasi SPA Slide berhasil dibangun! 🎬")
    } catch (err) {
      toast.error("Gagal membangun SPA Slide: " + err.message)
    } finally {
      setGeneratingWebSlide(false)
      setAiSlideProgressText('')
    }
  }

  // Impor file HTML WebSlide (kerangka SYSTRACT) menjadi outline + SPA.
  // Hasilnya belum tersimpan sampai instruktur menekan "Simpan Rancangan Slide ke Silabus".
  async function handleImportHtml(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5 MB.')
      return
    }
    if (slideOutline || webslideData) {
      const ok = await showConfirm({
        title: 'Ganti slide yang ada?',
        message: 'Outline dan tampilan SPA pertemuan ini akan diganti dengan isi file HTML. Perubahan baru tersimpan setelah Anda menekan Simpan.',
        confirmLabel: 'Ya, impor',
      })
      if (!ok) return
    }
    try {
      const { webslide, outline } = parseWebSlideHtml(await file.text())
      setSlideOutline(outline)
      setWebslideData(webslide)
      toast.success(`${webslide.slides.length} bagian diimpor. Periksa lewat "Buka Preview Presentasi", lalu simpan.`, { duration: 6000 })
    } catch (err) {
      if (err instanceof WebSlideImportError) toast.error(err.message, { duration: 6000 })
      else {
        console.error('[SYSTRACT] Impor HTML gagal:', err)
        toast.error('File HTML tidak dapat dibaca.')
      }
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
        toast.error('⚠️ Struktur database belum sesuai versi aplikasi. Hubungi admin SYSTRACT.', { duration: 6000 })
      } else {
        toast.error('Gagal menyimpan ke database: ' + error.message)
      }
    } else {
      toast.success('Rancangan Slide berhasil disimpan ke Silabus!')
      setSnapshotSlide(JSON.stringify({ o: slideOutline, w: webslideData }))
      setSlideModal(false)
      fetchMaterials(selectedCourseId)
    }
    setSavingSlide(false)
  }

  function handlePreviewWebSlide() {
    if (!webslideData) return
    const prodiName = profile?.program_studi || 'Teknik Informatika'
    localStorage.setItem('webslide_preview_data', JSON.stringify({
      courseName: selectedCourse.name,
      prodiName,
      weekNumber: activeMeeting.week_number,
      webslideData
    }))
    window.open('/webslide-preview', '_blank')
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



  // ── Logic Data Grouping ──────────────────────────────────────
  const filteredCourses = courses.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group materials by week
  const _materialsByWeek = materials.reduce((acc, m) => {
    const w = m.week_number || 0
    if (!acc[w]) acc[w] = []
    acc[w].push(m)
    return acc
  }, {})

  const pageTitle = isAdmin ? 'Semua kursus' : 'Kursus yang diampu'

  return (
    <>
    {confirmDialog}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Page Header (hanya di daftar; di dalam kursus judulnya nama kursus) */}
      {!selectedCourse && (
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 0 }}>
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-subtitle">Pilih kursus untuk mengelola deskripsi, silabus, materi, dan pendaftar.</p>
          </div>
          <button className="btn btn-primary" onClick={openNewCourse}>
            <Plus size={14}/> Tambah kursus
          </button>
        </div>
      )}

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
          
          {/* ── DAFTAR KURSUS (tampil bila belum ada kursus yang dipilih) ── */}
          {!selectedCourse && (
          <div className="courses-sidebar-pane" style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {/* Search filter */}
            <label style={{ position: 'relative', maxWidth: 360, display: 'block' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Cari kursus</span>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input
                className="input"
                placeholder="Cari kode atau nama kursus"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 30, height: 38 }}
              />
            </label>

            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{filteredCourses.length} kursus</span>

            {/* Courses grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12
            }}>
              {filteredCourses.length === 0 ? (
                <div className="card" style={{ padding: '24px 12px', textAlign: 'center', border: '1px dashed var(--gray-200)' }}>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Kursus tidak ditemukan</span>
                </div>
              ) : (
                filteredCourses.map((c) => {
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
                      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>{c.code}</span>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gray-900)', lineHeight: 1.35 }}>
                          {c.name}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6, gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users size={12}/> {c.enrollments?.[0]?.count || 0} peserta
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
          )}

          {/* ── KURSUS TERPILIH ── */}
          {selectedCourse && (
          <div className="course-workspace-pane" style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
                <>
                 {/* Course Header Info */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                   <div style={{ minWidth: 0 }}>
                     <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>
                       {selectedCourse.code} · {selectedCourse.enrollments?.[0]?.count || 0} peserta
                     </span>
                     <h1 className="page-title" style={{ marginTop: 2 }}>
                       {selectedCourse.name}
                     </h1>
                   </div>
                   <div style={{ display: 'flex', gap: 8 }}>
                     <button className="btn btn-secondary btn-sm" onClick={() => openEditCourse(selectedCourse)}><Edit2 size={13}/> Edit kursus</button>
                     {isAdmin && (
                       <button className="btn btn-secondary btn-sm" onClick={() => openCopy(selectedCourse)}><Copy size={13}/> Salin</button>
                     )}
                     <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteCourse(selectedCourse.id)}><Trash2 size={13}/> Hapus</button>
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
                    Ringkasan
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
                    Silabus & materi
                  </button>
                  <button
                    onClick={() => { setRpsDibuka(true); setActiveTab('ai_assistant') }}
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
                    Generator RPS & slide (AI)
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
                    Pendaftar
                  </button>
                </div>


                {/* ── TAB 0: OVERVIEW ── */}
                {activeTab === 'overview' && (
                  <BatasGalat key={selectedCourseId} nama="Tab Ringkasan">
                    <TabRingkasan course={selectedCourse} materials={materials} onLengkapi={() => setLengkapiBeban(true)} />
                  </BatasGalat>
                )}

                {/* ── TAB 1: CURRICULUM (SILABUS & MATERI) ── */}
                {activeTab === 'curriculum' && (
                  <BatasGalat key={selectedCourseId} nama="Tab Silabus & materi">
                    <TabSilabus
                      course={selectedCourse}
                      materials={materials}
                      loading={loadingMaterials}
                      onBerubah={() => fetchMaterials(selectedCourseId)}
                      onSlideAi={openSlideGenerator}
                      onProgres={setLaporanMateri}
                    />
                  </BatasGalat>
                )}

                {/* ── TAB 2: AI RPS & SLIDE ASSISTANT ── */}
                {rpsDibuka && (
                  <div hidden={activeTab !== 'ai_assistant'}>
                    <BatasGalat key={selectedCourseId} nama="Tab Generator RPS">
                      <Suspense fallback={<div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-500)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat generator…</div>}>
                        <TabGeneratorRps
                          key={selectedCourseId}
                          course={selectedCourse}
                          onCourseBerubah={() => fetchCourses(selectedCourseId)}
                          onMaterialsBerubah={() => fetchMaterials(selectedCourseId)}
                          onKeSilabus={() => setActiveTab('curriculum')}
                        />
                      </Suspense>
                    </BatasGalat>
                  </div>
                )}

                {/* ── TAB 3: ENROLLMENTS (PERSERTA / PENDAFTARAN) ── */}
                {activeTab === 'enrollments' && (
                  <BatasGalat key={selectedCourseId} nama="Tab Pendaftar">
                    <TabPendaftar courseId={selectedCourseId} onBerubah={() => fetchCourses(selectedCourseId)} />
                  </BatasGalat>
                )}
              </>
          </div>
          )}
        </div>
      )}

      {/* ── MODAL: Tambah / Edit Mata Kuliah ── */}
      {modalKursus && (
        <ModalKursus kursus={modalKursus.kursus} dosenList={dosenList} onClose={() => setModalKursus(null)} onSaved={kursusTersimpan} />
      )}

      {/* ── MODAL: Salin Kursus (Admin Only) ── */}
      {salinDari && (
        <ModalSalinKursus sumber={salinDari} dosenList={dosenList} onClose={() => setSalinDari(null)}
          onSaved={(id) => { setSalinDari(null); fetchCourses(id) }} />
      )}



      {/* ── MODAL: AI Slide / WebSlide / Essay Generator ── */}
      {laporanMateri && <LaporanProgresMateri materi={laporanMateri} onClose={() => setLaporanMateri(null)} />}
      {lengkapiBeban && selectedCourse && (
        <LengkapiBebanCpmk course={selectedCourse} onClose={() => setLengkapiBeban(false)} onSaved={() => fetchMaterials(selectedCourseId)} />
      )}

      {/* Studio slide layar penuh untuk pertemuan biasa (UTS/UAS memakai jendela soal di bawah). */}
      {slideModal && activeMeeting && !pertemuanUjian(activeMeeting) && (
        <StudioSlide
          meeting={activeMeeting}
          courseName={selectedCourse?.name}
          slideOutline={slideOutline}
          setSlideOutline={setSlideOutline}
          webslideData={webslideData}
          setWebslideData={setWebslideData}
          sibuk={{
            outline: loadingSlide,
            spa: generatingWebSlide,
            teks: aiSlideProgressText,
            simpan: savingSlide,
            kontenNo: regeneratingSlideNo,
            layoutNo: regeneratingLayoutSlideNo,
          }}
          belumDisimpan={slideBelumDisimpan}
          konfirmasi={showConfirm}
          onTutup={tutupSlideModal}
          onSimpan={handleSaveAiSlideContent}
          onGenerateOutline={handleGenerateSlideOutline}
          onGenerateSpa={handleGenerateWebSlide}
          onPratinjau={handlePreviewWebSlide}
          onUnduhHtml={handleDownloadWebSlide}
          onImporFile={handleImportHtml}
          onSalinOutline={handleCopySlideOutline}
          onRegenerateKonten={handleRegenerateSlide}
          onRegenerateLayout={handleRegenerateSlideLayout}
        />
      )}

      {soalUjian && selectedCourse && (
        <ModalSoalUjian course={selectedCourse} meeting={soalUjian} onClose={() => setSoalUjian(null)}
          onSaved={() => { setSoalUjian(null); fetchMaterials(selectedCourseId) }} />
      )}
    </div>
    </>
  )
}
