import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle, Award } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const THRESHOLD = 75 // minimum kehadiran %

export default function AttendanceAnalytics({ courseId, students }) {
  const { user } = useAuth()
  const [data,    setData]    = useState([]) // per student summary
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (courseId && students.length) fetchData() }, [courseId, students])

  async function fetchData() {
    setLoading(true)
    const [{ data: sess }, { data: atts }] = await Promise.all([
      supabase.from('attendance_sessions')
        .select('id,meeting_number,title,created_at')
        .eq('course_id', courseId)
        .eq('dosen_id', user.id)
        .order('meeting_number'),
      supabase.from('attendances')
        .select('student_id,status,session_id')
        .in('session_id',
          // subquery: get session ids for this course
          (await supabase.from('attendance_sessions')
            .select('id').eq('course_id', courseId).eq('dosen_id', user.id)
          ).data?.map(s => s.id) || []
        ),
    ])

    const total = (sess || []).length
    // Build per-student summary
    const summary = students.map(st => {
      const mine = (atts || []).filter(a => a.student_id === st.id)
      const cnt = s => mine.filter(a => a.status === s).length
      const hadir = cnt('hadir')
      const izin  = cnt('izin')
      const sakit = cnt('sakit')
      const alpha = cnt('alpha')
      const pct = total > 0 ? Math.round(hadir / total * 100) : 0
      return { ...st, hadir, izin, sakit, alpha, total, pct }
    }).sort((a, b) => b.pct - a.pct)

    setData(summary)
    setSessions(sess || [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding:60, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>

  const danger  = data.filter(d => d.pct < THRESHOLD && d.total > 0)
  const avgPct  = data.length ? Math.round(data.reduce((s,d) => s + d.pct, 0) / data.length) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#dbeafe' }}><TrendingUp size={18} color="#2563eb"/></div>
          <div className="stat-card-label">Total Pertemuan</div>
          <div className="stat-card-value">{sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#dcfce7' }}><Award size={18} color="#16a34a"/></div>
          <div className="stat-card-label">Rata-rata Kehadiran</div>
          <div className="stat-card-value" style={{ color: avgPct >= THRESHOLD ? '#16a34a' : '#dc2626' }}>{avgPct}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'#fee2e2' }}><AlertTriangle size={18} color="#dc2626"/></div>
          <div className="stat-card-label">Di Bawah {THRESHOLD}%</div>
          <div className="stat-card-value" style={{ color:'#dc2626' }}>{danger.length}</div>
          <div className="stat-card-sub">mahasiswa</div>
        </div>
      </div>

      {/* Alert danger students */}
      {danger.length > 0 && (
        <div style={{ padding:'12px 16px', background:'#fff1f2', border:'1px solid #fecaca', borderRadius:10, display:'flex', gap:10, alignItems:'flex-start' }}>
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>
              Peringatan Kehadiran — {danger.length} mahasiswa di bawah {THRESHOLD}%
            </div>
            <div style={{ fontSize:12, color:'#dc2626', marginTop:4, opacity:.85 }}>
              {danger.map(d => `${d.full_name} (${d.pct}%)`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Student table */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight:700, fontSize:13 }}>Rekap Kehadiran per Mahasiswa</span>
          <span style={{ fontSize:11, color:'var(--gray-400)' }}>{data.length} mahasiswa · {sessions.length} pertemuan</span>
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state" style={{ padding:48 }}>
            <TrendingUp size={28} color="var(--gray-200)"/>
            <p className="empty-state-text">Belum ada data presensi</p>
          </div>
        ) : data.map((d, idx) => {
          const warn = d.pct < THRESHOLD && d.total > 0
          return (
            <div key={d.id} style={{
              display:'flex', alignItems:'center', gap:14, padding:'12px 20px',
              borderTop:'1px solid var(--gray-100)',
              background: warn ? 'rgba(220,38,38,.04)' : 'transparent',
            }}>
              {/* Rank */}
              <div style={{ width:24, textAlign:'center', fontSize:12, fontWeight:700, color:'var(--gray-400)', flexShrink:0 }}>
                {idx + 1}
              </div>

              {/* Avatar */}
              <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--indigo-50)', color:'var(--indigo-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                {d.avatar_url ? <img src={d.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : d.full_name?.slice(0,2).toUpperCase()}
              </div>

              {/* Name */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                  {d.full_name}
                  {warn && <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:99, background:'#fee2e2', color:'#dc2626' }}>⚠ Kurang</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--gray-400)' }}>{d.nim}</div>
              </div>

              {/* Status pills */}
              <div style={{ display:'flex', gap:8, fontSize:12 }}>
                {[
                  { s:'hadir', label:'H', c:'#16a34a', bg:'#dcfce7' },
                  { s:'izin',  label:'I', c:'#2563eb', bg:'#dbeafe' },
                  { s:'sakit', label:'S', c:'#d97706', bg:'#fef3c7' },
                  { s:'alpha', label:'A', c:'#dc2626', bg:'#fee2e2' },
                ].map(o => (
                  <span key={o.s} style={{ padding:'2px 8px', borderRadius:99, background:o.bg, color:o.c, fontWeight:700 }}>
                    {o.label}: {d[o.s]}
                  </span>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ width:120, flexShrink:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                  <span style={{ color:'var(--gray-400)' }}>{d.hadir}/{d.total}</span>
                  <span style={{ fontWeight:700, color: warn ? '#dc2626' : '#16a34a' }}>{d.pct}%</span>
                </div>
                <div style={{ height:6, background:'var(--gray-100)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{
                    height:'100%', width:`${d.pct}%`,
                    background: d.pct >= THRESHOLD ? '#16a34a' : d.pct >= 50 ? '#d97706' : '#dc2626',
                    borderRadius:99, transition:'width .4s ease',
                  }}/>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-session summary */}
      {sessions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13 }}>Rekap Per Pertemuan</span>
          </div>
          {sessions.map(_s => {
            // fetch aggregates from data
            return null // placeholder — komponen ini bisa dikembangkan
          })}
          <div style={{ padding:'12px 20px', fontSize:12, color:'var(--gray-400)' }}>
            {sessions.map(s => (
              <div key={s.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--gray-100)' }}>
                <span style={{ fontWeight:600 }}>P{s.meeting_number} — {s.title}</span>
                <span>{new Date(s.created_at).toLocaleDateString('id-ID', { dateStyle:'medium' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
