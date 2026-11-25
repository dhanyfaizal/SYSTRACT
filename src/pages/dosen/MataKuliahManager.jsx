import { useState, useEffect, lazy, Suspense, useEffectEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Users, Edit2, Trash2, Loader2, Copy, Search, Info } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import LaporanProgresMateri from '@/components/dosen/LaporanProgresMateri'
import LengkapiBebanCpmk from '@/components/dosen/LengkapiBebanCpmk'
import TabRingkasan from './mataKuliah/TabRingkasan'
import TabPendaftar from './mataKuliah/TabPendaftar'
import TabSilabus from './mataKuliah/TabSilabus'
import BatasGalat from '@/components/ui/BatasGalat'
import ModalKursus from './mataKuliah/ModalKursus'
import ModalSalinKursus from './mataKuliah/ModalSalinKursus'
import ModalSoalUjian from './mataKuliah/ModalSoalUjian'

const TANPA_MATERI = []

const TabGeneratorRps = lazy(() => import('./mataKuliah/TabGeneratorRps'))
const StudioSlideAi = lazy(() => import('./mataKuliah/StudioSlideAi'))

// Pertemuan 8 dan 16 adalah UTS/UAS: jendela soal pilihan ganda, bukan studio slide.
const pertemuanUjian = (m) => +m?.week_number === 8 || +m?.week_number === 16


// ── Main SPA component ─────────────────────────────────────────
export default function DosenMataKuliah() {
  const { user, isAdmin } = useAuth()
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
  // Kursus terpilih = ?courseId= di URL yang ada di daftar kursus (satu sumber kebenaran).
  const courseIdParam = searchParams.get('courseId')
  const selectedCourseId = courseIdParam && courses.some(c => c.id === courseIdParam) ? courseIdParam : null

  // ── Copy states ────────────────────────────────────────────
  const [salinDari, setSalinDari] = useState(null) // kursus sumber saat modal salin terbuka

  // ── Materials states ────────────────────────────────────────
  const [materiTermuat, setMaterials] = useState([])
  const materials = selectedCourseId ? materiTermuat : TANPA_MATERI
  const [loadingMaterials, setLoadingMaterials] = useState(false)

  // ── Enrollments states ──────────────────────────────────────


  // ── AI Slide Generator states ───────────────────────────────
  const [studioMateri, setStudioMateri] = useState(null) // materi yang sedang dibuka di Studio slide
  const [soalUjian, setSoalUjian] = useState(null) // materi UTS/UAS yang modal soalnya terbuka
  const [laporanMateri, setLaporanMateri] = useState(null) // materi yang laporan progresnya sedang dibuka
  const [lengkapiBeban, setLengkapiBeban] = useState(false) // alat isi beban & CPMK sekaligus



  // Muat daftar kursus (dan daftar instruktur untuk admin) saat pengguna siap.
  const muatAwal = useEffectEvent(() => {
    if (user) {
      fetchCourses()
      if (isAdmin) fetchDosenList()
    }
  })
  useEffect(() => { muatAwal() }, [user, isAdmin])

  // Muat materi setiap kali kursus terpilih berganti.
  const muatMateriKursus = useEffectEvent(() => { if (selectedCourseId) fetchMaterials(selectedCourseId) })
  useEffect(() => { muatMateriKursus() }, [selectedCourseId])

  const selectedCourse = courses.find(c => c.id === selectedCourseId)


  // Ganti kursus: kembali ke tab Ringkasan.
  const [kursusSebelumnya, setKursusSebelumnya] = useState(selectedCourseId)
  if (selectedCourseId !== kursusSebelumnya) {
    setKursusSebelumnya(selectedCourseId)
    if (selectedCourseId) setActiveTab('overview')
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
    // Tanpa courseId yang cocok: tampil daftar kursus (kursus terpilih diturunkan dari URL).
    if (match && searchParams.get('courseId') !== match.id) {
      setSearchParams({ courseId: match.id })
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
      setSearchParams({})
      fetchCourses(null)
      window.dispatchEvent(new Event('systract:courses-changed'))
    }
  }

  // ── Salin kursus (ModalSalinKursus) ──────────────────────────
  const openCopy = (c) => setSalinDari(c)

  // ── Material & Attachments Handlers ──────────────────────────

  // ── Generator slide/soal AI ─────────────────────────────────
  function openSlideGenerator(m) {
    if (pertemuanUjian(m)) setSoalUjian(m) // UTS/UAS: modal soal pilihan ganda
    else setStudioMateri(m)
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
      {studioMateri && selectedCourse && (
        <BatasGalat nama="Studio slide">
          <Suspense fallback={<div className="modal-overlay"><Loader2 size={22} color="#fff" style={{ animation: 'spin 1s linear infinite' }} aria-label="Memuat studio" /></div>}>
          <StudioSlideAi course={selectedCourse} meeting={studioMateri} materials={materials}
            onClose={() => setStudioMateri(null)}
            onSaved={() => { setStudioMateri(null); fetchMaterials(selectedCourseId) }} />
          </Suspense>
        </BatasGalat>
      )}

      {soalUjian && selectedCourse && (
        <ModalSoalUjian course={selectedCourse} meeting={soalUjian} onClose={() => setSoalUjian(null)}
          onSaved={() => { setSoalUjian(null); fetchMaterials(selectedCourseId) }} />
      )}
    </div>
    </>
  )
}
