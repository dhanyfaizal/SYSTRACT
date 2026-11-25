import { useState, useEffect, useEffectEvent } from 'react'
import { Save, Loader2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth'
import toast from 'react-hot-toast'

const OPTS = [
  { value:'hadir', label:'Hadir', color:'#16a34a', bg:'#dcfce7' },
  { value:'izin',  label:'Izin',  color:'#2563eb', bg:'#dbeafe' },
  { value:'sakit', label:'Sakit', color:'#d97706', bg:'#fef3c7' },
  { value:'alpha', label:'Alpha', color:'#dc2626', bg:'#fee2e2' },
]

export default function AttendanceManual({ courseId, students }) {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [selSession, setSelSession] = useState('')
  const [draft, setDraft] = useState({}) // studentId -> status
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newMeeting, setNewMeeting] = useState({ title:'', meeting_number:1 })
  const [showNew, setShowNew] = useState(false)

  // Dipanggil efek di bawah; selalu memakai fungsi & state terbaru (useEffectEvent).
  const muatSaatBerubah1 = useEffectEvent(() => { if (courseId) fetchSessions() })
  useEffect(() => { muatSaatBerubah1() }, [courseId])
  // Dipanggil efek di bawah; selalu memakai fungsi & state terbaru (useEffectEvent).
  const muatSaatBerubah2 = useEffectEvent(() => { if (selSession) loadExisting() })
  useEffect(() => { muatSaatBerubah2() }, [selSession])

  async function fetchSessions() {
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id,title,meeting_number,created_at')
      .eq('course_id', courseId)
      .eq('dosen_id', user.id)
      .order('meeting_number')
    setSessions(data || [])
    if (data?.length) setSelSession(data[data.length - 1].id)
  }

  async function loadExisting() {
    setLoading(true)
    const { data } = await supabase.from('attendances')
      .select('student_id,status').eq('session_id', selSession)
    const map = {}
    ;(data || []).forEach(a => { map[a.student_id] = a.status })
    setDraft(map)
    setLoading(false)
  }

  async function createSessionAndSelect() {
    if (!newMeeting.title.trim()) { toast.error('Judul wajib diisi'); return }
    const code = Math.random().toString(36).slice(2,8).toUpperCase()
    const expires_at = new Date(Date.now() + 1000).toISOString() // langsung expired (manual mode)
    const { data, error } = await supabase.from('attendance_sessions').insert({
      course_id: courseId, dosen_id: user.id,
      title: newMeeting.title.trim(),
      meeting_number: newMeeting.meeting_number,
      code, expires_at, is_active: false,
    }).select().single()
    if (error) { toast.error('Gagal membuat pertemuan'); return }
    toast.success('Pertemuan ditambahkan')
    setShowNew(false)
    await fetchSessions()
    setSelSession(data.id)
  }

  async function saveAll() {
    if (!selSession) return
    setSaving(true)
    const rows = students.map(st => ({
      session_id: selSession,
      student_id: st.id,
      status: draft[st.id] || 'alpha',
    }))
    const { error } = await supabase.from('attendances')
      .upsert(rows, { onConflict: 'session_id,student_id' })
    setSaving(false)
    if (error) toast.error('Gagal menyimpan')
    else toast.success(`✅ ${rows.length} data kehadiran disimpan!`)
  }

  const setStatus = (sid, val) => setDraft(d => ({ ...d, [sid]: val }))
  const countOf = s => students.filter(st => (draft[st.id]||'alpha') === s).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Toolbar */}
      <div className="card" style={{ padding:'16px 20px' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', marginBottom:6, textTransform:'uppercase' }}>Pilih Pertemuan</div>
            <select className="input" value={selSession} onChange={e => setSelSession(e.target.value)}>
              <option value="">-- Pilih --</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  Pertemuan {s.meeting_number} – {s.title}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNew(!showNew)}>
              + Tambah Pertemuan
            </button>
            <button className="btn btn-primary" onClick={saveAll} disabled={saving || !selSession}
              style={{ display:'flex', alignItems:'center', gap:6 }}>
              {saving ? <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/> : <Save size={14}/>}
              Simpan Semua
            </button>
          </div>
        </div>

        {showNew && (
          <div style={{ marginTop:14, padding:14, background:'var(--surface-alt)', borderRadius:8, display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'flex-end' }}>
            <input className="input" placeholder="Judul pertemuan" value={newMeeting.title}
              onChange={e => setNewMeeting(p => ({ ...p, title: e.target.value }))}/>
            <input className="input" type="number" min={1} max={99} style={{ width:80 }}
              value={newMeeting.meeting_number}
              onChange={e => setNewMeeting(p => ({ ...p, meeting_number: +e.target.value }))}/>
            <button className="btn btn-primary btn-sm" onClick={createSessionAndSelect}>Buat</button>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {selSession && (
        <div style={{ display:'flex', gap:8 }}>
          {OPTS.map(o => (
            <div key={o.value} style={{ flex:1, padding:'10px 14px', borderRadius:10, background:o.bg, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:800, color:o.color }}>{countOf(o.value)}</div>
              <div style={{ fontSize:11, fontWeight:600, color:o.color }}>{o.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Student grid */}
      {selSession && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
              <Users size={14}/> Daftar Mahasiswa ({students.length})
            </span>
            <div style={{ display:'flex', gap:6 }}>
              {OPTS.map(o => (
                <button key={o.value} className="btn btn-sm"
                  style={{ fontSize:11, background:'var(--gray-100)', color:'var(--gray-600)', border:'1px solid var(--gray-200)' }}
                  onClick={() => students.forEach(st => setStatus(st.id, o.value))}>
                  Semua {o.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? <div style={{ padding:32, display:'flex', justifyContent:'center' }}><div className="spinner"/></div> : (
            students.map(st => {
              const cur = draft[st.id] || 'alpha'
              const init = st.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()||'?'
              return (
                <div key={st.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', borderTop:'1px solid var(--gray-100)' }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--indigo-50)', color:'var(--indigo-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                    {st.avatar_url ? <img src={st.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : init}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{st.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--gray-400)' }}>{st.nim}</div>
                  </div>
                  <div style={{ display:'flex', gap:4 }}>
                    {OPTS.map(o => (
                      <button key={o.value} onClick={() => setStatus(st.id, o.value)}
                        style={{
                          padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:700, cursor:'pointer',
                          border: cur===o.value ? 'none' : '1px solid var(--gray-200)',
                          background: cur===o.value ? o.bg : 'transparent',
                          color: cur===o.value ? o.color : 'var(--gray-400)',
                          transition:'all .12s',
                        }}>{o.label}</button>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
      {!selSession && (
        <div className="empty-state card" style={{ padding:60 }}>
          <Users size={28} color="var(--gray-200)"/>
          <p className="empty-state-text">Pilih atau buat pertemuan untuk input presensi</p>
        </div>
      )}
    </div>
  )
}
