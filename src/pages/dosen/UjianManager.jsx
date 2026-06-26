import { useState, useEffect } from 'react'
import { FileQuestion, Plus, Edit2, Trash2, X, Loader2, ChevronDown, Clock, Eye, EyeOff, Database, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useNavigate, useSearchParams } from 'react-router-dom'

const EXAM_MODES = [
  { value:'ujian',   label:'Ujian',    desc:'1 kali percobaan, dosen input nilai',   color:'#4f46e5' },
  { value:'tryout',  label:'Try Out',  desc:'Maks N percobaan, auto-graded',          color:'#0891b2' },
  { value:'quiz',    label:'Quiz',     desc:'Percobaan tak terbatas, auto-graded',    color:'#7c3aed' },
]

const BLANK = { title: '', type: 'kuis', duration_minutes: 90, start_at: '', end_at: '', is_published: false, use_question_bank: false, question_config: [], exam_mode: 'ujian', max_attempts: 5, passing_grade: 70 }

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function DosenUjianManager() {
  const { user } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [courses,  setCourses]  = useState([])
  const [courseId, setCourseId] = useState('')
  const [exams,    setExams]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [form,        setForm]        = useState(BLANK)
  const [hasilTarget, setHasilTarget] = useState(null)
  const [hasilData,   setHasilData]   = useState([])
  const [hasilLoad,   setHasilLoad]   = useState(false)
  const [topics,      setTopics]      = useState([])  // available topics in bank soal
  const [bankCounts,  setBankCounts]  = useState({})  // { topicName: {mudah,sedang,sulit} }

  useEffect(() => { if (user) fetchCourses() }, [user])
  useEffect(() => { if (courseId) fetchExams() }, [courseId])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,code,name').eq('dosen_id', user.id).order('name')
    setCourses(data || [])
    const paramId = searchParams.get('courseId')
    const match   = paramId && data?.find(c => c.id === paramId)
    setCourseId(match ? paramId : (data?.[0]?.id || ''))
  }

  async function fetchExams() {
    setLoading(true)
    const { data } = await supabase
      .from('exams')
      .select('*, exam_answers(count)')
      .eq('course_id', courseId)
      .order('start_at', { ascending: true, nullsFirst: false })
    setExams(data || [])
    setLoading(false)
  }

  async function fetchTopics(cid) {
    const { data } = await supabase
      .from('questions')
      .select('category, difficulty')
      .eq('course_id', cid)
      .not('category', 'is', null)
    const unique = [...new Set((data || []).map(q => q.category).filter(Boolean))].sort()
    setTopics(unique)
    // Build counts map: { topicName: { mudah: N, sedang: N, sulit: N } }
    const counts = {}
    ;(data || []).forEach(q => {
      if (!q.category) return
      if (!counts[q.category]) counts[q.category] = { mudah:0, sedang:0, sulit:0 }
      if (q.difficulty in counts[q.category]) counts[q.category][q.difficulty]++
    })
    setBankCounts(counts)
  }

  async function openHasil(exam) {
    setHasilTarget(exam)
    setHasilLoad(true)
    const { data: ans } = await supabase
      .from('exam_answers')
      .select('id, student_id, score, submitted_at, started_at, attempt_number')
      .eq('exam_id', exam.id)
      .not('submitted_at', 'is', null)
      .order('student_id').order('attempt_number', { ascending: true })
    const ids = [...new Set((ans || []).map(a => a.student_id))]
    let profiles = {}
    if (ids.length) {
      const { data: pr } = await supabase.from('profiles').select('id,full_name,nim,email').in('id', ids)
      pr?.forEach(p => { profiles[p.id] = p })
    }
    // Group by student
    const grouped = {}
    ;(ans || []).forEach(a => {
      if (!grouped[a.student_id]) grouped[a.student_id] = { student: profiles[a.student_id]||null, attempts: [] }
      grouped[a.student_id].attempts.push(a)
    })
    setHasilData(Object.values(grouped))
    setHasilLoad(false)
  }

  function openNew() {
    setForm(BLANK); setEditing(null); setModal(true)
    fetchTopics(courseId)
  }
  function openEdit(e) {
    const cfg = e.question_config
    setForm({
      title: e.title, type: e.type, duration_minutes: e.duration_minutes,
      is_published: e.is_published,
      start_at: e.start_at ? e.start_at.slice(0,16) : '',
      end_at:   e.end_at   ? e.end_at.slice(0,16)   : '',
      use_question_bank: e.use_question_bank || false,
      question_config: Array.isArray(cfg) ? cfg : [],
      exam_mode:    e.exam_mode    || 'ujian',
      max_attempts: e.max_attempts || 5,
      passing_grade: e.passing_grade || 70,
    })
    setEditing(e.id); setModal(true)
    fetchTopics(courseId)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Judul wajib diisi'); return }
    if (form.use_question_bank) {
      if (!form.question_config.length) { toast.error('Tambahkan minimal 1 topik bank soal'); return }
      if (form.question_config.some(r => !r.topic)) { toast.error('Pilih topik untuk setiap baris'); return }
      const total = form.question_config.reduce((s,r) => s+(r.mudah||0)+(r.sedang||0)+(r.sulit||0), 0)
      if (!total) { toast.error('Jumlah soal total minimal 1'); return }
    }
    setSaving(true)
    const payload = {
      ...form,
      course_id:  courseId,
      created_by: user.id,
      start_at:   form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at:     form.end_at   ? new Date(form.end_at).toISOString()   : null,
    }
    let error
    if (editing) {
      ;({ error } = await supabase.from('exams').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('exams').insert(payload))
    }
    if (error) toast.error('Gagal menyimpan: ' + error.message)
    else { toast.success(editing ? 'Ujian diperbarui' : 'Ujian ditambahkan'); setModal(false); fetchExams() }
    setSaving(false)
  }

  async function togglePublish(exam) {
    await supabase.from('exams').update({ is_published: !exam.is_published }).eq('id', exam.id)
    toast.success(exam.is_published ? 'Ujian disembunyikan' : 'Ujian dipublikasikan')
    fetchExams()
  }

  async function handleDelete(id) {
    const ok = await showConfirm({
      title: 'Hapus Ujian?',
      message: 'Semua jawaban mahasiswa akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('exams').delete().eq('id', id)
    toast('Ujian dihapus', { icon: '🗑️' })
    fetchExams()
  }

  const EXAM_TYPES = [
    { value:'kuis', label:'Kuis', color:'badge-indigo' },
    { value:'uts',  label:'UTS',  color:'badge-amber'  },
    { value:'uas',  label:'UAS',  color:'badge-red'    },
  ]
  const typeInfo = t => EXAM_TYPES.find(x => x.value === t) || EXAM_TYPES[0]

  function examStatus(exam) {
    if (!exam.is_published) return <span className="badge-pill badge-slate">Draft</span>
    const now = new Date()
    if (exam.start_at && new Date(exam.start_at) > now) return <span className="badge-pill badge-amber">Belum Dimulai</span>
    if (exam.end_at   && new Date(exam.end_at)   < now) return <span className="badge-pill badge-red">Selesai</span>
    return <span className="badge-pill badge-indigo">Berlangsung</span>
  }

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Kelola Ujian</h1>
          <p className="page-subtitle">Atur jadwal dan soal ujian</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} disabled={!courseId}>
          <Plus size={14}/> Tambah Ujian
        </button>
      </div>

      {/* Course Selector */}
      <div className="card" style={{ padding:'12px 16px', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--gray-600)', flexShrink:0 }}>Mata Kuliah:</label>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <select className="input" value={courseId} onChange={e => setCourseId(e.target.value)}>
              {courses.length === 0 && <option value="">Belum ada mata kuliah</option>}
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
            </select>
            <ChevronDown size={13} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--gray-400)' }}/>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="spinner" style={{ margin:'40px auto' }}/>
      ) : exams.length === 0 ? (
        <div className="empty-state card" style={{ padding:48 }}>
          <FileQuestion size={36} color="var(--gray-300)"/>
          <p className="empty-state-text">Belum ada ujian</p>
          <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={13}/> Tambah</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {exams.map(e => {
            const ti = typeInfo(e.type)
            return (
              <div key={e.id} className="card" style={{ padding:'14px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{
                    width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    background: e.type==='uas' ? '#fef2f2' : e.type==='uts' ? '#fffbeb' : '#eef2ff',
                  }}>
                    <FileQuestion size={18} color={e.type==='uas' ? '#dc2626' : e.type==='uts' ? '#d97706' : '#4f46e5'}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span className={`badge-pill ${ti.color}`}>{ti.label}</span>
                      {examStatus(e)}
                      <span style={{ fontSize:11, color:'var(--gray-400)' }}>{e.duration_minutes} menit</span>
                      {/* Mode badge */}
                      {(() => {
                        const m = e.exam_mode || 'ujian'
                        const mc = m==='tryout'?'#0891b2':m==='quiz'?'#7c3aed':'var(--indigo-600)'
                        const mb = m==='tryout'?'#e0f2fe':m==='quiz'?'#f3e8ff':'#eef2ff'
                        const ml = m==='tryout'?'Try Out':m==='quiz'?'Quiz':'Ujian'
                        return <span style={{ fontSize:11, fontWeight:700, background:mb, color:mc, padding:'2px 8px', borderRadius:20 }}>{ml}{m==='tryout'?` ·${e.max_attempts||5}×`:''}</span>
                      })()}
                      {e.use_question_bank && (
                        <span style={{ fontSize:11, fontWeight:700, background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:20 }}>
                          <Database size={10} style={{ marginRight:3 }}/>Bank Soal
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight:700, fontSize:14, marginTop:3 }}>{e.title}</div>
                    <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2, display:'flex', gap:12 }}>
                      <span><Clock size={10} style={{ marginRight:3 }}/>Mulai: {fmt(e.start_at)}</span>
                      <span>Selesai: {fmt(e.end_at)}</span>
                      <span>{e.exam_answers?.[0]?.count || 0} peserta</span>
                      {e.use_question_bank && e.question_config && (() => {
                        const cfg = e.question_config
                        const total = Array.isArray(cfg)
                          ? cfg.reduce((s,r) => s+(r.mudah||0)+(r.sedang||0)+(r.sulit||0), 0)
                          : (cfg.mudah||0)+(cfg.sedang||0)+(cfg.sulit||0)
                        return <span>{total} soal · {Array.isArray(cfg) ? `${cfg.length} topik` : ''}</span>
                      })()}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button className="btn btn-ghost btn-sm" style={{ gap:4, color:'var(--success)' }} onClick={() => openHasil(e)} title="Lihat hasil mahasiswa">
                      <Users size={13}/> Hasil
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ gap:4, color:'#6d28d9' }} onClick={() => navigate('/bank-soal')} title="Bank Soal Mata Kuliah">
                      <Database size={13}/> Bank Soal
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ gap:4, color: e.is_published ? 'var(--warning)' : 'var(--success)' }}
                      onClick={() => togglePublish(e)}
                      title={e.is_published ? 'Sembunyikan' : 'Publikasikan'}
                    >
                      {e.is_published ? <EyeOff size={13}/> : <Eye size={13}/>}
                      {e.is_published ? 'Sembunyikan' : 'Publikasikan'}
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(e)}><Edit2 size={13}/></button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(e.id)}><Trash2 size={13}/></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
        <div className="modal" style={{ maxWidth:600, width:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <FileQuestion size={16} color="var(--indigo-600)"/>
                <span className="modal-title">{editing ? 'Edit' : 'Tambah'} Ujian</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ overflowY:'auto', flex:1 }}>
              <div className="form-grid form-grid-2">
                <div className="input-group" style={{ gridColumn:'span 2' }}>
                  <label className="input-label">Judul Ujian *</label>
                  <input className="input" placeholder="cth: UTS Sistem Operasi" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Jenis Ujian</label>
                  <select className="input" value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
                    {[{value:'kuis',label:'Kuis'},{value:'uts',label:'UTS'},{value:'uas',label:'UAS'}].map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {/* Mode selector */}
                <div className="input-group">
                  <label className="input-label">Mode Pengerjaan</label>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                    {EXAM_MODES.map(m => (
                      <button key={m.value} type="button"
                        onClick={() => setForm(f => ({ ...f, exam_mode: m.value, max_attempts: m.value==='tryout' ? (f.max_attempts||5) : m.value==='quiz' ? 999 : 1 }))}
                        style={{ padding:'8px 6px', borderRadius:8, border:`2px solid ${form.exam_mode===m.value ? m.color : 'var(--gray-200)'}`, background: form.exam_mode===m.value ? m.color+'15' : '#fff', cursor:'pointer', textAlign:'center' }}>
                        <div style={{ fontSize:12, fontWeight:800, color: form.exam_mode===m.value ? m.color : 'var(--gray-600)' }}>{m.label}</div>
                        <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:2, lineHeight:1.3 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {form.exam_mode === 'tryout' && (
                  <div className="input-group">
                    <label className="input-label">Maks Percobaan</label>
                    <input className="input" type="number" min={2} max={20} value={form.max_attempts}
                      onChange={e => setForm(f => ({ ...f, max_attempts: +e.target.value }))}/>
                  </div>
                )}
                <div className="input-group">
                  <label className="input-label">Durasi (menit)</label>
                  <input className="input" type="number" min={10} max={300} value={form.duration_minutes} onChange={e => setForm(f=>({...f,duration_minutes:+e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Passing Grade</label>
                  <input className="input" type="number" min={0} max={100} value={form.passing_grade ?? 70} onChange={e => setForm(f=>({...f,passing_grade:+e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Waktu Mulai</label>
                  <input className="input" type="datetime-local" value={form.start_at} onChange={e => setForm(f=>({...f,start_at:e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label">Waktu Selesai</label>
                  <input className="input" type="datetime-local" value={form.end_at} onChange={e => setForm(f=>({...f,end_at:e.target.value}))}/>
                </div>
              </div>
              {/* Question bank toggle */}
              <div style={{ background:'var(--gray-50)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--gray-200)', marginTop:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: form.use_question_bank ? 14 : 0 }}>
                  <input type="checkbox" id="use-bank" checked={form.use_question_bank}
                    onChange={e => setForm(f => ({ ...f, use_question_bank: e.target.checked, question_config: [] }))}
                    style={{ width:16, height:16, accentColor:'var(--indigo-600)' }}/>
                  <label htmlFor="use-bank" style={{ fontSize:13, cursor:'pointer', fontWeight:600 }}>
                    <Database size={13} style={{ display:'inline', marginRight:4, color:'#6d28d9' }}/>
                    Gunakan Bank Soal (soal random per mahasiswa)
                  </label>
                </div>

                {form.use_question_bank && (
                  <div>
                    {topics.length === 0 && (
                      <div style={{ fontSize:12, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>
                        ⚠️ Belum ada topik di bank soal untuk mata kuliah ini. Tambahkan soal di menu <strong>Bank Soal</strong> terlebih dahulu.
                      </div>
                    )}

                    {/* Header */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px 28px', gap:6, marginBottom:6, padding:'0 2px' }}>
                      {['Topik','Mudah','Sedang','Sulit',''].map(h => (
                        <div key={h} style={{ fontSize:10, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:'.5px' }}>{h}</div>
                      ))}
                    </div>

                    {/* Topic rows */}
                    {form.question_config.map((row, idx) => {
                      const counts = (row.topic && bankCounts[row.topic]) || { mudah:0, sedang:0, sulit:0 }
                      const diffColors = { mudah:'#16a34a', sedang:'#ca8a04', sulit:'#dc2626' }
                      const diffBorderColors = { mudah:'#86efac', sedang:'#fde047', sulit:'#fca5a5' }
                      return (
                        <div key={idx} style={{ marginBottom:8 }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px 28px', gap:6, alignItems:'center' }}>
                            <select className="input" style={{ fontSize:12 }} value={row.topic}
                              onChange={e => setForm(f => { const q=[...f.question_config]; q[idx]={...q[idx],topic:e.target.value}; return {...f,question_config:q} })}>
                              <option value="">-- Pilih Topik --</option>
                              {topics.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            {['mudah','sedang','sulit'].map(d => {
                              const avail = counts[d]
                              const need  = row[d] || 0
                              const short = need > avail
                              return (
                                <div key={d} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                  <input className="input" type="number" min={0} max={999} value={need}
                                    style={{ textAlign:'center', fontWeight:700, padding:'6px 4px',
                                      borderColor: short && need > 0 ? '#f97316' : diffBorderColors[d] }}
                                    onChange={e => setForm(f => { const q=[...f.question_config]; q[idx]={...q[idx],[d]:+e.target.value}; return {...f,question_config:q} })}/>
                                  {row.topic && (
                                    <div style={{ fontSize:9, textAlign:'center', color: short && need > 0 ? '#f97316' : diffColors[d], fontWeight:700, lineHeight:1 }}>
                                      {short && need > 0 ? `⚠ ${avail}` : `✓ ${avail}`} ada
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            <button type="button" onClick={() => setForm(f => ({ ...f, question_config: f.question_config.filter((_,i)=>i!==idx) }))}
                              style={{ width:26, height:26, borderRadius:6, border:'1px solid var(--gray-200)', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--danger)', alignSelf:'start' }}>
                              <X size={12}/>
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Add row button */}
                    <button type="button" onClick={() => setForm(f => ({ ...f, question_config: [...f.question_config, {topic:'',mudah:0,sedang:0,sulit:0}] }))}
                      style={{ fontSize:12, fontWeight:600, color:'var(--indigo-600)', background:'#eef2ff', border:'1px dashed #a5b4fc', borderRadius:8, padding:'6px 14px', cursor:'pointer', width:'100%', marginTop:4 }}>
                      + Tambah Topik
                    </button>

                    {/* Total */}
                    {form.question_config.length > 0 && (
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:8, display:'flex', gap:16 }}>
                        <span>Total: <strong style={{ color:'var(--indigo-600)' }}>
                          {form.question_config.reduce((s,r)=>s+(r.mudah||0)+(r.sedang||0)+(r.sulit||0),0)}
                        </strong> soal dari <strong>{form.question_config.length}</strong> topik</span>
                        <span style={{ color:'#6d28d9' }}>Setiap mahasiswa mendapat soal random yang berbeda</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                <input type="checkbox" id="pub" checked={form.is_published} onChange={e => setForm(f=>({...f,is_published:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--indigo-600)' }}/>
                <label htmlFor="pub" style={{ fontSize:13, cursor:'pointer' }}>Langsung publikasikan ke mahasiswa</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : null}
                {editing ? 'Simpan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hasil Ujian Modal ── */}
      {hasilTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:720, width:'96vw' }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Users size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Hasil: {hasilTarget.title}</span>
                {(() => { const m=hasilTarget.exam_mode||'ujian'; const mc=m==='tryout'?'#0891b2':m==='quiz'?'#7c3aed':'#4f46e5'; const mb=m==='tryout'?'#e0f2fe':m==='quiz'?'#f3e8ff':'#eef2ff'; return <span style={{fontSize:11,fontWeight:700,background:mb,color:mc,padding:'2px 8px',borderRadius:20,marginLeft:4}}>{m==='tryout'?'Try Out':m==='quiz'?'Quiz':'Ujian'}</span> })()}
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setHasilTarget(null)}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ maxHeight:'65vh', overflowY:'auto' }}>
              {hasilLoad ? (
                <div className="spinner" style={{ margin:'32px auto' }}/>
              ) : hasilData.length === 0 ? (
                <div style={{ textAlign:'center', padding:32 }}>
                  <Users size={32} color="var(--gray-300)" style={{ margin:'0 auto 12px' }}/>
                  <p style={{ color:'var(--gray-400)', fontSize:14 }}>Belum ada mahasiswa yang mengumpulkan.</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {hasilData.map((row, i) => {
                    const best = Math.max(...row.attempts.map(a => a.score ?? 0))
                    const sc = s => s >= 80 ? '#16a34a' : s >= 60 ? '#ca8a04' : '#dc2626'
                    return (
                      <div key={row.student?.id || i} className="card" style={{ padding:0, overflow:'hidden' }}>
                        {/* Student header */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', background:'var(--gray-50)', borderBottom:'1px solid var(--gray-100)' }}>
                          <span style={{ fontSize:13, fontWeight:700, flex:1 }}>{row.student?.full_name || 'Unknown'}</span>
                          <span style={{ fontSize:11, color:'var(--gray-400)' }}>{row.student?.nim || ''}</span>
                          <span style={{ fontSize:11, color:'var(--gray-400)' }}>{row.attempts.length} percobaan</span>
                          <span style={{ fontSize:13, fontWeight:800, color: sc(best) }}>Terbaik: {best}</span>
                        </div>
                        {/* Attempt rows */}
                        {row.attempts.map((a, ai) => {
                          const dur = a.submitted_at && a.started_at
                            ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : null
                          const isBest = a.score === best
                          return (
                            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'7px 14px 7px 24px', borderBottom: ai < row.attempts.length-1 ? '1px solid var(--gray-100)' : 'none', background: isBest ? '#f0fdf4' : '#fff' }}>
                              <span style={{ fontSize:11, color:'var(--gray-400)', width:80, flexShrink:0 }}>Percobaan {a.attempt_number ?? ai+1}</span>
                              <span style={{ fontSize:14, fontWeight:800, color: sc(a.score ?? 0), width:40 }}>{a.score ?? '—'}</span>
                              <span style={{ fontSize:11, color:'var(--gray-400)', flex:1 }}>
                                {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}
                              </span>
                              <span style={{ fontSize:11, color:'var(--gray-400)' }}>{dur !== null ? `${dur} mnt` : ''}</span>
                              {isBest && <span style={{ fontSize:10, fontWeight:800, background:'#dcfce7', color:'#16a34a', padding:'2px 8px', borderRadius:20 }}>Terbaik</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--gray-400)' }}>{hasilData.length} mahasiswa · {hasilData.reduce((s,r)=>s+r.attempts.length,0)} total percobaan</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setHasilTarget(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
