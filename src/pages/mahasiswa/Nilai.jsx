import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, Award, ChevronDown, ChevronUp, Lock, Eye } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Sk from '@/components/ui/Skeleton'

const GRADES = [
  { min:80, letter:'A',  color:'#166534', bg:'#bbf7d0' },
  { min:75, letter:'AB', color:'#15803d', bg:'#dcfce7' },
  { min:70, letter:'B',  color:'#1d4ed8', bg:'#dbeafe' },
  { min:65, letter:'BC', color:'#2563eb', bg:'#eff6ff' },
  { min:60, letter:'C',  color:'#d97706', bg:'#fef9c3' },
  { min:55, letter:'CD', color:'#b45309', bg:'#fef3c7' },
  { min:45, letter:'D',  color:'#ea580c', bg:'#ffedd5' },
  { min:0,  letter:'E',  color:'#dc2626', bg:'#fee2e2' },
]
function gradeOf(s) { return GRADES.find(g => s >= g.min) || GRADES[4] }

export default function Nilai() {
  const { user } = useAuth()
  const [grades,      setGrades]      = useState([])
  const [finalGrades, setFinalGrades] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState(null)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    setLoading(true)
    const [{ data: subs }, { data: finals }] = await Promise.all([
      supabase.from('submissions')
        .select('id,grade,status,graded_at,feedback,assignment:assignments(title,max_score,course:courses(id,name,code))')
        .eq('student_id', user.id).eq('status','graded').order('graded_at',{ascending:false}),
      supabase.from('final_grades')
        .select('*,course:courses(id,name,code)').eq('student_id', user.id).eq('published', true),
    ])
    setGrades(subs||[])
    setFinalGrades(finals||[])
    setLoading(false)
  }

  const avg = grades.length
    ? (grades.reduce((s,g)=>s+(g.grade/g.assignment?.max_score*100),0)/grades.length).toFixed(1) : 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <BarChart2 size={20} color="var(--indigo-600)"/> Nilai Saya
        </h1>
        <p className="page-subtitle">Rekap penilaian dan nilai akhir per kursus</p>
      </div>

      <div className="stats-grid" style={{ marginBottom:24 }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'var(--indigo-50)' }}><BarChart2 size={16} color="var(--indigo-600)"/></div>
          <div className="stat-card-label">Tugas Dinilai</div>
          <div className="stat-card-value">{loading ? '–' : grades.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#d1fae5' }}><TrendingUp size={16} color="#10b981"/></div>
          <div className="stat-card-label">Rata-rata Tugas</div>
          <div className="stat-card-value">{loading ? '–' : `${avg}%`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#fef3c7' }}><Award size={16} color="#d97706"/></div>
          <div className="stat-card-label">Kursus Selesai</div>
          <div className="stat-card-value">{loading ? '–' : finalGrades.length}</div>
        </div>
      </div>

      {/* Final grades section */}
      {finalGrades.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--gray-700)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
            <Award size={15} color="var(--indigo-600)"/> Nilai Akhir Per Kursus
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {finalGrades.map(fg => {
              const gs = gradeOf(fg.final_score||0)
              const isOpen = expanded === fg.id
              const comps = [
                { label:'Tugas',    val:fg.tugas_avg,      color:'#f59e0b' },
                { label:'Evaluasi', val:fg.uts_avg,        color:'#6366f1' },
                { label:'Evaluasi', val:fg.uas_avg,        color:'#ef4444' },
                { label:'Kehadiran',val:fg.attendance_pct, color:'#10b981' },
              ].filter(c => c.val != null && c.val > 0)
              return (
                <div key={fg.id} className="card" style={{ overflow:'hidden' }}>
                  <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                    {/* Grade badge */}
                    <div style={{ width:52, height:52, borderRadius:12, background:gs.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:24, fontWeight:900, color:gs.color }}>{gs.letter}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{fg.course?.code} – {fg.course?.name}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:gs.color, lineHeight:1.2 }}>
                        {fg.final_score?.toFixed(1)}
                        <span style={{ fontSize:11, fontWeight:400, color:'var(--gray-400)', marginLeft:4 }}>/ 100</span>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setExpanded(isOpen?null:fg.id)}>
                      {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    </button>
                  </div>

                  {isOpen && comps.length > 0 && (
                    <div style={{ padding:'0 20px 16px', borderTop:'1px solid var(--gray-100)' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.4, padding:'10px 0 8px' }}>Rincian Komponen</div>
                      {comps.map(c => (
                        <div key={c.label} style={{ marginBottom:8 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                            <span style={{ color:'var(--gray-600)', fontWeight:500 }}>{c.label}</span>
                            <span style={{ fontWeight:700, color:c.color }}>{c.val.toFixed(1)}</span>
                          </div>
                          <div style={{ height:6, background:'var(--gray-100)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${Math.min(c.val||0,100)}%`, background:c.color, borderRadius:99, transition:'width .4s' }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pending notice */}
      {finalGrades.length === 0 && !loading && (
        <div style={{ marginBottom:20, padding:'14px 18px', background:'#f8fafc', border:'1px solid var(--gray-200)', borderRadius:10, display:'flex', gap:10, alignItems:'center' }}>
          <Lock size={14} color="var(--gray-400)"/>
          <span style={{ fontSize:13, color:'var(--gray-500)' }}>Nilai akhir belum dipublikasikan oleh instruktur.</span>
        </div>
      )}

      {/* Detail tugas */}
      <div style={{ fontWeight:700, fontSize:14, color:'var(--gray-700)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
        <BarChart2 size={15} color="var(--indigo-600)"/> Detail Nilai Tugas
      </div>
      <div className="card">
        {loading ? (
          <Sk.Table rows={4} cols={5} showHeader={false}/>
        ) : grades.length === 0 ? (
          <div className="card-body">
            <div className="empty-state"><BarChart2 size={32} color="var(--gray-200)"/><p className="empty-state-text">Belum ada nilai tugas</p></div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--gray-50)', borderBottom:'1px solid var(--gray-200)' }}>
                {['Kursus','Tugas','Nilai','%','Feedback'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase', letterSpacing:'.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grades.map((g,i)=>{
                const pct = g.assignment?.max_score ? ((g.grade/g.assignment.max_score)*100).toFixed(0) : '-'
                const col = pct>=80?'#065f46':pct>=60?'#92400e':'#991b1b'
                const bg  = pct>=80?'#d1fae5':pct>=60?'#fef3c7':'#fee2e2'
                return (
                  <tr key={g.id} style={{ borderBottom:i<grades.length-1?'1px solid var(--gray-100)':'none' }}>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      <div style={{ fontWeight:600 }}>{g.assignment?.course?.code}</div>
                      <div style={{ color:'var(--gray-400)', fontSize:11 }}>{g.assignment?.course?.name}</div>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>{g.assignment?.title}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:'var(--indigo-600)' }}>
                      {g.grade} <span style={{ fontSize:11, color:'var(--gray-400)', fontWeight:400 }}>/ {g.assignment?.max_score}</span>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:bg, color:col, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{pct}%</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'var(--gray-500)', maxWidth:200 }}>
                      {g.feedback||<span style={{ color:'var(--gray-300)' }}>–</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
