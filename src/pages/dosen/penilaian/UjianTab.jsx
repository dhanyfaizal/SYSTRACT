import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Sk from '@/components/ui/Skeleton'
import { MODE_LABEL, MODE_COLOR, TYPE_LABEL } from './shared'




/* ─────────────────────────────────────────────────────────── */
/*  TAB: UJIAN                                                 */
/* ─────────────────────────────────────────────────────────── */
export default function UjianTab({ userId }) {
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
