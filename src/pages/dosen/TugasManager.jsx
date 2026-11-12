import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import CoursePicker from "@/components/dosen/CoursePicker"
import { ClipboardList, Plus, Edit2, Trash2, X, Loader2, Clock, Users, Star, Eye, CheckCircle2, FileText, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/withRetry'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import BebanBelajarFields from '@/components/dosen/BebanBelajarFields'
import { useCpmkKursus } from '@/hooks/useCpmkKursus'

const BLANK = { title: '', description: '', max_score: 100, due_date: '', allow_late_submission: false, estimasi_menit: null, cpmk_kode: [] }
const fmt = iso => iso ? new Date(iso).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'

/* ── Grading Panel ─────────────────────────────────────────── */
function GradingPanel({ assignment, onClose }) {
  const [submissions, setSubmissions] = useState([])
  const [enrolled,    setEnrolled]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selected,    setSelected]    = useState(null) // student_id
  const [grading,     setGrading]     = useState({})
  const [filter,      setFilter]      = useState('all') // all|ungraded|graded|missing
  const [search,      setSearch]      = useState('')

  useEffect(() => { fetchData() }, [assignment.id])

  async function fetchData() {
    setLoading(true)
    // Parallel: fetch submissions + enrollments sekaligus
    const [{ data: subs }, { data: enr }] = await Promise.all([
      supabase.from('submissions').select('*').eq('assignment_id', assignment.id),
      supabase.from('enrollments').select('student_id').eq('course_id', assignment.course_id),
    ])
    const subIds = subs?.map(s => s.student_id) || []
    const enrIds = enr?.map(e => e.student_id)  || []
    const allIds = [...new Set([...subIds, ...enrIds])]
    let profileMap = {}
    if (allIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name,email,nim').in('id', allIds)
      profiles?.forEach(p => { profileMap[p.id] = p })
    }
    const enriched = (subs || []).map(s => ({ ...s, student: profileMap[s.student_id] || null }))
    const enrolledList = (enr || []).map(e => ({ student_id: e.student_id, student: profileMap[e.student_id] || null }))
    setSubmissions(enriched)
    setEnrolled(enrolledList)
    const init = {}
    enriched.forEach(s => { init[s.student_id] = { grade: s.grade ?? '', feedback: s.feedback || '', saving: false } })
    setGrading(init)
    setLoading(false)
    if (!selected && enriched.length > 0) setSelected(enriched[0].student_id)
  }

  async function saveGrade() {
    const sub = submissions.find(s => s.student_id === selected)
    if (!sub) return
    const g = grading[selected]
    if (g.grade === '' || g.grade === null) { toast.error('Masukkan nilai'); return }
    const grade = Number(g.grade)
    if (isNaN(grade) || grade < 0 || grade > assignment.max_score) { toast.error(`Nilai 0–${assignment.max_score}`); return }
    setGrading(p => ({ ...p, [selected]: { ...p[selected], saving: true } }))
    const { error } = await withRetry(
      () => supabase.from('submissions').update({ grade, feedback: g.feedback, status: 'graded' }).eq('id', sub.id),
      { retries: 3, onRetry: ({ attempt }) => toast.loading(`Mencoba lagi... (${attempt}/3)`, { id: 'retry-grade' }) }
    )
    toast.dismiss('retry-grade')
    if (error) toast.error('Gagal menyimpan nilai — coba lagi')
    else { toast.success(`Nilai ${grade} tersimpan`); fetchData() }
    setGrading(p => ({ ...p, [selected]: { ...p[selected], saving: false } }))
  }

  async function requestRevision() {
    const sub = submissions.find(s => s.student_id === selected)
    if (!sub) return
    const g = grading[selected]
    if (!g?.feedback?.trim()) { toast.error('Isi catatan revisi sebelum meminta revisi'); return }
    setGrading(p => ({ ...p, [selected]: { ...p[selected], saving: true } }))
    const { error } = await supabase.from('submissions')
      .update({ feedback: g.feedback, status: 'revision', grade: null })
      .eq('id', sub.id)
    if (error) toast.error('Gagal meminta revisi')
    else { toast.success('Permintaan revisi dikirim ke mahasiswa'); fetchData() }
    setGrading(p => ({ ...p, [selected]: { ...p[selected], saving: false } }))
  }

  // Build unified student list (submitted + not submitted)
  const submittedMap = Object.fromEntries(submissions.map(s => [s.student_id, s]))
  const allStudents = enrolled.map(e => ({
    student_id: e.student_id,
    student:    e.student,
    sub:        submittedMap[e.student_id] || null,
  }))
  // Dedupe (some enrolled may already be in subs)
  const seen = new Set(enrolled.map(e => e.student_id))
  submissions.forEach(s => { if (!seen.has(s.student_id)) { seen.add(s.student_id); allStudents.push({ student_id: s.student_id, student: s.student, sub: s }) } })

  const filtered = allStudents.filter(r => {
    const name = r.student?.full_name?.toLowerCase() || ''
    if (search && !name.includes(search.toLowerCase())) return false
    if (filter === 'ungraded')  return r.sub && r.sub.status !== 'graded' && r.sub.status !== 'revision'
    if (filter === 'graded')    return r.sub?.status === 'graded'
    if (filter === 'revision')  return r.sub?.status === 'revision'
    if (filter === 'missing')   return !r.sub
    return true
  })

  const selectedRow = filtered.find(r => r.student_id === selected) || filtered[0]
  const selectedSub = selectedRow?.sub || null
  const g = grading[selected] || { grade: '', feedback: '' }
  const selIdx = filtered.findIndex(r => r.student_id === selected)

  function navigate(dir) {
    const next = filtered[selIdx + dir]
    if (next) setSelected(next.student_id)
  }

  const counts = {
    all:      allStudents.length,
    ungraded: allStudents.filter(r => r.sub && r.sub.status !== 'graded' && r.sub.status !== 'revision').length,
    graded:   allStudents.filter(r => r.sub?.status === 'graded').length,
    revision: allStudents.filter(r => r.sub?.status === 'revision').length,
    missing:  allStudents.filter(r => !r.sub).length,
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:940, width:'96vw', height:'82vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div className="modal-header" style={{ flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Star size={16} color="var(--indigo-600)"/>
            <span className="modal-title">Penilaian — {assignment.title}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--gray-400)' }}>{counts.graded}/{counts.all} dinilai</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
          </div>
        </div>

        {loading ? <div className="spinner" style={{ margin:'60px auto' }}/> : (
          <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

            {/* ── LEFT: Student List ── */}
            <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--gray-200)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {/* Search */}
              <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--gray-100)' }}>
                <div style={{ position:'relative' }}>
                  <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }}/>
                  <input className="input" style={{ paddingLeft:28, fontSize:12, height:32 }} placeholder="Cari mahasiswa..." value={search} onChange={e => setSearch(e.target.value)}/>
                </div>
              </div>
              {/* Filter tabs */}
              <div style={{ display:'flex', gap:2, padding:'6px 10px', borderBottom:'1px solid var(--gray-100)', flexWrap:'wrap' }}>
                {[
                  { key:'all',      label:`Semua (${counts.all})` },
                  { key:'ungraded', label:`Belum (${counts.ungraded})` },
                  { key:'graded',   label:`Dinilai (${counts.graded})` },
                  { key:'revision', label:`Revisi (${counts.revision})` },
                  { key:'missing',  label:`Kosong (${counts.missing})` },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:12, border:'none', cursor:'pointer',
                      background: filter===f.key ? 'var(--indigo-600)' : 'var(--gray-100)',
                      color:      filter===f.key ? '#fff'              : 'var(--gray-500)',
                    }}>{f.label}</button>
                ))}
              </div>
              {/* Student rows */}
              <div style={{ flex:1, overflowY:'auto' }}>
                {filtered.length === 0 && <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Tidak ada mahasiswa</div>}
                {filtered.map((row, _i) => {
                  const isActive  = row.student_id === selected
                  const isGraded  = row.sub?.status === 'graded'
                  const hasSub    = !!row.sub
                      const isRevision = row.sub?.status === 'revision'
                      return (
                        <div key={row.student_id} onClick={() => setSelected(row.student_id)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--gray-100)',
                            background: isActive ? (isRevision ? '#fff7ed' : 'var(--indigo-50)') : 'transparent',
                            borderLeft: isActive ? `3px solid ${isRevision ? '#f97316' : 'var(--indigo-600)'}` : '3px solid transparent',
                            transition:'all .1s',
                          }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12,
                            background: isGraded ? '#dcfce7' : isRevision ? '#ffedd5' : hasSub ? 'var(--indigo-100)' : 'var(--gray-100)',
                            color:      isGraded ? '#16a34a' : isRevision ? '#ea580c' : hasSub ? 'var(--indigo-700)' : 'var(--gray-400)',
                          }}>
                        {row.student?.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isActive ? 'var(--indigo-700)' : 'var(--gray-800)' }}>
                          {row.student?.full_name || 'Tidak diketahui'}
                        </div>
                        <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:1 }}>
                          {row.student?.nim || ''}
                        </div>
                      </div>
                      <div style={{ flexShrink:0 }}>
                        {isGraded   && <span style={{ fontSize:11, fontWeight:700, color:'#16a34a' }}>{row.sub.grade}</span>}
                        {isRevision && !isGraded && <span style={{ fontSize:10, fontWeight:700, color:'#ea580c' }}>Revisi</span>}
                        {!isGraded && !isRevision && hasSub  && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--indigo-500)', display:'block' }}/>}
                        {!hasSub && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--gray-300)', display:'block' }}/>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── RIGHT: Grading Form ── */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {!selectedRow ? (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gray-400)', fontSize:13 }}>
                  Pilih mahasiswa di sebelah kiri
                </div>
              ) : (
                <>
                  {/* Student info bar */}
                  <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--gray-200)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:14, color:'var(--gray-900)' }}>{selectedRow.student?.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:1 }}>
                        {selectedRow.student?.nim && `NIM: ${selectedRow.student.nim} · `}
                        {selectedSub ? `Dikumpulkan: ${fmt(selectedSub.submitted_at)}` : 'Belum mengumpulkan'}
                      </div>
                    </div>
                    {selectedSub?.status === 'graded' && (
                      <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#16a34a', background:'#dcfce7', padding:'4px 12px', borderRadius:20 }}>
                        <CheckCircle2 size={13}/> Nilai: {selectedSub.grade}/{assignment.max_score}
                      </span>
                    )}
                    {selectedSub && !selectedSub.status !== 'graded' && !selectedSub.grade && (
                      <span className="badge-pill badge-indigo">Menunggu penilaian</span>
                    )}
                    {!selectedSub && <span className="badge-pill badge-slate">Belum mengumpulkan</span>}
                    {/* Navigation */}
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(-1)} disabled={selIdx <= 0} title="Sebelumnya"><ChevronLeft size={14}/></button>
                      <span style={{ fontSize:11, color:'var(--gray-400)', alignSelf:'center', minWidth:40, textAlign:'center' }}>{selIdx+1}/{filtered.length}</span>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(1)} disabled={selIdx >= filtered.length-1} title="Berikutnya"><ChevronRight size={14}/></button>
                    </div>
                  </div>

                  {/* Form body */}
                  <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
                    {selectedSub ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                        {/* File */}
                        <div style={{ background:'var(--gray-50)', border:'1px solid var(--gray-200)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                          <FileText size={16} color="var(--indigo-500)"/>
                          <span style={{ flex:1, fontSize:13, color:'var(--gray-700)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {selectedSub.file_name || 'File Tugas'}
                          </span>
                          <a href={selectedSub.webview_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ gap:4, flexShrink:0 }}>
                            <Eye size={12}/> Buka File
                          </a>
                        </div>

                        {/* Grade */}
                        <div>
                          <label style={{ fontSize:12, fontWeight:700, color:'var(--gray-700)', display:'block', marginBottom:8 }}>
                            Nilai <span style={{ fontWeight:400, color:'var(--gray-400)' }}>(0 – {assignment.max_score})</span>
                          </label>
                          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <input className="input" type="number" min={0} max={assignment.max_score} placeholder="0"
                              value={g.grade}
                              onChange={e => setGrading(p => ({ ...p, [selected]: { ...p[selected], grade: e.target.value } }))}
                              style={{ width:100, textAlign:'center', fontSize:28, fontWeight:800, height:56 }}/>
                            <span style={{ fontSize:18, color:'var(--gray-300)', fontWeight:300 }}>/</span>
                            <span style={{ fontSize:28, fontWeight:800, color:'var(--gray-300)' }}>{assignment.max_score}</span>
                            {/* Quick grade presets */}
                            <div style={{ display:'flex', gap:4, marginLeft:'auto', flexWrap:'wrap' }}>
                              {[100, 90, 80, 70, 60].map(v => (
                                <button key={v} onClick={() => setGrading(p => ({ ...p, [selected]: { ...p[selected], grade: v } }))}
                                  style={{ padding:'4px 10px', borderRadius:8, border:'1px solid var(--gray-300)', background: Number(g.grade)===v ? 'var(--indigo-600)' : '#fff',
                                    color: Number(g.grade)===v ? '#fff' : 'var(--gray-600)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Feedback */}
                        <div>
                          <label style={{ fontSize:12, fontWeight:700, color:'var(--gray-700)', display:'block', marginBottom:8 }}>Feedback / Komentar</label>
                          <textarea className="input" rows={4} style={{ resize:'vertical', fontSize:13 }}
                            placeholder="Tulis komentar atau masukan untuk mahasiswa..."
                            value={g.feedback}
                            onChange={e => setGrading(p => ({ ...p, [selected]: { ...p[selected], feedback: e.target.value } }))}/>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--gray-400)', gap:8 }}>
                        <span style={{ fontSize:36 }}>📭</span>
                        <div style={{ fontSize:14, fontWeight:600 }}>Belum ada pengumpulan</div>
                        <div style={{ fontSize:12 }}>Mahasiswa ini belum mengumpulkan tugas</div>
                      </div>
                    )}
                  </div>

                  {/* Save footer */}
                  {selectedSub && (
                    <div style={{ padding:'12px 20px', borderTop:'1px solid var(--gray-200)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                      <span style={{ fontSize:12, color:'var(--gray-400)' }}>
                        {selIdx+1} dari {filtered.length} mahasiswa
                      </span>
                      <div style={{ display:'flex', gap:8 }}>
                        <button
                          className="btn btn-sm"
                          onClick={requestRevision}
                          disabled={g.saving}
                          style={{ background:'#fff7ed', color:'#ea580c', border:'1px solid #fed7aa' }}
                        >
                          ↩ Minta Revisi
                        </button>
                        {selIdx < filtered.length - 1 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => { saveGrade(); setTimeout(() => navigate(1), 400) }}>
                            Simpan & Lanjut →
                          </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={saveGrade} disabled={g.saving}>
                          {g.saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Star size={13}/>}
                          Simpan Nilai
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────── */
export default function DosenTugasManager() {
  const { user } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const [searchParams] = useSearchParams()
  const [courses,     setCourses]     = useState([])
  const [courseId,    setCourseId]    = useState('')
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [modal,       setModal]       = useState(false)
  const [gradeTarget, setGradeTarget] = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(BLANK)
  const cpmkKursus = useCpmkKursus(courseId)

  useEffect(() => { if (user) fetchCourses() }, [user])
  useEffect(() => { if (courseId) fetchAssignments() }, [courseId])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,code,name').eq('dosen_id', user.id).order('name')
    setCourses(data || [])
    const paramId = searchParams.get('courseId')
    const match   = paramId && data?.find(c => c.id === paramId)
    setCourseId(match ? paramId : (data?.[0]?.id || ''))
  }

  async function fetchAssignments() {
    setLoading(true)
    const { data } = await supabase.from('assignments')
      .select('*, submissions(count)')
      .eq('course_id', courseId)
      .order('due_date', { ascending: true, nullsFirst: false })
    setAssignments(data || [])
    setLoading(false)
  }

  function openNew()   { setForm(BLANK); setEditing(null); setModal(true) }
  function openEdit(a) {
    setForm({ title:a.title, description:a.description||'', max_score:a.max_score, allow_late_submission:a.allow_late_submission, due_date:a.due_date?a.due_date.slice(0,16):'',
      estimasi_menit: a.estimasi_menit ?? null, cpmk_kode: a.cpmk_kode || [] })
    setEditing(a.id); setModal(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Judul wajib diisi'); return }
    setSaving(true)
    const payload = { ...form, course_id:courseId, created_by:user.id, due_date:form.due_date?new Date(form.due_date).toISOString():null }
    let error
    if (editing) { ;({ error } = await supabase.from('assignments').update(payload).eq('id', editing)) }
    else         { ;({ error } = await supabase.from('assignments').insert(payload)) }
    if (error) toast.error('Gagal menyimpan: ' + error.message)
    else { toast.success(editing ? 'Tugas diperbarui' : 'Tugas ditambahkan'); setModal(false); fetchAssignments() }
    setSaving(false)
  }

  async function handleDelete(id) {
    const ok = await showConfirm({
      title: 'Hapus Tugas?',
      message: 'Semua pengumpulan mahasiswa akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('assignments').delete().eq('id', id)
    toast('Tugas dihapus', { icon:'🗑️' })
    fetchAssignments()
  }

  function statusBadge(due) {
    if (!due) return null
    const d = new Date(due), now = new Date()
    if (d < now) return <span className="badge-pill badge-red">Lewat</span>
    const diff = (d - now)/(1000*60*60*24)
    if (diff < 2) return <span className="badge-pill badge-amber">Segera</span>
    return <span className="badge-pill badge-indigo">Aktif</span>
  }

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Kelola Tugas</h1>
          <p className="page-subtitle">Buat dan kelola tugas mahasiswa</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} disabled={!courseId}>
          <Plus size={14}/> Tambah Tugas
        </button>
      </div>

      <CoursePicker courses={courses} courseId={courseId} onChange={setCourseId} />


      {loading ? <div className="spinner" style={{ margin:'40px auto' }}/> :
       assignments.length === 0 ? (
        <div className="empty-state card" style={{ padding:48 }}>
          <ClipboardList size={36} color="var(--gray-300)"/>
          <p className="empty-state-text">Belum ada tugas</p>
          <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={13}/> Tambah</button>
        </div>
       ) : (
        <div className="card">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--gray-50)', borderBottom:'1px solid var(--gray-200)' }}>
                {['Judul Tugas','Deadline','Nilai Maks','Pengumpulan','Status','Aksi'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: i<assignments.length-1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.title}</div>
                    {a.description && <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2, maxWidth:280, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{a.description}</div>}
                    {a.allow_late_submission && <span className="badge-pill badge-slate" style={{ marginTop:4 }}>Terlambat diizinkan</span>}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--gray-600)' }}>
                      <Clock size={11}/> {fmt(a.due_date)}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, fontWeight:600 }}>{a.max_score}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <button
                      onClick={() => setGradeTarget(a)}
                      style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--indigo-600)', background:'var(--indigo-50)', border:'none', borderRadius:20, padding:'4px 12px', cursor:'pointer', fontWeight:600, transition:'all .15s' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--indigo-100)'}
                      onMouseLeave={e => e.currentTarget.style.background='var(--indigo-50)'}
                    >
                      <Users size={11}/> {a.submissions?.[0]?.count || 0} mahasiswa
                    </button>
                  </td>
                  <td style={{ padding:'12px 16px' }}>{statusBadge(a.due_date)}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setGradeTarget(a)} style={{ gap:4, color:'var(--indigo-600)' }} title="Nilai Mahasiswa">
                        <Star size={13}/> Nilai
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(a)} title="Edit"><Edit2 size={13}/></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(a.id)} title="Hapus"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grading Modal */}
      {gradeTarget && (
        <GradingPanel
          assignment={{ ...gradeTarget, course_id: courseId }}
          onClose={() => { setGradeTarget(null); fetchAssignments() }}
        />
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <ClipboardList size={16} color="var(--indigo-600)"/>
                <span className="modal-title">{editing ? 'Edit' : 'Tambah'} Tugas</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Judul Tugas *</label>
                <input className="input" placeholder="cth: Laporan Praktikum 1" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Deskripsi / Petunjuk</label>
                <textarea className="input" rows={3} style={{ resize:'vertical' }} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))}/>
              </div>
              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label">Nilai Maksimum</label>
                  <input className="input" type="number" min={0} max={1000} value={form.max_score} onChange={e => setForm(f=>({...f,max_score:+e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Batas Waktu</label>
                  <input className="input" type="datetime-local" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))}/>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                <input type="checkbox" id="late-sub" checked={form.allow_late_submission} onChange={e => setForm(f=>({...f,allow_late_submission:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--indigo-600)' }}/>
                <label htmlFor="late-sub" style={{ fontSize:13, cursor:'pointer' }}>Izinkan pengumpulan terlambat</label>
              </div>
              <BebanBelajarFields
                value={form}
                onChange={(v) => setForm(f => ({ ...f, estimasi_menit: v.estimasi_menit, cpmk_kode: v.cpmk_kode }))}
                cpmkList={cpmkKursus}
                petunjukMenit="Waktu rata-rata peserta mengerjakan tugas ini, termasuk membaca instruksi dan menyusun laporan."
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/>}
                {editing ? 'Simpan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
