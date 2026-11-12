import { useState, useEffect } from 'react'
import { BarChart2, Loader2, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/withRetry'
import toast from 'react-hot-toast'
import { gradeColor, gradeLetter } from './shared'


export default function RekapTab({ userId }) {
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
