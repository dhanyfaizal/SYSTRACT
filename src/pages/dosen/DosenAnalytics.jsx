import { useState, useEffect, useMemo } from 'react'
import { BarChart2, TrendingUp, Users, ClipboardList, CheckCircle2, AlertTriangle, Award, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Sk from '@/components/ui/Skeleton'

const GRADE_BANDS = [
  { label:'A',  min:80, color:'#166534', bg:'#bbf7d0' },
  { label:'AB', min:75, color:'#15803d', bg:'#dcfce7' },
  { label:'B',  min:70, color:'#1d4ed8', bg:'#dbeafe' },
  { label:'BC', min:65, color:'#2563eb', bg:'#eff6ff' },
  { label:'C',  min:60, color:'#d97706', bg:'#fef9c3' },
  { label:'CD', min:55, color:'#b45309', bg:'#fef3c7' },
  { label:'D',  min:45, color:'#ea580c', bg:'#ffedd5' },
  { label:'E',  min:0,  color:'#dc2626', bg:'#fee2e2' },
]
function bandOf(s) { return GRADE_BANDS.find(g => s >= g.min) || GRADE_BANDS[7] }

// Simple inline bar chart
function BarChart({ data, maxVal, height=120 }) {
  if (!data.length) return null
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height, paddingTop:8 }}>
      {data.map((d,i) => {
        const pct = maxVal > 0 ? (d.value / maxVal * 100) : 0
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ fontSize:10, fontWeight:700, color:d.color||'var(--indigo-600)' }}>{d.value || ''}</div>
            <div style={{ width:'100%', background:'var(--gray-100)', borderRadius:4, overflow:'hidden', flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
              <div style={{ width:'100%', height:`${pct}%`, minHeight: pct>0?4:0, background:d.color||'var(--indigo-600)', borderRadius:4, transition:'height .4s ease' }}/>
            </div>
            <div style={{ fontSize:9, color:'var(--gray-400)', textAlign:'center', lineHeight:1.2 }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// Horizontal progress bar row
function ProgressRow({ label, value, max, color='var(--indigo-600)', suffix='%' }) {
  const pct = max > 0 ? Math.min(value/max*100, 100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
        <span style={{ color:'var(--gray-600)', fontWeight:500 }}>{label}</span>
        <span style={{ fontWeight:700, color }}>{typeof value==='number'?value.toFixed(1):value}{suffix}</span>
      </div>
      <div style={{ height:6, background:'var(--gray-100)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:99, transition:'width .5s ease' }}/>
      </div>
    </div>
  )
}

export default function DosenAnalytics() {
  const { user } = useAuth()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    students:[], assignments:[], submissions:[], finalGrades:[],
    sessions:[], attendances:[], exams:[], examAnswers:[],
  })

  useEffect(() => {
    supabase.from('courses').select('id,code,name').eq('dosen_id', user?.id).eq('is_active', true)
      .then(({ data }) => { setCourses(data||[]); if (data?.length) setCourseId(data[0].id) })
  }, [user])

  useEffect(() => { if (courseId) fetchAll() }, [courseId])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: enr }, { data: assignments }, { data: sessions },
      { data: finalGrades }, { data: exams },
    ] = await Promise.all([
      supabase.from('enrollments').select('student:profiles!student_id(id,full_name,nim)').eq('course_id', courseId),
      supabase.from('assignments').select('id,title,due_date,max_score').eq('course_id', courseId).order('due_date'),
      supabase.from('attendance_sessions').select('id,meeting_number,title,created_at').eq('course_id', courseId).eq('dosen_id', user.id).order('meeting_number'),
      supabase.from('final_grades').select('*').eq('course_id', courseId),
      supabase.from('exams').select('id,title,type').eq('course_id', courseId),
    ])
    const students = (enr||[]).map(e=>e.student).filter(Boolean)
    const assignIds  = (assignments||[]).map(a=>a.id)
    const sessionIds = (sessions||[]).map(s=>s.id)
    const examIds    = (exams||[]).map(e=>e.id)

    const [{ data: subs }, { data: atts }, { data: examAns }] = await Promise.all([
      assignIds.length
        ? supabase.from('submissions').select('id,student_id,assignment_id,grade,status,submitted_at').in('assignment_id', assignIds)
        : Promise.resolve({ data:[] }),
      sessionIds.length
        ? supabase.from('attendances').select('student_id,status,session_id').in('session_id', sessionIds)
        : Promise.resolve({ data:[] }),
      examIds.length
        ? supabase.from('exam_answers').select('student_id,exam_id,score,submitted_at').in('exam_id', examIds)
        : Promise.resolve({ data:[] }),
    ])
    setData({ students, assignments:assignments||[], submissions:subs||[], finalGrades:finalGrades||[], sessions:sessions||[], attendances:atts||[], exams:exams||[], examAnswers:examAns||[] })
    setLoading(false)
  }

  const { students, assignments, submissions, finalGrades, sessions, attendances, exams, examAnswers } = data

  // ── Computed metrics ────────────────────────────────────────
  const totalStudents = students.length

  // Avg submission rate
  const submissionRate = useMemo(() => {
    if (!assignments.length || !totalStudents) return 0
    const submitted = submissions.filter(s => s.status !== 'draft').length
    return submitted / (assignments.length * totalStudents) * 100
  }, [submissions, assignments, totalStudents])

  // Avg grade per assignment (only graded)
  const assignmentAvgs = useMemo(() => assignments.map(a => {
    const graded = submissions.filter(s => s.assignment_id === a.id && s.grade != null)
    const avg = graded.length ? graded.reduce((s,x) => s + (x.grade/(a.max_score||100)*100), 0) / graded.length : null
    const subCount = submissions.filter(s => s.assignment_id === a.id && s.status !== 'draft').length
    return { ...a, avg, subCount, gradedCount: graded.length }
  }), [assignments, submissions])

  // Grade distribution from final_grades
  const gradeDist = useMemo(() => {
    if (!finalGrades.length) return []
    return GRADE_BANDS.map(b => {
      const next = GRADE_BANDS[GRADE_BANDS.indexOf(b)-1]
      const count = finalGrades.filter(g => {
        const s = g.final_score||0
        return s >= b.min && (next ? s < next.min : true)
      }).length
      return { label:b.label, value:count, color:b.color }
    }).filter(b => b.value > 0)
  }, [finalGrades])

  // Attendance per session
  const sessionStats = useMemo(() => sessions.map(s => {
    const satts = attendances.filter(a => a.session_id === s.id)
    const hadir = satts.filter(a => a.status === 'hadir').length
    const pct   = totalStudents > 0 ? hadir/totalStudents*100 : 0
    return { ...s, hadir, pct }
  }), [sessions, attendances, totalStudents])

  const avgAttendance = sessionStats.length
    ? sessionStats.reduce((s,x)=>s+x.pct,0)/sessionStats.length : 0

  // Top/bottom students
  const studentRanking = useMemo(() => {
    return students.map(st => {
      const fg = finalGrades.find(g => g.student_id === st.id)
      const stSubs = submissions.filter(s => s.student_id === st.id && s.grade != null)
      const tugasAvg = stSubs.length
        ? stSubs.reduce((s,x) => {
            const a = assignments.find(a=>a.id===x.assignment_id)
            return s + (x.grade/(a?.max_score||100)*100)
          }, 0) / stSubs.length
        : 0
      const stAtts = attendances.filter(a => a.student_id === st.id)
      const hadirPct = sessions.length ? stAtts.filter(a=>a.status==='hadir').length/sessions.length*100 : 0
      const score = fg?.final_score ?? tugasAvg
      return { ...st, score, tugasAvg, hadirPct, hasFinal: !!fg, grade: fg?.grade_letter }
    }).sort((a,b) => b.score - a.score)
  }, [students, finalGrades, submissions, attendances, sessions, assignments])

  const avgFinal = finalGrades.length
    ? finalGrades.reduce((s,g)=>s+(g.final_score||0),0)/finalGrades.length : 0

  const atRisk = studentRanking.filter(s => s.score < 55 || s.hadirPct < 75)

  if (loading) return (
    <div>
      <Sk.PageHeader/>
      <Sk.StatCards n={5}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        <div className="card" style={{ padding:20 }}><Sk.Chart h={140} label="Tugas"/></div>
        <div className="card" style={{ padding:20 }}><Sk.Chart h={140} label="Kehadiran"/></div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        <div className="card" style={{ padding:20 }}><Sk.Chart h={120} label="Distribusi Nilai"/></div>
        <Sk.CardList n={4}/>
      </div>
      <Sk.Table rows={6} cols={6}/>
    </div>
  )

  return (
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BarChart2 size={20} color="var(--indigo-600)"/> Analitik Kelas
          </h1>
          <p className="page-subtitle">Monitoring performa mahasiswa secara menyeluruh</p>
        </div>
        <select className="input" style={{ maxWidth:260 }} value={courseId} onChange={e=>setCourseId(e.target.value)}>
          {courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom:20 }}>
        {[
          { icon:Users,         label:'Mahasiswa',         value:totalStudents,               color:'#2563eb', bg:'#dbeafe' },
          { icon:ClipboardList, label:'Submission Rate',   value:`${submissionRate.toFixed(1)}%`, color:'#d97706', bg:'#fef3c7' },
          { icon:CheckCircle2,  label:'Rata-rata Kehadiran', value:`${avgAttendance.toFixed(1)}%`, color:'#16a34a', bg:'#dcfce7' },
          { icon:Award,         label:'Rata-rata Nilai Akhir', value: finalGrades.length ? avgFinal.toFixed(1) : '—', color:'#7c3aed', bg:'#ede9fe' },
          { icon:AlertTriangle, label:'At-Risk (<55/75%)', value:atRisk.length,               color:'#dc2626', bg:'#fee2e2' },
        ].map(k=>(
          <div key={k.label} className="stat-card">
            <div className="stat-card-icon" style={{ background:k.bg }}><k.icon size={16} color={k.color}/></div>
            <div className="stat-card-label">{k.label}</div>
            <div className="stat-card-value" style={{ color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Assignment submission & avg */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><ClipboardList size={14}/> Tugas — Pengumpulan & Nilai Rata-rata</span>
          </div>
          {assignmentAvgs.length === 0 ? (
            <div className="empty-state" style={{ padding:40 }}><ClipboardList size={24} color="var(--gray-200)"/><p className="empty-state-text" style={{ fontSize:12 }}>Belum ada tugas</p></div>
          ) : (
            <div style={{ padding:'8px 16px 16px' }}>
              {assignmentAvgs.map(a => (
                <div key={a.id} style={{ marginBottom:14, paddingBottom:14, borderBottom:'1px solid var(--gray-100)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--gray-700)' }}>{a.title}</span>
                    <div style={{ display:'flex', gap:8 }}>
                      <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'#eff6ff', color:'#2563eb', fontWeight:700 }}>
                        {a.subCount}/{totalStudents} kumpul
                      </span>
                      {a.avg != null && (
                        <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background: a.avg>=70?'#dcfce7':'#fee2e2', color: a.avg>=70?'#16a34a':'#dc2626', fontWeight:700 }}>
                          avg {a.avg.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height:5, background:'var(--gray-100)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${totalStudents>0?a.subCount/totalStudents*100:0}%`, background:'var(--indigo-600)', borderRadius:99, transition:'width .4s' }}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance per session */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><CheckCircle2 size={14}/> Kehadiran Per Pertemuan</span>
            <span style={{ fontSize:11, color:'var(--gray-400)' }}>{sessions.length} sesi</span>
          </div>
          {sessionStats.length === 0 ? (
            <div className="empty-state" style={{ padding:40 }}><CheckCircle2 size={24} color="var(--gray-200)"/><p className="empty-state-text" style={{ fontSize:12 }}>Belum ada sesi presensi</p></div>
          ) : (
            <div style={{ padding:'8px 20px 16px' }}>
              <BarChart
                data={sessionStats.map(s=>({ label:`P${s.meeting_number}`, value:s.hadir, color: s.pct>=75?'#16a34a':s.pct>=50?'#f59e0b':'#ef4444' }))}
                maxVal={totalStudents} height={120}
              />
              <div style={{ fontSize:11, color:'var(--gray-400)', textAlign:'center', marginTop:8 }}>
                Jumlah mahasiswa hadir per pertemuan (target: {totalStudents})
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Grade distribution */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Award size={14}/> Distribusi Nilai Akhir</span>
            <span style={{ fontSize:11, color:'var(--gray-400)' }}>{finalGrades.length} mahasiswa</span>
          </div>
          {finalGrades.length === 0 ? (
            <div className="empty-state" style={{ padding:40 }}><Award size={24} color="var(--gray-200)"/><p className="empty-state-text" style={{ fontSize:12 }}>Nilai akhir belum dihitung</p><p className="empty-state-sub">Gunakan halaman Nilai Akhir</p></div>
          ) : (
            <div style={{ padding:'8px 20px 16px' }}>
              <BarChart
                data={GRADE_BANDS.map(b=>{
                  const next = GRADE_BANDS[GRADE_BANDS.indexOf(b)-1]
                  const count = finalGrades.filter(g=>{
                    const s=g.final_score||0; return s>=b.min&&(next?s<next.min:true)
                  }).length
                  return { label:b.label, value:count, color:b.color }
                })}
                maxVal={Math.max(...GRADE_BANDS.map(b=>{
                  const next = GRADE_BANDS[GRADE_BANDS.indexOf(b)-1]
                  return finalGrades.filter(g=>{const s=g.final_score||0;return s>=b.min&&(next?s<next.min:true)}).length
                }))}
                height={120}
              />
            </div>
          )}
        </div>

        {/* At-risk students */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={14} color="#dc2626"/> Mahasiswa At-Risk</span>
            <span style={{ fontSize:11, padding:'1px 8px', borderRadius:99, background:'#fee2e2', color:'#dc2626', fontWeight:700 }}>{atRisk.length} mahasiswa</span>
          </div>
          {atRisk.length === 0 ? (
            <div className="empty-state" style={{ padding:40 }}>
              <CheckCircle2 size={24} color="#16a34a"/>
              <p className="empty-state-text" style={{ fontSize:12, color:'#16a34a' }}>Semua mahasiswa dalam kondisi baik 🎉</p>
            </div>
          ) : (
            <div style={{ maxHeight:240, overflowY:'auto' }}>
              {atRisk.map(st => (
                <div key={st.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderTop:'1px solid var(--gray-100)' }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'#fee2e2', color:'#dc2626', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {st.full_name?.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600 }}>{st.full_name}</div>
                    <div style={{ fontSize:10, color:'var(--gray-400)' }}>{st.nim}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12, fontWeight:700, color: st.score<55?'#dc2626':'var(--gray-700)' }}>
                      {st.score.toFixed(1)}
                    </div>
                    <div style={{ fontSize:10, color: st.hadirPct<75?'#dc2626':'var(--gray-400)' }}>
                      Hadir {st.hadirPct.toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student ranking table */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><TrendingUp size={14}/> Ranking Mahasiswa</span>
          <span style={{ fontSize:11, color:'var(--gray-400)' }}>{totalStudents} mahasiswa</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--gray-50)', borderBottom:'2px solid var(--gray-200)' }}>
                {['#','Mahasiswa','Nilai Tugas','Kehadiran','Nilai Akhir','Grade'].map(h=>(
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studentRanking.map((st,i)=>{
                const gs = bandOf(st.score)
                return (
                  <tr key={st.id} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                    <td style={{ padding:'9px 14px', fontSize:12, color:'var(--gray-400)', fontWeight:600, width:32 }}>{i+1}</td>
                    <td style={{ padding:'9px 14px' }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{st.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{st.nim}</div>
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <ProgressRow label="" value={st.tugasAvg} max={100} color="var(--indigo-600)" suffix=""/>
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <div style={{ fontSize:12, fontWeight:700, color: st.hadirPct<75?'#dc2626':'#16a34a' }}>{st.hadirPct.toFixed(0)}%</div>
                      <div style={{ height:4, width:60, background:'var(--gray-100)', borderRadius:99, marginTop:3 }}>
                        <div style={{ height:'100%', width:`${st.hadirPct}%`, background: st.hadirPct<75?'#ef4444':'#16a34a', borderRadius:99 }}/>
                      </div>
                    </td>
                    <td style={{ padding:'9px 14px', fontSize:16, fontWeight:800, color: st.score>=55?'#065f46':'#dc2626' }}>
                      {st.score > 0 ? st.score.toFixed(1) : <span style={{ color:'var(--gray-300)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      {st.score > 0
                        ? <span style={{ fontSize:13, fontWeight:800, padding:'3px 10px', borderRadius:8, background:gs.bg, color:gs.color }}>{gs.label}</span>
                        : <span style={{ fontSize:11, color:'var(--gray-300)' }}>—</span>
                      }
                    </td>
                  </tr>
                )
              })}
              {totalStudents === 0 && (
                <tr><td colSpan={6} style={{ padding:48, textAlign:'center', color:'var(--gray-300)' }}>Belum ada mahasiswa terdaftar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
