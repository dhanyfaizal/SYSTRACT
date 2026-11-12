import { useState, useEffect } from 'react'
import { CheckCircle2, Award, Lock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import Sk from '@/components/ui/Skeleton'



/* ─────────────────────────────────────────────────────────── */
/*  TAB: VALIDASI SERTIFIKAT                                   */
/* ─────────────────────────────────────────────────────────── */
export default function SertifikatTab({ userId }) {
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState([])
  const [materials, setMaterials] = useState([])
  const [progress, setProgress] = useState([])
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [exams, setExams] = useState([])
  const [examAnswers, setExamAnswers] = useState([])

  const [activeStudent, setActiveStudent] = useState(null)
  const [certNotes, setCertNotes] = useState('')
  const [savingCert, setSavingCert] = useState(false)
  const [taskGrading, setTaskGrading] = useState({})

  useEffect(() => { fetchCourses() }, [userId])
  useEffect(() => { if (selectedCourse) loadClassData(selectedCourse) }, [selectedCourse])

  async function fetchCourses() {
    setLoading(true)
    const { data } = await supabase.from('courses').select('id,name,code').eq('dosen_id', userId).order('name')
    setCourses(data || [])
    if (data?.length) setSelectedCourse(data[0].id)
    else setLoading(false)
  }

  async function loadClassData(cid) {
    setLoading(true)
    try {
      const [enrRes, matRes, assignRes, examRes] = await Promise.all([
        supabase.from('enrollments').select('*, student:profiles!student_id(id, full_name, nim, avatar_url)').eq('course_id', cid).eq('status', 'approved'),
        supabase.from('materials').select('*').eq('course_id', cid),
        supabase.from('assignments').select('*').eq('course_id', cid),
        supabase.from('exams').select('*').eq('course_id', cid).eq('is_published', true)
      ])

      const enrs = enrRes.data || []
      const mats = matRes.data || []
      const assigns = assignRes.data || []
      const exms = examRes.data || []

      const assignIds = assigns.map(a => a.id)
      const examIds = exms.map(e => e.id)

      const [progRes, subRes, exAnsRes] = await Promise.all([
        supabase.from('course_progress').select('*').eq('course_id', cid),
        assignIds.length > 0 ? supabase.from('submissions').select('*').in('assignment_id', assignIds) : Promise.resolve({ data: [] }),
        examIds.length > 0 ? supabase.from('exam_answers').select('*').in('exam_id', examIds) : Promise.resolve({ data: [] })
      ])

      setEnrollments(enrs)
      setMaterials(mats)
      setProgress(progRes.data || [])
      setAssignments(assigns)
      setSubmissions(subRes.data || [])
      setExams(exms)
      setExamAnswers(exAnsRes.data || [])
    } catch(err) {
      console.error(err)
      toast.error('Gagal memuat data kelas')
    } finally {
      setLoading(false)
    }
  }

  async function saveTaskGrade(sub, assignment) {
    const g = taskGrading[sub.id] || {}
    const grade = parseFloat(g.grade)
    if (isNaN(grade) || grade < 0 || grade > assignment.max_score) {
      toast.error(`Nilai harus antara 0–${assignment.max_score}`); return
    }
    const toastId = toast.loading('Menyimpan nilai...')
    try {
      const { error } = await supabase.from('submissions').update({
        grade,
        feedback: g.feedback || '',
        status: 'graded',
        graded_by: userId,
        graded_at: new Date().toISOString()
      }).eq('id', sub.id)

      if (error) throw error
      toast.success('Nilai tugas berhasil disimpan!', { id: toastId })
      loadClassData(selectedCourse)
    } catch(err) {
      console.error(err)
      toast.error('Gagal menyimpan nilai', { id: toastId })
    }
  }

  async function returnTaskForRevision(sub) {
    const g = taskGrading[sub.id] || {}
    const toastId = toast.loading('Mengembalikan tugas...')
    try {
      const { error } = await supabase.from('submissions').update({
        status: 'revision',
        grade: null,
        feedback: g.feedback || 'Silakan perbaiki tugas Anda.',
        graded_by: userId,
        graded_at: new Date().toISOString()
      }).eq('id', sub.id)

      if (error) throw error
      toast.success('Tugas dikembalikan untuk revisi!', { id: toastId })
      loadClassData(selectedCourse)
    } catch(err) {
      console.error(err)
      toast.error('Gagal mengembalikan tugas', { id: toastId })
    }
  }

  async function validateCertificate(enroll, nextStatus) {
    if (nextStatus === 'returned' && !certNotes.trim()) {
      toast.error('Silakan isi catatan revisi sebelum mengembalikan sertifikat'); return
    }
    setSavingCert(true)
    const toastId = toast.loading('Memproses sertifikat...')
    try {
      const { error } = await supabase.from('enrollments')
        .update({
          certificate_status: nextStatus,
          certificate_notes: certNotes,
          certificate_validated_at: nextStatus === 'validated' ? new Date().toISOString() : null,
          certificate_validated_by: userId
        })
        .eq('id', enroll.id)

      if (error) throw error
      toast.success(nextStatus === 'validated' ? 'Sertifikat berhasil disetujui & diterbitkan! 🎓' : 'Sertifikat dikembalikan untuk revisi.', { id: toastId })
      
      setActiveStudent(prev => prev ? { ...prev, certificate_status: nextStatus, certificate_notes: certNotes } : null)
      loadClassData(selectedCourse)
    } catch(err) {
      console.error(err)
      toast.error('Gagal memproses validasi sertifikat', { id: toastId })
    } finally {
      setSavingCert(false)
    }
  }

  if (loading && courses.length === 0) return <div><Sk.PageHeader/><Sk.Table rows={5} cols={5}/></div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Course selector */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <select className="input" style={{ maxWidth:340 }} value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--gray-400)' }}>{enrollments.length} mahasiswa</span>
      </div>

      {enrollments.length === 0 ? (
        <div className="empty-state card" style={{ padding:40 }}>
          <Award size={32} color="var(--gray-200)"/>
          <p className="empty-state-text">Belum ada mahasiswa terdaftar di mata kuliah ini</p>
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflowX:'auto' }}>
          <table className="table" style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--gray-50)', textAlign:'left' }}>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)' }}>Mahasiswa</th>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)', textAlign:'center' }}>Materi</th>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)', textAlign:'center' }}>Ujian</th>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)', textAlign:'center' }}>Tugas</th>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)' }}>Status Sertifikat</th>
                <th style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-100)', textAlign:'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map(e => {
                const sId = e.student_id
                
                // Progress counts
                const matDone = progress.filter(p => p.student_id === sId).length
                const matTotal = materials.length

                const examDone = exams.filter(ex => {
                  const studentAns = examAnswers.filter(a => a.student_id === sId && a.exam_id === ex.id)
                  const maxScore = studentAns.length > 0 ? Math.max(...studentAns.map(a => a.score || 0)) : 0
                  return maxScore >= (ex.passing_grade ?? 70)
                }).length
                const examTotal = exams.length

                const taskDone = assignments.filter(a => {
                  const sub = submissions.find(s => s.student_id === sId && s.assignment_id === a.id)
                  return sub && (sub.status === 'submitted' || sub.status === 'graded')
                }).length
                const taskTotal = assignments.length

                const isAllDone = (matTotal > 0 && matDone === matTotal) && (examTotal > 0 && examDone === examTotal) && (taskTotal === 0 || taskDone === taskTotal)
                const cStatus = e.certificate_status || 'unvalidated'

                let badgeColor = 'badge-slate'
                let badgeText = 'Belum Lengkap'
                if (cStatus === 'validated') {
                  badgeColor = 'badge-green'; badgeText = 'Sudah Valid'
                } else if (cStatus === 'pending') {
                  badgeColor = 'badge-amber'; badgeText = 'Menunggu Validasi'
                } else if (cStatus === 'returned') {
                  badgeColor = 'badge-red'; badgeText = 'Revisi / Dikembalikan'
                } else if (isAllDone) {
                  badgeColor = 'badge-indigo'; badgeText = 'Siap Divalidasi'
                }

                return (
                  <tr key={e.id} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                    <td style={{ padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="avatar" style={{ width:32, height:32 }}>
                          {e.student?.avatar_url ? <img src={e.student.avatar_url} alt=""/> : e.student?.full_name?.[0]||'M'}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:'var(--gray-900)' }}>{e.student?.full_name}</div>
                          <div style={{ fontSize:10, color:'var(--gray-400)' }}>{e.student?.nim}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'center', fontSize:12, fontWeight:600 }}>
                      <span style={{ color: matDone === matTotal && matTotal > 0 ? 'var(--success)' : 'var(--gray-700)' }}>
                        {matDone} / {matTotal}
                      </span>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'center', fontSize:12, fontWeight:600 }}>
                      <span style={{ color: examDone === examTotal && examTotal > 0 ? 'var(--success)' : 'var(--gray-700)' }}>
                        {examDone} / {examTotal}
                      </span>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'center', fontSize:12, fontWeight:600 }}>
                      <span style={{ color: taskDone === taskTotal && taskTotal > 0 ? 'var(--success)' : 'var(--gray-700)' }}>
                        {taskDone} / {taskTotal}
                      </span>
                    </td>
                    <td style={{ padding:'14px 16px' }}>
                      <span className={`badge-pill ${badgeColor}`} style={{ fontSize:10 }}>{badgeText}</span>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'right' }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => {
                          setActiveStudent(e)
                          setCertNotes(e.certificate_notes || '')
                        }}
                      >
                        {cStatus === 'pending' ? 'Tinjau & Validasi' : 'Tinjau Ulang'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Review & Validation Modal */}
      {activeStudent && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(15,23,42,0.4)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20
        }}>
          <div className="card animate-fade-in" style={{
            width:'100%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column',
            padding:24, background:'#fff', borderRadius:16, border:'1px solid var(--gray-200)',
            boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            {/* Modal Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, borderBottom:'1px solid var(--gray-200)', paddingBottom:14 }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:800, color:'var(--gray-900)', margin:0 }}>Tinjau Progres Kompetensi Mahasiswa</h3>
                <p style={{ fontSize:11, color:'var(--gray-500)', marginTop:2, margin:0 }}>
                  {activeStudent.student?.full_name} · NIM {activeStudent.student?.nim}
                </p>
              </div>
              <button 
                className="btn btn-ghost btn-icon btn-sm" 
                onClick={() => {
                  setActiveStudent(null)
                  setCertNotes('')
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body Scroll Container */}
            <div style={{ flex:1, overflowY:'auto', display:'grid', gridTemplateColumns:'1.2fr 0.8fr', gap:20, paddingRight:6, marginBottom:20 }}>
              
              {/* Left Side: Checklists */}
              <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                
                {/* 1. Materi Checklist */}
                <div style={{ border:'1px solid var(--gray-200)', borderRadius:12, padding:14 }}>
                  <h4 style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)', margin:'0 0 10px 0', borderBottom:'1px solid var(--gray-100)', paddingBottom:6 }}>A. Kehadiran & Progres Materi</h4>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:6, maxHeight:150, overflowY:'auto' }}>
                    {materials.map(m => {
                      const isDone = progress.some(p => p.student_id === activeStudent.student_id && p.material_id === m.id)
                      return (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                          {isDone ? <CheckCircle2 size={12} color="var(--success)" fill="#d1fae5" /> : <span style={{ color:'var(--gray-300)', fontSize:14 }}>•</span>}
                          <span style={{ color: isDone ? 'var(--gray-700)' : 'var(--gray-400)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 2. Exams Checklist */}
                <div style={{ border:'1px solid var(--gray-200)', borderRadius:12, padding:14 }}>
                  <h4 style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)', margin:'0 0 10px 0', borderBottom:'1px solid var(--gray-100)', paddingBottom:6 }}>B. Evaluasi Ujian & Kuis</h4>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {exams.map(ex => {
                      const studentAns = examAnswers.filter(a => a.student_id === activeStudent.student_id && a.exam_id === ex.id)
                      const maxScore = studentAns.length > 0 ? Math.max(...studentAns.map(a => a.score || 0)) : 0
                      const isPassed = maxScore >= (ex.passing_grade ?? 70)
                      return (
                        <div key={ex.id} style={{ display:'flex', justifyContent:'space-between', fontSize:11, paddingBottom:4, borderBottom:'1px dashed var(--gray-100)' }}>
                          <span style={{ color:'var(--gray-700)' }}>{ex.title}</span>
                          <span style={{ fontWeight:700, color: isPassed ? 'var(--success)' : 'var(--danger)' }}>
                            {maxScore > 0 ? `${maxScore} / 100` : 'Belum Ujian'} (Lulus &gt;= {ex.passing_grade ?? 70})
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Assignments (Direct Grading & Return) */}
                <div style={{ border:'1px solid var(--gray-200)', borderRadius:12, padding:14 }}>
                  <h4 style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)', margin:'0 0 10px 0', borderBottom:'1px solid var(--gray-100)', paddingBottom:6 }}>C. Tugas & Proyek Mandiri</h4>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {assignments.map(a => {
                      const sub = submissions.find(s => s.student_id === activeStudent.student_id && s.assignment_id === a.id)
                      const g = taskGrading[sub?.id] || {}
                      return (
                        <div key={a.id} style={{ padding:10, background:'#f8fafc', border:'1px solid var(--gray-100)', borderRadius:8 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:'var(--gray-800)' }}>{a.title}</span>
                            {sub ? (
                              <span className={`badge-pill ${sub.status==='graded'?'badge-green':sub.status==='revision'?'badge-amber':'badge-indigo'}`} style={{ fontSize:9 }}>
                                {sub.status==='graded'?`Nilai: ${sub.grade}`:sub.status==='revision'?'Revisi':'Belum Dinilai'}
                              </span>
                            ) : (
                              <span style={{ fontSize:10, color:'var(--danger)', fontWeight:750 }}>Belum Mengumpulkan</span>
                            )}
                          </div>

                          {sub && (
                            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8, borderTop:'1px solid var(--gray-100)', paddingTop:8 }}>
                              {sub.webview_link && (
                                <div style={{ fontSize:11, display:'flex', gap:6 }}>
                                  <span>🔗 Tugas:</span>
                                  <a href={sub.webview_link} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'var(--indigo-600)', textDecoration:'none' }}>
                                    {sub.file_name || 'Buka Link Submission'} ↗
                                  </a>
                                </div>
                              )}
                              
                              {/* Direct Grading fields */}
                              <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                                <div style={{ width:70 }}>
                                  <span style={{ fontSize:9, color:'var(--gray-400)', display:'block', marginBottom:2 }}>Nilai (max {a.max_score})</span>
                                  <input 
                                    type="number" min={0} max={a.max_score} className="input" style={{ padding:'3px 6px', fontSize:11 }}
                                    value={g.grade ?? (sub.status === 'graded' ? sub.grade : '')}
                                    onChange={e => setTaskGrading(p => ({ ...p, [sub.id]: { ...p[sub.id], grade: e.target.value } }))}
                                  />
                                </div>
                                <div style={{ flex:1 }}>
                                  <span style={{ fontSize:9, color:'var(--gray-400)', display:'block', marginBottom:2 }}>Catatan / Feedback</span>
                                  <input 
                                    type="text" placeholder="Beri catatan..." className="input" style={{ padding:'3px 6px', fontSize:11 }}
                                    value={g.feedback ?? (sub.feedback || '')}
                                    onChange={e => setTaskGrading(p => ({ ...p, [sub.id]: { ...p[sub.id], feedback: e.target.value } }))}
                                  />
                                </div>
                                <div style={{ display:'flex', gap:4 }}>
                                  <button 
                                    className="btn btn-primary btn-sm" style={{ padding:'4px 8px', fontSize:10 }}
                                    onClick={() => saveTaskGrade(sub, a)}
                                  >
                                    Simpan
                                  </button>
                                  <button 
                                    className="btn btn-secondary btn-sm" style={{ padding:'4px 8px', fontSize:10, background:'#fff1f2', color:'#e11d48', borderColor:'#fecdd3' }}
                                    onClick={() => returnTaskForRevision(sub)}
                                  >
                                    Kembalikan
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>

              {/* Right Side: Validation Actions */}
              <div style={{ display:'flex', flexDirection:'column', gap:16, borderLeft:'1px solid var(--gray-200)', paddingLeft:20 }}>
                <h4 style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)', margin:'0 0 4px 0' }}>Validasi Kelulusan Sertifikat</h4>
                
                {/* Status Indicator */}
                <div style={{ padding:14, background:'var(--gray-50)', borderRadius:10, border:'1px solid var(--gray-200)' }}>
                  <div style={{ fontSize:10, color:'var(--gray-400)' }}>Status Saat Ini:</div>
                  <div style={{ marginTop:6 }}>
                    {(() => {
                      const cStatus = activeStudent.certificate_status || 'unvalidated'
                      let label = 'Belum Lengkap'
                      let color = '#64748b'
                      let bg = '#f1f5f9'
                      if (cStatus === 'validated') {
                        label = 'Sudah Valid / Diterbitkan'; color = '#16a34a'; bg = '#dcfce7'
                      } else if (cStatus === 'pending') {
                        label = 'Menunggu Validasi'; color = '#ca8a04'; bg = '#fef3c7'
                      } else if (cStatus === 'returned') {
                        label = 'Dikembalikan / Revisi'; color = '#dc2626'; bg = '#fee2e2'
                      }
                      return (
                        <span style={{ fontSize:12, fontWeight:850, color, background:bg, padding:'4px 12px', borderRadius:8, border:`1px solid ${color}44` }}>
                          {label}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Notes Textarea */}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--gray-600)', display:'block', marginBottom:6 }}>Catatan Validasi Sertifikat:</label>
                  <textarea 
                    rows={4} className="input" placeholder="Masukkan catatan, instruksi revisi, atau apresiasi kelulusan..."
                    style={{ fontSize:12, resize:'none' }}
                    value={certNotes}
                    onChange={e => setCertNotes(e.target.value)}
                  />
                </div>

                {/* Submit Buttons */}
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:'auto' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => validateCertificate(activeStudent, 'validated')}
                    disabled={savingCert}
                    style={{ background:'var(--success)', borderColor:'var(--success)', fontWeight:750, gap:6 }}
                  >
                    <CheckCircle2 size={15} /> Setujui &amp; Terbitkan Sertifikat
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => validateCertificate(activeStudent, 'returned')}
                    disabled={savingCert}
                    style={{ background:'#fff1f2', color:'#e11d48', borderColor:'#fecdd3', fontWeight:750, gap:6 }}
                  >
                    <Lock size={15} /> Kembalikan Sertifikat (Minta Revisi)
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
