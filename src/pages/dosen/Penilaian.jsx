import { useState, useEffect } from 'react'
import {
  BarChart2, CheckCircle2, Clock, ChevronDown, ChevronUp,
  Loader2, Star, FileText, ClipboardList, BookOpen, Download, Table2,
  Award, Lock, X
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/withRetry'
import FilePreview from '@/components/drive/FilePreview'
import toast from 'react-hot-toast'
import Sk from '@/components/ui/Skeleton'

/* ── helpers ─────────────────────────────────────────────── */
const MODE_LABEL = { ujian:'Ujian', tryout:'Try Out', quiz:'Quiz' }
const MODE_COLOR = { ujian:'var(--indigo-600)', tryout:'#0891b2', quiz:'#7c3aed' }
const TYPE_LABEL = { uts:'UTS', uas:'UAS', kuis:'Kuis' }

/* ── Tab bar ─────────────────────────────────────────────── */
function TabBar({ active, onChange }) {
  const tabs = [
    { key:'tugas', icon: ClipboardList, label:'Tugas' },
    { key:'ujian', icon: FileText,      label:'Ujian'  },
    { key:'rekap', icon: Table2,        label:'Rekap'  },
    { key:'sertifikat', icon: Award,    label:'Validasi Sertifikat' },
  ]
  return (
    <div style={{ display:'flex', gap:4, background:'var(--gray-100)', borderRadius:10, padding:4, width:'fit-content', marginBottom:20 }}>
      {tabs.map(({ key, icon: _Icon, label }) => (
        <button key={key} onClick={() => onChange(key)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all .15s',
            background: active===key ? '#fff' : 'transparent',
            color:      active===key ? 'var(--indigo-700)' : 'var(--gray-500)',
            boxShadow:  active===key ? 'var(--shadow-sm)' : 'none',
          }}>
          <Icon size={14}/> {label}
        </button>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── */
/*  TAB: TUGAS                                                 */
/* ─────────────────────────────────────────────────────────── */
function TugasTab({ userId }) {
  const [assignments,    setAssignments]    = useState([])
  const [courses,        setCourses]        = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [expanded,       setExpanded]       = useState({})
  const [submissions,    setSubmissions]    = useState({})
  const [loadingSubs,    setLoadingSubs]    = useState({})
  const [grading,        setGrading]        = useState({})
  const [loading,        setLoading]        = useState(true)

  useEffect(() => { fetchCourses() }, [userId])
  useEffect(() => { if (selectedCourse) fetchAssignments(selectedCourse) }, [selectedCourse])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,name,code').eq('dosen_id', userId).order('name')
    setCourses(data || [])
    if (data?.length) setSelectedCourse(data[0].id)
    else setLoading(false)
  }

  async function fetchAssignments(courseId) {
    setLoading(true)
    setExpanded({})
    setSubmissions({})
    const { data } = await supabase.from('assignments')
      .select('*, course:courses(name, code)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
    setAssignments(data || [])
    setLoading(false)
  }

  async function loadSubmissions(assignmentId) {
    if (submissions[assignmentId]) return
    setLoadingSubs(p => ({ ...p, [assignmentId]: true }))
    const { data } = await supabase.from('submissions')
      .select('*, student:profiles(full_name, nim, avatar_url)')
      .eq('assignment_id', assignmentId)
      .in('status', ['submitted','graded','late'])
      .order('submitted_at')
    setSubmissions(p => ({ ...p, [assignmentId]: data || [] }))
    setLoadingSubs(p => ({ ...p, [assignmentId]: false }))
  }

  function toggleExpand(id) {
    setExpanded(p => { const next = { ...p, [id]: !p[id] }; if (next[id]) loadSubmissions(id); return next })
  }

  async function handleGrade(sub, assignment) {
    const g = grading[sub.id]
    const grade = parseFloat(g?.grade)
    if (isNaN(grade) || grade < 0 || grade > assignment.max_score) {
      toast.error(`Nilai harus antara 0–${assignment.max_score}`); return
    }
    setGrading(p => ({ ...p, [sub.id]: { ...p[sub.id], loading: true } }))
    const { error } = await withRetry(
      () => supabase.from('submissions').update({
        grade, feedback: g?.feedback || '', status: 'graded',
        graded_by: userId, graded_at: new Date().toISOString()
      }).eq('id', sub.id),
      { retries: 3, onRetry: ({ attempt }) => toast.loading(`Menyimpan... (${attempt}/3)`, { id: 'retry-grade' }) }
    )
    toast.dismiss('retry-grade')
    if (error) { toast.error('Gagal menyimpan nilai — coba lagi'); }
    else {
      toast.success(`Nilai ${sub.student?.full_name} disimpan`)
      setSubmissions(p => ({
        ...p,
        [sub.assignment_id]: p[sub.assignment_id]?.map(s =>
          s.id === sub.id ? { ...s, grade, status: 'graded', feedback: g?.feedback||'' } : s
        )
      }))
    }
    setGrading(p => ({ ...p, [sub.id]: { loading: false } }))
  }

  if (loading) return (
    <div><Sk.PageHeader/><Sk.StatCards n={3}/><Sk.Table rows={5} cols={5}/></div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Course selector */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <select className="input" style={{ maxWidth:340 }} value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--gray-400)' }}>{assignments.length} tugas</span>
      </div>

      {assignments.length === 0 ? (
        <div className="empty-state card" style={{ padding:40 }}>
          <ClipboardList size={32} color="var(--gray-200)"/>
          <p className="empty-state-text">Belum ada tugas di mata kuliah ini</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {assignments.map(a => {
            const subs   = submissions[a.id] || []
            const graded = subs.filter(s => s.status === 'graded').length
            return (
              <div key={a.id} className="card">
                <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => toggleExpand(a.id)}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.title}</div>
                    <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2 }}>
                      {a.due_date && `Deadline: ${new Date(a.due_date).toLocaleDateString('id-ID')}`}
                    </div>
                  </div>
                  {expanded[a.id] && <span style={{ fontSize:12, color:'var(--gray-400)' }}>{graded}/{subs.length} dinilai</span>}
                  {expanded[a.id] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </div>

                {expanded[a.id] && (
                  <div style={{ borderTop:'1px solid var(--gray-100)' }}>
                    {loadingSubs[a.id] ? (
                      <div style={{ padding:20, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
                    ) : subs.length === 0 ? (
                      <div style={{ padding:'20px', textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Belum ada yang mengumpulkan</div>
                    ) : subs.map((s, i) => {
                      const g = grading[s.id] || {}
                      return (
                        <div key={s.id} style={{ padding:'14px 18px', borderBottom: i < subs.length-1 ? '1px solid var(--gray-100)' : 'none', display:'flex', gap:14, alignItems:'flex-start' }}>
                          <div className="avatar" style={{ width:34, height:34, flexShrink:0 }}>
                            {s.student?.avatar_url ? <img src={s.student.avatar_url} alt=""/> : s.student?.full_name?.[0]||'M'}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:13 }}>{s.student?.full_name}</div>
                            <div style={{ fontSize:11, color:'var(--gray-400)' }}>{s.student?.nim} · {new Date(s.submitted_at).toLocaleString('id-ID')}</div>
                            {s.webview_link && <div style={{ marginTop:6 }}><FilePreview name={s.file_name} webViewLink={s.webview_link} compact/></div>}
                          </div>
                          <div style={{ flexShrink:0, display:'flex', flexDirection:'column', gap:8, minWidth:200 }}>
                            {s.status === 'graded' && g.loading === undefined ? (
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:18, fontWeight:800, color:'var(--indigo-600)' }}>{s.grade} <span style={{ fontSize:11, color:'var(--gray-400)', fontWeight:400 }}>/ {a.max_score}</span></div>
                                {s.feedback && <div style={{ fontSize:11, color:'var(--gray-500)', marginTop:2 }}>{s.feedback}</div>}
                                <button className="btn btn-ghost btn-sm" style={{ marginTop:4, fontSize:11 }}
                                  onClick={() => setGrading(p=>({...p,[s.id]:{grade:s.grade,feedback:s.feedback||''}}))}>Edit Nilai</button>
                              </div>
                            ) : (
                              <>
                                <div style={{ display:'flex', gap:6 }}>
                                  <input type="number" className="input" placeholder={`0–${a.max_score}`} min={0} max={a.max_score}
                                    style={{ width:80 }}
                                    value={g.grade ?? (s.status==='graded' ? s.grade : '')}
                                    onChange={e => setGrading(p=>({...p,[s.id]:{...p[s.id],grade:e.target.value}}))}/>
                                  <span style={{ fontSize:11, color:'var(--gray-400)', alignSelf:'center' }}>/ {a.max_score}</span>
                                </div>
                                <textarea className="input" placeholder="Feedback (opsional)" rows={2}
                                  style={{ resize:'vertical', fontSize:12 }}
                                  value={g.feedback ?? (s.status==='graded' ? s.feedback : '')}
                                  onChange={e => setGrading(p=>({...p,[s.id]:{...p[s.id],feedback:e.target.value}}))}/>
                                <button className="btn btn-primary btn-sm" onClick={() => handleGrade(s, a)} disabled={g.loading}>
                                  {g.loading ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Star size={13}/>}
                                  Simpan Nilai
                                </button>
                              </>
                            )}
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
    </div>
  )
}



/* ─────────────────────────────────────────────────────────── */
/*  TAB: UJIAN                                                 */
/* ─────────────────────────────────────────────────────────── */
function UjianTab({ userId }) {
  const [exams,          setExams]          = useState([])
  const [courses,        setCourses]        = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [expanded,       setExpanded]       = useState({})
  const [answers,        setAnswers]        = useState({})
  const [loadingAns,     setLoadingAns]     = useState({})
  const [loading,        setLoading]        = useState(true)
  const MAX_VIOL_WARN = 3

  useEffect(() => { fetchCourses() }, [userId])
  useEffect(() => { if (selectedCourse) fetchExams(selectedCourse) }, [selectedCourse])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,name,code').eq('dosen_id', userId).order('name')
    setCourses(data || [])
    if (data?.length) setSelectedCourse(data[0].id)
    else setLoading(false)
  }

  async function fetchExams(courseId) {
    setLoading(true)
    setExpanded({})
    setAnswers({})
    const { data } = await supabase.from('exams')
      .select('*, course:courses(name, code)')
      .eq('course_id', courseId)
      .order('start_at', { ascending: false })
    setExams(data || [])
    setLoading(false)
  }




  async function loadAnswers(examId) {
    if (answers[examId]) return
    setLoadingAns(p => ({ ...p, [examId]: true }))
    const { data } = await supabase.from('exam_answers')
      .select('*, student:profiles(full_name, nim, avatar_url)')
      .eq('exam_id', examId)
      .not('submitted_at', 'is', null)
      .order('student_id').order('attempt_number')
    setAnswers(p => ({ ...p, [examId]: data || [] }))
    setLoadingAns(p => ({ ...p, [examId]: false }))
  }

  function toggleExpand(id) {
    setExpanded(p => { const next = { ...p, [id]: !p[id] }; if (next[id]) loadAnswers(id); return next })
  }

  // Read _violations from answers JSONB
  function getViolations(attempt) {
    return attempt?.answers?._violations ?? 0
  }

  if (loading) return (
    <div><Sk.PageHeader/><Sk.Table rows={5} cols={4}/></div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Course selector */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <select className="input" style={{ maxWidth:340 }} value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--gray-400)' }}>{exams.length} ujian/kuis</span>
      </div>

      {exams.length === 0 ? (
        <div className="empty-state card" style={{ padding:40 }}>
          <FileText size={32} color="var(--gray-200)"/>
          <p className="empty-state-text">Belum ada ujian di mata kuliah ini</p>
        </div>
      ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {exams.map(exam => {
        const mode     = exam.exam_mode || 'ujian'
        const rows     = answers[exam.id] || []
        // Group by student: pick best score per student
        const byStudent = {}
        rows.forEach(r => {
          if (!byStudent[r.student_id]) byStudent[r.student_id] = { student: r.student, attempts: [] }
          byStudent[r.student_id].attempts.push(r)
        })
        const studentList = Object.values(byStudent)
        const gradedCount = studentList.filter(s => s.attempts.some(a => a.score !== null)).length

        return (
          <div key={exam.id} className="card">
            {/* Exam header row */}
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => toggleExpand(exam.id)}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:700, background:'#eef2ff', color:'var(--indigo-600)', padding:'2px 8px', borderRadius:20 }}>
                    {TYPE_LABEL[exam.type] || exam.type}
                  </span>
                  <span style={{ fontSize:10, fontWeight:700, color: MODE_COLOR[mode], background: mode==='tryout'?'#e0f2fe':mode==='quiz'?'#f3e8ff':'#eef2ff', padding:'2px 8px', borderRadius:20 }}>
                    {MODE_LABEL[mode]}
                  </span>
                  <span style={{ fontWeight:600, fontSize:13 }}>{exam.title}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--gray-400)' }}>
                  {exam.course?.code} · {exam.course?.name}
                  {exam.start_at && ` · ${new Date(exam.start_at).toLocaleDateString('id-ID')}`}
                </div>
              </div>
              {expanded[exam.id] && (
                <span style={{ fontSize:12, color:'var(--gray-400)' }}>{gradedCount}/{studentList.length} peserta</span>
              )}
              {expanded[exam.id] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </div>

            {/* Expanded: student list */}
            {expanded[exam.id] && (
              <div style={{ borderTop:'1px solid var(--gray-100)' }}>
                {loadingAns[exam.id] ? (
                  <div style={{ padding:20, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
                ) : studentList.length === 0 ? (
                  <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Belum ada yang mengumpulkan</div>
                ) : studentList.map(({ student, attempts }, i) => {
                  const best = attempts.reduce((b, a) => (a.score ?? -1) > (b.score ?? -1) ? a : b, attempts[0])
                  const isMultiAttempt = mode === 'tryout' || mode === 'quiz'
                  // Aggregate max violations across all attempts
                  const maxViol = attempts.reduce((max, a) => Math.max(max, getViolations(a)), 0)
                  const violColor = maxViol >= MAX_VIOL_WARN ? '#dc2626' : maxViol >= 1 ? '#f97316' : null
                  return (
                    <div key={student?.nim || i} style={{ padding:'14px 18px', borderBottom: i < studentList.length-1 ? '1px solid var(--gray-100)' : 'none', display:'flex', gap:14, alignItems:'flex-start',
                      background: maxViol >= MAX_VIOL_WARN ? '#fff5f5' : maxViol >= 1 ? '#fffbf5' : 'transparent'
                    }}>
                      <div className="avatar" style={{ width:34, height:34, flexShrink:0 }}>
                        {student?.avatar_url ? <img src={student.avatar_url} alt=""/> : student?.full_name?.[0]||'M'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                          {student?.full_name}
                          {maxViol > 0 && (
                            <span title={`${maxViol} pelanggaran terdeteksi selama ujian`}
                              style={{
                                display:'inline-flex', alignItems:'center', gap:4,
                                fontSize:10, fontWeight:800,
                                background: violColor + '20',
                                color: violColor,
                                border: `1px solid ${violColor}40`,
                                padding:'2px 8px', borderRadius:20,
                                cursor:'help',
                              }}
                            >
                              {maxViol >= MAX_VIOL_WARN ? '🚨' : '⚠️'} {maxViol}× pelanggaran
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:'var(--gray-400)', marginBottom: isMultiAttempt ? 8 : 0 }}>
                          {student?.nim}
                          {isMultiAttempt && ` · ${attempts.length}× percobaan`}
                        </div>
                        {/* Attempt history for tryout/quiz */}
                        {isMultiAttempt && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            {attempts.map((att, ai) => {
                              const av = getViolations(att)
                              return (
                                <div key={ai} style={{ padding:'4px 10px', borderRadius:8,
                                  background: att.id===best.id ? '#d1fae5' : 'var(--gray-100)',
                                  border: att.id===best.id ? '1px solid #6ee7b7' : '1px solid var(--gray-200)',
                                  fontSize:12, display:'flex', alignItems:'center', gap:6 }}
                                >
                                  <span style={{ color:'var(--gray-500)', marginRight:2 }}>#{att.attempt_number}</span>
                                  <span style={{ fontWeight:700, color: att.id===best.id ? '#065f46' : 'var(--gray-700)' }}>
                                    {att.score ?? '–'}
                                  </span>
                                  {att.id===best.id && <span style={{ fontSize:10, color:'#065f46' }}>✓ terbaik</span>}
                                  {av > 0 && (
                                    <span title={`${av} pelanggaran pada percobaan ini`}
                                      style={{ fontSize:10, color: av >= MAX_VIOL_WARN ? '#dc2626' : '#f97316', fontWeight:700 }}
                                    >{av >= MAX_VIOL_WARN ? '🚨' : '⚠️'}{av}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {/* Score display */}
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {best.score !== null ? (
                          <>
                            <div style={{ fontSize:20, fontWeight:800, color:'var(--indigo-600)' }}>{best.score}</div>
                            <div style={{ fontSize:10, color:'var(--gray-400)' }}>
                              {new Date(best.submitted_at).toLocaleDateString('id-ID')}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize:11, color:'var(--gray-400)', fontStyle:'italic' }}>Belum dinilai</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {/* Violation legend */}
                {answers[exam.id]?.some(a => getViolations(a) > 0) && (
                  <div style={{ padding:'10px 18px', background:'#fff7ed', borderTop:'1px solid #fed7aa', fontSize:11, color:'#92400e', display:'flex', gap:16 }}>
                    <span>⚠️ 1× = berpindah fokus</span>
                    <span>🚨 {MAX_VIOL_WARN}× = auto-submit karena pelanggaran</span>
                    <span style={{ marginLeft:'auto', color:'var(--gray-400)' }}>Hover badge untuk detail</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      </div>
      )}
    </div>
  )
}


/* ─────────────────────────────────────────────────────────── */
/*  TAB: REKAP NILAI (matriks + bobot nilai akhir)            */
/* ─────────────────────────────────────────────────────────── */

function gradeColor(v) {
  if (v === null || v === undefined) return 'var(--gray-300)'
  if (v >= 80) return '#16a34a'
  if (v >= 75) return '#22c55e'
  if (v >= 70) return '#3b82f6'
  if (v >= 65) return '#6366f1'
  if (v >= 60) return '#ca8a04'
  if (v >= 55) return '#f97316'
  if (v >= 45) return '#dc2626'
  return '#991b1b'
}
function gradeLetter(v) {
  if (v === null || v === undefined) return '–'
  if (v >= 80) return 'A'
  if (v >= 75) return 'AB'
  if (v >= 70) return 'B'
  if (v >= 65) return 'BC'
  if (v >= 60) return 'C'
  if (v >= 55) return 'CD'
  if (v >= 45) return 'D'
  return 'E'
}

function RekapTab({ userId }) {
  const [courses,     setCourses]     = useState([])
  const [courseId,    setCourseId]    = useState('')
  const [matrix,      setMatrix]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [weights,     setWeights]     = useState({})
  const [showConfig,  setShowConfig]  = useState(false)
  const [savingCfg,   setSavingCfg]   = useState(false)
  const [keaktifan,   setKeaktifan]   = useState({})   // { studentId: score }
  const [editCell,    setEditCell]    = useState(null)  // studentId being edited
  const [editVal,     setEditVal]     = useState('')

  useEffect(() => { fetchCourses() }, [userId])
  useEffect(() => { if (courseId) { buildMatrix(courseId); loadWeightConfig(courseId); loadKeaktifan(courseId) } }, [courseId])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,name,code').eq('dosen_id', userId).order('name')
    setCourses(data || [])
    if (data?.length) setCourseId(data[0].id)
  }

  async function loadWeightConfig(cid) {
    const { data } = await supabase.from('course_grading_config')
      .select('config').eq('course_id', cid).eq('dosen_id', userId).maybeSingle()
    if (data?.config) setWeights(data.config)
    else setWeights({})
  }

  async function loadKeaktifan(cid) {
    const { data } = await supabase.from('student_keaktifan')
      .select('student_id, score').eq('course_id', cid)
    const map = {}
    ;(data || []).forEach(r => { map[r.student_id] = r.score })
    setKeaktifan(map)
  }

  async function saveKeaktifan(studentId, score) {
    const val = score === '' || score === null ? null : Number(score)
    const { error } = await withRetry(() =>
      supabase.from('student_keaktifan')
        .upsert({ course_id: courseId, student_id: studentId, dosen_id: userId, score: val },
                 { onConflict: 'course_id,student_id' })
    )
    if (!error) setKeaktifan(p => ({ ...p, [studentId]: val }))
    else toast.error('Gagal simpan keaktifan')
  }

  async function saveWeightConfig() {
    setSavingCfg(true)
    const { error } = await withRetry(() =>
      supabase.from('course_grading_config')
        .upsert({ course_id: courseId, dosen_id: userId, config: weights }, { onConflict: 'course_id,dosen_id' })
    )
    if (error) toast.error('Gagal menyimpan bobot')
    else toast.success('Konfigurasi bobot disimpan')
    setSavingCfg(false)
  }

  async function buildMatrix(cid) {
    setLoading(true); setMatrix(null)

    // Parallel: fetch semua data sekaligus
    const [{ data: _enrollments }, { data: assignments }, { data: exams }] = await Promise.all([
      supabase.from('enrollments')
        .select('student:profiles!student_id(id, full_name, nim)').eq('course_id', cid),
      supabase.from('assignments')
        .select('id, title, max_score, submissions(student_id, grade, status)')
        .eq('course_id', cid).order('created_at'),
      supabase.from('exams')
        .select('id, title, type, exam_mode, exam_answers(student_id, score, submitted_at)')
        .eq('course_id', cid).eq('is_published', true).order('start_at'),
    ])

    const tugasCols = (assignments || []).map(a => ({
      key: 'tugas_' + a.id, label: a.title, max: a.max_score, kind: 'tugas',
      dataByStudent: Object.fromEntries((a.submissions || []).map(s => [s.student_id, s.grade]))
    }))
    const ujianCols = (exams || []).map(e => ({
      key: 'ujian_' + e.id, label: e.title, kind: 'ujian', max: 100, dataByStudent: {}
    }))
    ;(exams || []).forEach((e, ei) => {
      const byStudent = {}
      ;(e.exam_answers || []).filter(a => a.submitted_at).forEach(a => {
        if (byStudent[a.student_id] === undefined || (a.score ?? -1) > (byStudent[a.student_id] ?? -1))
          byStudent[a.student_id] = a.score
      })
      ujianCols[ei].dataByStudent = byStudent
    })

    const keaktifanCol = {
      key: 'keaktifan', label: 'Keaktifan', max: 100, kind: 'keaktifan',
      dataByStudent: {}   // filled from state at render — see `allColumns`
    }

    setMatrix({ students, tugasCols, keaktifanCol, ujianCols })
    setLoading(false)
  }

  // Compute weighted final score
  function finalScore(scores, cols) {
    const totalWeight = cols.reduce((s, c) => s + (Number(weights[c.key]) || 0), 0)
    if (totalWeight === 0) {
      // Fallback: simple average
      const nums = scores.filter(v => v !== undefined && v !== null)
      return nums.length ? nums.reduce((a, b) => a + Number(b), 0) / nums.length : null
    }
    let weighted = 0, usedWeight = 0
    cols.forEach((c, i) => {
      const w = Number(weights[c.key]) || 0
      const v = scores[i]
      if (w > 0 && v !== undefined && v !== null) {
        // Normalize score to 0-100 based on max
        weighted += (Number(v) / c.max * 100) * (w / totalWeight)
        usedWeight += w
      }
    })
    return usedWeight > 0 ? weighted : null
  }

  function exportCSV() {
    if (!matrix) return
    const { students } = matrix
    const cols = allColumns
    const header = ['NIM','Nama', ...cols.map(c => `"${c.label}"`), 'Nilai Akhir','Grade'].join(',')
    const rows = students.map(s => {
      const scores = cols.map(c => {
        const v = c.kind === 'keaktifan' ? (keaktifan[s.id] ?? '') : (c.dataByStudent[s.id] ?? '')
        return v
      })
      const final = finalScore(scores, cols)
      const grade = final !== null ? gradeLetter(final) : ''
      return [s.nim||'', `"${s.full_name||''}"`, ...scores, final !== null ? final.toFixed(1) : '', grade].join(',')
    })
    const csv  = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const course = courses.find(c => c.id === courseId)
    a.href = url; a.download = `Rekap_${course?.code||'Nilai'}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Build full column list with live keaktifan data merged in
  const allColumns = matrix ? [
    ...matrix.tugasCols,
    { ...matrix.keaktifanCol, dataByStudent: keaktifan },
    ...matrix.ujianCols,
  ] : []

  const { students = [] } = matrix || {}
  const totalW    = allColumns.reduce((s, c) => s + (Number(weights[c.key]) || 0), 0)
  const hasWeights = totalW > 0

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <select className="input" style={{ maxWidth:300 }} value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig(v => !v)}
          style={{ display:'flex', alignItems:'center', gap:6 }}>
          ⚖ {showConfig ? 'Tutup' : 'Atur Bobot Nilai'}
          {hasWeights && <span style={{ fontSize:10, background:'var(--indigo-600)', color:'#fff', padding:'1px 6px', borderRadius:99 }}>{totalW}%</span>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={!matrix||loading}
          style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Download size={14}/> Ekspor CSV
        </button>
      </div>

      {/* Weight config panel */}
      {showConfig && matrix && (
        <div style={{ background:'#fafafa', border:'1px solid var(--gray-200)', borderRadius:10, padding:16, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'var(--gray-800)' }}>
            ⚖ Konfigurasi Bobot Nilai Akhir
            <span style={{ fontSize:11, fontWeight:400, color:'var(--gray-400)', marginLeft:8 }}>
              Total bobot: <span style={{ color: Math.abs(totalW-100)<0.01?'#16a34a':'#dc2626', fontWeight:700 }}>{totalW.toFixed(0)}%</span> (idealnya 100%)
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:10, marginBottom:14 }}>
            {allColumns.map(c => (
              <div key={c.key} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid var(--gray-200)', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--gray-700)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.label}</div>
                  <div style={{ fontSize:10, color:'var(--gray-400)' }}>
                    {c.kind==='tugas'?'Tugas':c.kind==='keaktifan'?'Keaktifan':'Ujian'}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="number" min={0} max={100}
                    className="input" style={{ width:64, textAlign:'center', padding:'4px 6px', fontWeight:700 }}
                    value={weights[c.key] ?? ''}
                    placeholder="0"
                    onChange={e => setWeights(p => ({ ...p, [c.key]: e.target.value === '' ? 0 : Number(e.target.value) }))}/>
                  <span style={{ fontSize:12, color:'var(--gray-400)', fontWeight:600 }}>%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveWeightConfig} disabled={savingCfg}>
              {savingCfg ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : '💾'}
              Simpan Bobot
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const equal = Math.floor(100 / allColumns.length)
              const newW = {}
              allColumns.forEach((c, i) => { newW[c.key] = i === allColumns.length-1 ? 100 - equal*(allColumns.length-1) : equal })
              setWeights(newW)
            }}>Rata Sama</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeights({})}>Reset</button>
          </div>
        </div>
      )}

      {loading && <div className="spinner" style={{ margin:'40px auto' }}/>}

      {!loading && matrix && (
        <>
          {students.length === 0 ? (
            <div className="empty-state card" style={{ padding:40 }}>
              <BarChart2 size={32} color="var(--gray-200)"/>
              <p className="empty-state-text">Belum ada mahasiswa terdaftar</p>
            </div>
          ) : (
            <div className="card" style={{ overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--gray-50)' }}>
                    <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--gray-500)', borderBottom:'1px solid var(--gray-200)', position:'sticky', left:0, background:'var(--gray-50)', whiteSpace:'nowrap', minWidth:170 }}>Mahasiswa</th>
                    {allColumns.map(c => (
                      <th key={c.key} style={{
                        padding:'10px 10px', textAlign:'center', fontWeight:700, color:'var(--gray-500)',
                        borderBottom:'1px solid var(--gray-200)', whiteSpace:'nowrap',
                        background: c.kind==='keaktifan' ? '#fefce8' : 'var(--gray-50)'
                      }}>
                        <div style={{ fontSize:11 }}>
                          {c.label}
                          {c.kind==='keaktifan' && <span style={{ fontSize:9, marginLeft:4 }}>✏</span>}
                        </div>
                        <div style={{ fontSize:9, fontWeight:500, color:'var(--gray-400)', marginTop:1 }}>
                          {c.kind==='tugas'?'Tugas':c.kind==='keaktifan'?'Manual':'Ujian'}
                          {weights[c.key] ? <span style={{ color:'var(--indigo-600)', fontWeight:700 }}> · {weights[c.key]}%</span> : null}
                        </div>
                      </th>
                    ))}
                    <th style={{ padding:'10px 10px', textAlign:'center', fontWeight:700, color:'var(--indigo-700)', borderBottom:'1px solid var(--gray-200)', borderLeft:'2px solid var(--gray-200)', background:'#eef2ff', whiteSpace:'nowrap' }}>
                      Nilai Akhir
                    </th>
                    <th style={{ padding:'10px 10px', textAlign:'center', fontWeight:700, color:'var(--indigo-700)', borderBottom:'1px solid var(--gray-200)', background:'#eef2ff', whiteSpace:'nowrap' }}>
                      Grade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, si) => {
                    const scores = allColumns.map(c =>
                      c.kind === 'keaktifan' ? keaktifan[s.id] : c.dataByStudent[s.id]
                    )
                    const final  = finalScore(scores, allColumns)
                    const fStr   = final !== null ? final.toFixed(1) : null
                    const grade  = gradeLetter(final)
                    const rowBg  = si%2===0 ? '#fff' : 'var(--gray-50)'
                    return (
                      <tr key={s.id} style={{ background: rowBg }}>
                        <td style={{ padding:'10px 14px', borderBottom:'1px solid var(--gray-100)', position:'sticky', left:0, background: rowBg }}>
                          <div style={{ fontWeight:600, color:'var(--gray-800)' }}>{s.full_name}</div>
                          <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:1 }}>{s.nim}</div>
                        </td>
                        {allColumns.map((c, ci) => {
                          const v = scores[ci]
                          // Keaktifan: inline editable cell
                          if (c.kind === 'keaktifan') {
                            const isEditing = editCell === s.id
                            return (
                              <td key={ci} style={{ padding:'6px 8px', textAlign:'center', borderBottom:'1px solid var(--gray-100)', background: si%2===0?'#fefce8':'#fef9c3', cursor:'pointer' }}
                                onClick={() => { if (!isEditing) { setEditCell(s.id); setEditVal(v ?? '') } }}>
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="number" min={0} max={100}
                                    style={{ width:60, textAlign:'center', border:'1px solid var(--indigo-500)', borderRadius:6, padding:'3px 4px', fontSize:12, fontWeight:700, outline:'none' }}
                                    value={editVal}
                                    onChange={e => setEditVal(e.target.value)}
                                    onBlur={() => { saveKeaktifan(s.id, editVal); setEditCell(null) }}
                                    onKeyDown={e => { if (e.key==='Enter') { saveKeaktifan(s.id, editVal); setEditCell(null) } if (e.key==='Escape') setEditCell(null) }}
                                  />
                                ) : (
                                  v !== undefined && v !== null
                                    ? <span style={{ fontWeight:700, color: gradeColor(Number(v)) }}>{v}</span>
                                    : <span style={{ color:'var(--gray-300)', fontSize:11 }}>klik isi</span>
                                )}
                              </td>
                            )
                          }
                          return (
                            <td key={ci} style={{ padding:'10px', textAlign:'center', borderBottom:'1px solid var(--gray-100)' }}>
                              {v !== undefined && v !== null
                                ? <span style={{ fontWeight:700, color: gradeColor(Number(v)/c.max*100) }}>{v}</span>
                                : <span style={{ color:'var(--gray-300)' }}>–</span>}
                            </td>
                          )
                        })}
                        <td style={{ padding:'10px', textAlign:'center', borderBottom:'1px solid var(--gray-100)', borderLeft:'2px solid var(--gray-200)', background: si%2===0?'#f5f3ff':'#ede9fe' }}>
                          {fStr ? <span style={{ fontWeight:800, fontSize:15, color: gradeColor(final) }}>{fStr}</span>
                                : <span style={{ color:'var(--gray-300)' }}>–</span>}
                        </td>
                        <td style={{ padding:'10px', textAlign:'center', borderBottom:'1px solid var(--gray-100)', background: si%2===0?'#f5f3ff':'#ede9fe' }}>
                          {fStr ? (
                            <span style={{ fontWeight:800, fontSize:13, padding:'3px 10px', borderRadius:99, background: gradeColor(final)+'22', color: gradeColor(final) }}>
                              {grade}
                            </span>
                          ) : <span style={{ color:'var(--gray-300)' }}>–</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div style={{ display:'flex', gap:12, marginTop:12, fontSize:11, color:'var(--gray-500)', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ color:'#16a34a', fontWeight:700 }}>■ A ≥80</span>
            <span style={{ color:'#22c55e', fontWeight:700 }}>■ AB 75–79</span>
            <span style={{ color:'#3b82f6', fontWeight:700 }}>■ B 70–74</span>
            <span style={{ color:'#6366f1', fontWeight:700 }}>■ BC 65–69</span>
            <span style={{ color:'#ca8a04', fontWeight:700 }}>■ C 60–64</span>
            <span style={{ color:'#f97316', fontWeight:700 }}>■ CD 55–59</span>
            <span style={{ color:'#dc2626', fontWeight:700 }}>■ D 45–54</span>
            <span style={{ color:'#991b1b', fontWeight:700 }}>■ E &lt;45</span>
            <span>· – = Belum mengumpulkan</span>
            {!hasWeights && <span style={{ color:'#ca8a04' }}>⚠ Belum ada bobot → rata-rata sederhana</span>}
          </div>
        </>
      )}
    </div>
  )
}


/* ─────────────────────────────────────────────────────────── */
/*  TAB: VALIDASI SERTIFIKAT                                   */
/* ─────────────────────────────────────────────────────────── */
function SertifikatTab({ userId }) {
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


export default function Penilaian() {
  const { user }      = useAuth()
  const [tab, setTab] = useState('tugas')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Penilaian</h1>
        <p className="page-subtitle">Kelola nilai tugas dan ujian mahasiswa</p>
      </div>

      <TabBar active={tab} onChange={setTab} />

      {tab === 'tugas' && <TugasTab userId={user?.id} />}
      {tab === 'ujian' && <UjianTab userId={user?.id} />}
      {tab === 'rekap' && <RekapTab userId={user?.id} />}
      {tab === 'sertifikat' && <SertifikatTab userId={user?.id} />}
    </div>
  )
}
