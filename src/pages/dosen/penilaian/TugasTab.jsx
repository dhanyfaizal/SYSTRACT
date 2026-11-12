import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Loader2, Star, ClipboardList } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/withRetry'
import FilePreview from '@/components/drive/FilePreview'
import toast from 'react-hot-toast'
import Sk from '@/components/ui/Skeleton'


/* ─────────────────────────────────────────────────────────── */
/*  TAB: TUGAS                                                 */
/* ─────────────────────────────────────────────────────────── */
export default function TugasTab({ userId }) {
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
