import { useState, useEffect } from 'react'
import { Award, Settings2, Save, Loader2, BookOpen, TrendingUp, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'
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
function letterGrade(score) { return GRADES.find(g => score >= g.min) || GRADES[7] }
function gradeStyle(score)  { return letterGrade(score) }

const DEF_CFG = { tugas_weight:30, uts_weight:35, uas_weight:35, attendance_weight:0, passing_score:55 }

export default function NilaiAkhir() {
  const { user } = useAuth()
  const [courses,   setCourses]   = useState([])
  const [courseId,  setCourseId]  = useState('')
  const [config,    setConfig]    = useState(DEF_CFG)
  const [students,  setStudents]  = useState([])
  const [computed,  setComputed]  = useState([]) // per student final data
  const [loading,   setLoading]   = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [calculating, setCalc]    = useState(false)
  const [showCfg,   setShowCfg]   = useState(false)
  const [publishing, setPublish]  = useState(false)
  const [participation, setParticipation] = useState({}) // studentId -> score 0-100

  useEffect(() => {
    supabase.from('courses').select('id,code,name').eq('dosen_id', user?.id).eq('is_active', true)
      .then(({ data }) => { setCourses(data||[]); if (data?.length) setCourseId(data[0].id) })
  }, [user])

  useEffect(() => { if (courseId) { fetchConfig(); fetchData() } }, [courseId])

  async function fetchConfig() {
    const { data } = await supabase.from('grade_configs').select('*').eq('course_id', courseId).maybeSingle()
    setConfig(data || { ...DEF_CFG, course_id: courseId })
  }

  async function fetchData() {
    setLoading(true)
    // Get enrolled students
    const { data: enr } = await supabase.from('enrollments')
      .select('student:profiles!student_id(id,full_name,nim,avatar_url)').eq('course_id', courseId)
    const sts = (enr||[]).map(e=>e.student).filter(Boolean)
    setStudents(sts)

    // Get all assignments + submissions
    const { data: assignments } = await supabase.from('assignments')
      .select('id,max_score').eq('course_id', courseId)
    const { data: exams } = await supabase.from('exams')
      .select('id,title,type').eq('course_id', courseId)
    const { data: materials } = await supabase.from('materials')
      .select('id').eq('course_id', courseId)

    // Get existing final_grades
    const { data: existing } = await supabase.from('final_grades')
      .select('*').eq('course_id', courseId)

    if (!sts.length) { setLoading(false); return }

    const studentIds = sts.map(s=>s.id)
    const assignIds  = (assignments||[]).map(a=>a.id)
    const examIds    = (exams||[]).map(e=>e.id)

    const [{ data: subs }, { data: results }, { data: progress }] = await Promise.all([
      assignIds.length
        ? supabase.from('submissions').select('student_id,grade,assignment_id,status').in('assignment_id', assignIds).eq('status','graded')
        : Promise.resolve({ data:[] }),
      examIds.length
        ? supabase.from('exam_answers').select('student_id,score,exam_id').in('exam_id', examIds)
        : Promise.resolve({ data:[] }),
      supabase.from('course_progress').select('material_id, student_id').eq('course_id', courseId)
    ])

    // Build lookup maps
    const cfg = config
    const existMap = {}
    ;(existing||[]).forEach(e => { existMap[e.student_id] = e })

    // Participation (keaktifan) — otomatis dihitung dari progres penyelesaian materi
    const partMap = {}
    sts.forEach(st => {
      const stProg = (progress || []).filter(p => p.student_id === st.id).length
      const matTotal = materials?.length || 0
      partMap[st.id] = matTotal > 0 ? Math.min(100, Math.round((stProg / matTotal) * 100)) : 0
    })
    setParticipation(partMap)

    const computed = sts.map(st => {
      const ex = existMap[st.id]
      if (ex?.is_manual) return { ...st, ...ex, isManual: true }

      // Tugas avg (normalized to 100)
      const stSubs = (subs||[]).filter(s => s.student_id === st.id)
      let tugasAvg = 0
      if (stSubs.length && assignments?.length) {
        const aMap = {}
        ;(assignments||[]).forEach(a => { aMap[a.id] = a.max_score })
        tugasAvg = stSubs.reduce((sum,s) => sum + (s.grade / (aMap[s.assignment_id]||100) * 100), 0) / assignments.length
      }

      // UTS / UAS from exams (Quizzes / Competency)
      const stRes = (results||[]).filter(r => r.student_id === st.id)
      const getExamAvg = (type) => {
        const ids = (exams||[]).filter(e => {
          const t = e.type?.toLowerCase() || ''
          const title = e.title?.toLowerCase() || ''
          if (type === 'uts') {
            return t === 'uts' || t === 'kuis' || t === 'quiz' || title.includes('uts') || title.includes('kuis') || title.includes('quiz')
          }
          if (type === 'uas') {
            return t === 'uas' || t === 'final' || t === 'competency' || title.includes('uas') || title.includes('final') || title.includes('kompetensi')
          }
          return t === type || title.includes(type)
        }).map(e=>e.id)
        const rs  = stRes.filter(r => ids.includes(r.exam_id))
        if (!rs.length || !ids.length) return 0
        return rs.reduce((s,r) => s + (r.score||0), 0) / ids.length
      }
      const utsAvg = getExamAvg('uts')
      const uasAvg = getExamAvg('uas')

      // Keaktifan — otomatis dari progres materi
      const keaktifan = partMap[st.id] || 0

      // Final
      const totalW = Number(cfg.tugas_weight) + Number(cfg.uts_weight) + Number(cfg.uas_weight) + Number(cfg.attendance_weight)
      const finalScore = totalW > 0
        ? (tugasAvg * cfg.tugas_weight + utsAvg * cfg.uts_weight + uasAvg * cfg.uas_weight + keaktifan * cfg.attendance_weight) / totalW
        : 0

      return {
        ...st,
        tugas_avg: tugasAvg,
        uts_avg:   utsAvg,
        uas_avg:   uasAvg,
        attendance_pct: keaktifan,
        final_score: finalScore,
        grade_letter: letterGrade(finalScore).letter,
        published: ex?.published || false,
        isManual: false,
      }
    }).sort((a,b) => b.final_score - a.final_score)

    setComputed(computed)
    setLoading(false)
  }

  async function saveConfig() {
    setSavingCfg(true)
    const total = Number(config.tugas_weight) + Number(config.uts_weight) + Number(config.uas_weight) + Number(config.attendance_weight)
    if (total !== 100) { toast.error(`Total bobot harus 100% (saat ini ${total}%)`); setSavingCfg(false); return }
    const { error } = await supabase.from('grade_configs').upsert({ ...config, course_id: courseId, updated_at: new Date().toISOString() }, { onConflict: 'course_id' })
    setSavingCfg(false)
    if (error) toast.error('Gagal menyimpan konfigurasi')
    else { toast.success('Konfigurasi bobot disimpan!'); fetchData() }
  }

  async function calculateAndSave() {
    setCalc(true)
    const rows = computed.map(c => ({
      student_id: c.id, course_id: courseId,
      tugas_avg: c.tugas_avg, uts_avg: c.uts_avg, uas_avg: c.uas_avg,
      attendance_pct: participation[c.id] || 0,
      final_score: (() => {
        const keak = participation[c.id] || 0
        const totalW = Number(config.tugas_weight)+Number(config.uts_weight)+Number(config.uas_weight)+Number(config.attendance_weight)
        return totalW > 0 ? (c.tugas_avg*config.tugas_weight + c.uts_avg*config.uts_weight + c.uas_avg*config.uas_weight + keak*config.attendance_weight) / totalW : 0
      })(),
      grade_letter: letterGrade((() => {
        const keak = participation[c.id] || 0
        const totalW = Number(config.tugas_weight)+Number(config.uts_weight)+Number(config.uas_weight)+Number(config.attendance_weight)
        return totalW > 0 ? (c.tugas_avg*config.tugas_weight + c.uts_avg*config.uts_weight + c.uas_avg*config.uas_weight + keak*config.attendance_weight) / totalW : 0
      })()).letter,
      is_manual: false,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('final_grades').upsert(rows, { onConflict: 'student_id,course_id' })
    setCalc(false)
    if (error) toast.error('Gagal menyimpan nilai')
    else toast.success(`✅ ${rows.length} nilai akhir disimpan!`)
  }

  async function togglePublish(published) {
    setPublish(true)
    const { error } = await supabase.from('final_grades').update({ published }).eq('course_id', courseId)
    setPublish(false)
    if (error) toast.error('Gagal mengubah status publikasi')
    else { toast.success(published ? 'Nilai dipublikasikan ke mahasiswa!' : 'Nilai disembunyikan'); fetchData() }
  }

  const totalWeight = Number(config.tugas_weight)+Number(config.uts_weight)+Number(config.uas_weight)+Number(config.attendance_weight)
  const allPublished = computed.length > 0 && computed.every(c => c.published)
  const passCount = computed.filter(c => c.final_score >= Number(config.passing_score)).length

  return (
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Award size={20} color="var(--indigo-600)"/> Nilai Akhir
          </h1>
          <p className="page-subtitle">Kalkulasi otomatis berdasarkan komponen penilaian</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <select className="input" style={{ maxWidth:260 }} value={courseId} onChange={e=>setCourseId(e.target.value)}>
            {courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={()=>setShowCfg(!showCfg)} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <Settings2 size={13}/> Bobot
          </button>
          <button className="btn btn-primary btn-sm" onClick={calculateAndSave} disabled={calculating||!computed.length} style={{ display:'flex', alignItems:'center', gap:5 }}>
            {calculating ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Award size={13}/>}
            Hitung & Simpan
          </button>
          <button className="btn btn-sm" onClick={()=>togglePublish(!allPublished)} disabled={publishing}
            style={{ display:'flex', alignItems:'center', gap:5, background: allPublished?'#fef3c7':'#dcfce7', color: allPublished?'#92400e':'#15803d', border:'1px solid', borderColor: allPublished?'#fde68a':'#bbf7d0' }}>
            {allPublished ? <EyeOff size={13}/> : <Eye size={13}/>}
            {allPublished ? 'Sembunyikan' : 'Publikasikan'}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showCfg && (
        <div className="card" style={{ padding:'20px 24px', marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
            <Settings2 size={14} color="var(--indigo-600)"/> Konfigurasi Bobot Penilaian
            <span style={{ marginLeft:'auto', fontSize:12, fontWeight:400, color: totalWeight===100 ? '#16a34a' : '#dc2626' }}>
              Total: {totalWeight}% {totalWeight===100 ? '✓' : '(harus 100%)'}
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14 }}>
            {[
              { key:'tugas_weight',      label:'Tugas (%)',       color:'#f59e0b' },
              { key:'uts_weight',        label:'Kuis (%)',        color:'#6366f1' },
              { key:'uas_weight',        label:'Ujian Akhir (%)',  color:'#ef4444' },
              { key:'attendance_weight', label:'Progres Belajar (%)', color:'#10b981' },
              { key:'passing_score',     label:'Batas Kelulusan',  color:'#64748b' },
            ].map(f=>(
              <div key={f.key}>
                <label style={{ fontSize:11, fontWeight:700, color:f.color, display:'block', marginBottom:5 }}>{f.label}</label>
                <input className="input" type="number" min={0} max={100}
                  value={config[f.key]||0}
                  onChange={e=>setConfig(p=>({...p,[f.key]:+e.target.value}))}/>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={savingCfg} style={{ display:'flex', alignItems:'center', gap:5 }}>
              {savingCfg?<Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/>:<Save size={13}/>} Simpan Bobot
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#dbeafe' }}><BookOpen size={16} color="#2563eb"/></div>
          <div className="stat-card-label">Mahasiswa</div>
          <div className="stat-card-value">{students.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#dcfce7' }}><TrendingUp size={16} color="#16a34a"/></div>
          <div className="stat-card-label">Lulus (≥{config.passing_score})</div>
          <div className="stat-card-value" style={{ color:'#16a34a' }}>{passCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#fee2e2' }}><Award size={16} color="#dc2626"/></div>
          <div className="stat-card-label">Tidak Lulus</div>
          <div className="stat-card-value" style={{ color:'#dc2626' }}>{computed.length - passCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#fef3c7' }}><TrendingUp size={16} color="#d97706"/></div>
          <div className="stat-card-label">Rata-rata</div>
          <div className="stat-card-value">
            {computed.length ? (computed.reduce((s,c)=>s+c.final_score,0)/computed.length).toFixed(1) : '—'}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight:700, fontSize:13 }}>Rekap Nilai Akhir</span>
          <span style={{ fontSize:11, color:'var(--gray-400)' }}>
            Bobot: Tugas {config.tugas_weight}% · Kuis {config.uts_weight}% · Ujian Akhir {config.uas_weight}% · Progres {config.attendance_weight}%
          </span>
        </div>
        {loading ? (
          <div style={{ padding:'16px 0' }}>
            <Sk.StatCards n={4}/>
            <Sk.Table rows={5} cols={6}/>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--gray-50)', borderBottom:'2px solid var(--gray-200)' }}>
                  {['#','Mahasiswa','Tugas','Kuis','Ujian Akhir','Progres Belajar','Nilai Akhir','Grade','Status'].map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase', letterSpacing:'.4px', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computed.map((c,i)=>{
                  const gs = gradeStyle(c.final_score)
                  const pass = c.final_score >= Number(config.passing_score)
                  return (
                    <tr key={c.id} style={{ borderBottom:'1px solid var(--gray-100)', background: i%2===0?'transparent':'var(--gray-50)' }}>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'var(--gray-400)', fontWeight:600 }}>{i+1}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{c.full_name}</div>
                        <div style={{ fontSize:11, color:'var(--gray-400)' }}>{c.nim}</div>
                      </td>
                      {[c.tugas_avg, c.uts_avg, c.uas_avg].map((v,j)=>(
                        <td key={j} style={{ padding:'10px 14px', fontSize:12, fontWeight:600, color:'var(--gray-700)' }}>
                          <div>{v ? v.toFixed(1) : <span style={{ color:'var(--gray-300)' }}>—</span>}</div>
                          <div style={{ height:3, width:60, background:'var(--gray-100)', borderRadius:99, marginTop:4 }}>
                            <div style={{ height:'100%', width:`${Math.min(v||0,100)}%`, background:'var(--indigo-600)', borderRadius:99 }}/>
                          </div>
                        </td>
                      ))}
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--gray-800)' }}>
                            {(participation[c.id] ?? 0)}%
                          </span>
                          <span style={{ fontSize:9, color:'var(--gray-400)' }}>Otomatis Progres</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ fontSize:18, fontWeight:800, color: pass?'#065f46':'#991b1b' }}>
                          {c.final_score.toFixed(1)}
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:14, fontWeight:800, padding:'3px 10px', borderRadius:8, background:gs.bg, color:gs.color }}>{gs.letter}</span>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99,
                          background: c.published ? '#dcfce7' : '#f1f5f9',
                          color: c.published ? '#16a34a' : 'var(--gray-400)' }}>
                          {c.published ? '● Publik' : '○ Draft'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {!loading && computed.length === 0 && (
                  <tr><td colSpan={9} style={{ padding:48, textAlign:'center', color:'var(--gray-300)' }}>
                    Belum ada data mahasiswa
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
