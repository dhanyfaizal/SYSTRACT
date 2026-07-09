import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  QrCode, Plus, Users, Clock, CheckCircle2, X, Loader2,
  RefreshCw, Edit2, Save, BookOpen, ChevronDown, ChevronUp,
  BarChart2, ClipboardEdit, Printer
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth }  from '@/contexts/AuthContext'
import { withRetry } from '@/lib/withRetry'
import { printPresensi } from '@/utils/printPresensi'
import toast from 'react-hot-toast'
import AttendanceManual    from './AttendanceManual'
import AttendanceAnalytics from './AttendanceAnalytics'

const STATUS_OPTS = [
  { value: 'hadir', label: 'Hadir',  color: '#16a34a', bg: '#dcfce7' },
  { value: 'izin',  label: 'Izin',   color: '#2563eb', bg: '#dbeafe' },
  { value: 'sakit', label: 'Sakit',  color: '#d97706', bg: '#fef3c7' },
  { value: 'alpha', label: 'Alpha',  color: '#dc2626', bg: '#fee2e2' },
]
function statusStyle(s) { return STATUS_OPTS.find(o => o.value === s) || STATUS_OPTS[3] }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Konversi ISO string ke format datetime-local input (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AttendanceManager() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [tab,     setTab]     = useState('sesi') // sesi | manual | analitik
  const [courses,  setCourses]  = useState([])
  const [courseId, setCourseId] = useState('')
  const [sessions, setSessions] = useState([])
  const [students, setStudents] = useState([])
  const [showForm,    setShowForm]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [expanded,    setExpanded]    = useState(null)
  const [form,        setForm]        = useState({ title: '', meeting_number: 1, duration: 30 })
  // ── Edit sesi state ─────────────────────────────────────────
  const [editSession, setEditSession] = useState(null)
  const [editForm,    setEditForm]    = useState({ title:'', meeting_number:1, extend_minutes:0 })
  const [editSaving,  setEditSaving]  = useState(false)
  const [printing,    setPrinting]    = useState(false)

  // Load courses taught by dosen
  useEffect(() => {
    supabase.from('courses').select('id,code,name').eq('dosen_id', user?.id).eq('is_active', true)
      .then(({ data }) => {
        setCourses(data || [])
        const paramId = searchParams.get('courseId')
        const match   = paramId && data?.find(c => c.id === paramId)
        setCourseId(match ? paramId : (data?.[0]?.id || ''))
      })
  }, [user])

  useEffect(() => {
    if (courseId) {
      // Parallel: fetch sessions + students sekaligus
      setLoading(true)
      Promise.all([ fetchSessions(), fetchStudents() ])
        .finally(() => setLoading(false))
    }
  }, [courseId])

  async function fetchSessions() {
    const { data } = await supabase
      .from('attendance_sessions')
      .select('*, attendances(count)')
      .eq('course_id', courseId)
      .eq('dosen_id', user.id)
      .order('created_at', { ascending: false })
    setSessions(data || [])
  }

  async function fetchStudents() {
    const { data } = await supabase
      .from('enrollments')
      .select('student:profiles!student_id(id,full_name,nim,avatar_url)')
      .eq('course_id', courseId)
    setStudents((data || []).map(e => e.student).filter(Boolean))
  }

  async function createSession() {
    if (!form.title.trim()) { toast.error('Judul pertemuan wajib diisi'); return }
    setSaving(true)
    const code       = genCode()
    const expires_at = new Date(Date.now() + form.duration * 60 * 1000).toISOString()
    const { error } = await withRetry(() =>
      supabase.from('attendance_sessions').insert({
        course_id: courseId, dosen_id: user.id,
        meeting_number: form.meeting_number,
        title: form.title.trim(), code, expires_at, is_active: true,
      })
    )
    setSaving(false)
    if (error) { toast.error('Gagal membuat sesi — coba lagi'); return }
    toast.success('Sesi absensi dibuat!')
    setShowForm(false)
    setForm(f => ({ ...f, meeting_number: f.meeting_number + 1 }))
    fetchSessions()
  }

  async function closeSession(id) {
    const { error } = await withRetry(() =>
      supabase.from('attendance_sessions').update({ is_active: false }).eq('id', id)
    )
    if (error) toast.error('Gagal menutup sesi')
    else { toast.success('Sesi ditutup'); fetchSessions() }
  }

  function openEditSession(s) {
    setEditSession(s)
    setEditForm({
      title:          s.title,
      meeting_number: s.meeting_number,
      extend_minutes: 0,
      created_at:     toDatetimeLocal(s.created_at), // format for <input type="datetime-local">
    })
  }

  async function saveEditSession() {
    if (!editForm.title.trim()) { toast.error('Judul tidak boleh kosong'); return }
    setEditSaving(true)
    const updates = {
      title:          editForm.title.trim(),
      meeting_number: editForm.meeting_number,
    }
    // Update tanggal sesi jika diubah
    if (editForm.created_at) {
      const newDate = new Date(editForm.created_at)
      if (!isNaN(newDate.getTime())) updates.created_at = newDate.toISOString()
    }
    if (editForm.extend_minutes > 0) {
      const wasExpired = isExpired(editSession)
      const base = wasExpired ? new Date() : new Date(editSession.expires_at)
      updates.expires_at = new Date(base.getTime() + editForm.extend_minutes * 60_000).toISOString()
      if (wasExpired) updates.is_active = true
    }
    const { error } = await withRetry(() =>
      supabase.from('attendance_sessions').update(updates).eq('id', editSession.id)
    )
    setEditSaving(false)
    if (error) toast.error('Gagal menyimpan perubahan')
    else { toast.success('Sesi berhasil diperbarui!'); setEditSession(null); fetchSessions() }
  }

  async function handlePrint() {
    if (!courseId) return
    setPrinting(true)
    try {
      await printPresensi({ supabase, courseId, userId: user.id })
    } catch (err) {
      toast.error('Gagal membuat cetak: ' + err.message)
    } finally {
      setPrinting(false)
    }
  }

  async function updateStatus(sessionId, studentId, status) {
    const { error } = await withRetry(
      () => supabase.from('attendances').upsert({
        session_id: sessionId, student_id: studentId, status,
      }, { onConflict: 'session_id,student_id' }),
      { retries: 3, onRetry: ({ attempt }) => toast.loading(`Menyimpan absen... (${attempt}/3)`, { id: 'retry-att' }) }
    )
    toast.dismiss('retry-att')
    if (error) toast.error('Gagal menyimpan absensi — coba lagi')
    else { toast.success('Status diperbarui'); fetchSessionDetail(sessionId) }
  }

  const [details, setDetails] = useState({}) // sessionId -> [{student, attendance}]
  async function fetchSessionDetail(sessionId) {
    const { data: atts } = await supabase
      .from('attendances')
      .select('student_id, status, checked_in_at, notes')
      .eq('session_id', sessionId)
    // Merge with all students
    const map = {}
    ;(atts || []).forEach(a => { map[a.student_id] = a })
    setDetails(prev => ({ ...prev, [sessionId]: map }))
  }

  async function toggleExpand(sessionId) {
    if (expanded === sessionId) { setExpanded(null); return }
    setExpanded(sessionId)
    await fetchSessionDetail(sessionId)
  }

  function f(field, val) { setForm(p => ({ ...p, [field]: val })) }

  const isExpired = s => new Date(s.expires_at) < new Date() || !s.is_active
  const timeLeft  = s => {
    const diff = new Date(s.expires_at) - new Date()
    if (diff <= 0) return null
    const m = Math.floor(diff / 60000)
    const sc = Math.floor((diff % 60000) / 1000)
    return `${m}:${String(sc).padStart(2,'0')}`
  }

  return (
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <CheckCircle2 size={20} color="var(--indigo-600)"/> Absensi Digital
          </h1>
          <p className="page-subtitle">Kelola sesi kehadiran per pertemuan</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select className="input" style={{ maxWidth:260 }} value={courseId} onChange={e=>setCourseId(e.target.value)}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          {tab === 'sesi' && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}
              style={{ display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
              <Plus size={14}/> Buat Sesi
            </button>
          )}
          <button className="btn btn-secondary" onClick={handlePrint} disabled={printing || !sessions.length}
            style={{ display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }} title="Cetak jurnal kehadiran">
            {printing
              ? <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/>
              : <Printer size={14}/>}
            Cetak Jurnal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--gray-200)', paddingBottom:0 }}>
        {[
          { id:'sesi',    label:'Sesi & QR',     icon: QrCode },
          { id:'manual',  label:'Input Manual',  icon: ClipboardEdit },
          { id:'analitik',label:'Analitik',      icon: BarChart2 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer',
              background:'none', border:'none', borderBottom: tab===t.id ? '2px solid var(--indigo-600)' : '2px solid transparent',
              color: tab===t.id ? 'var(--indigo-600)' : 'var(--gray-500)',
              marginBottom:-1, transition:'color .15s',
            }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* Create Session Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border-color)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ fontWeight:700, fontSize:16, margin:0 }}>Buat Sesi Absensi</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={18}/></button>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="label">Judul Pertemuan</label>
                <input className="input" placeholder="contoh: Pertemuan 5 – Sorting Algorithm" value={form.title} onChange={e=>f('title',e.target.value)}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="label">No. Pertemuan</label>
                  <input className="input" type="number" min={1} max={99} value={form.meeting_number} onChange={e=>f('meeting_number',+e.target.value)}/>
                </div>
                <div>
                  <label className="label">Durasi Absensi (menit)</label>
                  <select className="input" value={form.duration} onChange={e=>f('duration',+e.target.value)}>
                    {[5,10,15,20,30,45,60].map(d=><option key={d} value={d}>{d} menit</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border-color)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn btn-primary" onClick={createSession} disabled={saving}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {saving && <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/>}
                Buat & Generate Kode
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'sesi' && (
        <>
          {loading && <div className="spinner" style={{ margin:'60px auto' }}/>}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {sessions.map(s => {
              const expired  = isExpired(s)
              const remaining = timeLeft(s)
              const isOpen   = expanded === s.id
              const sessionDetails = details[s.id] || {}
              return (
                <div key={s.id} className="card" style={{ overflow:'hidden' }}>
                  <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background: expired ? 'var(--gray-300)' : '#16a34a', flexShrink:0, boxShadow: expired ? 'none' : '0 0 0 3px #bbf7d0', animation: expired ? 'none' : 'pulse 2s infinite' }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'var(--gray-900)' }}>Pertemuan {s.meeting_number} — {s.title}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2 }}>
                        {new Date(s.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}
                        {!expired && remaining && <span style={{ marginLeft:8, color:'#16a34a', fontWeight:700 }}>⏱ {remaining} tersisa</span>}
                        {expired && <span style={{ marginLeft:8, color:'var(--gray-400)' }}>Sesi ditutup</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      {!expired && (<button className="btn btn-ghost btn-sm" onClick={() => closeSession(s.id)} style={{ color:'#dc2626' }}><X size={13}/> Tutup</button>)}
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditSession(s)} title="Edit sesi"
                        style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <Edit2 size={13}/>
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(s.id)} style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <Users size={13}/>{isOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                      </button>
                    </div>
                  </div>
                  {!expired && (
                    <div style={{ padding:'0 20px 20px', display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', marginBottom:8, letterSpacing:.5, textTransform:'uppercase' }}>Kode Absensi</div>
                        <div style={{ fontFamily:'monospace', fontSize:36, fontWeight:900, letterSpacing:8, color:'var(--indigo-600)', background:'var(--indigo-50)', padding:'16px 24px', borderRadius:10, display:'inline-block', border:'2px dashed var(--indigo-200)', lineHeight:1 }}>{s.code}</div>
                        <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:8 }}>Bagikan kode ini kepada mahasiswa</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', marginBottom:8, letterSpacing:.5, textTransform:'uppercase' }}>QR Code</div>
                        <div style={{ padding:8, background:'#1e293b', borderRadius:10, display:'inline-block' }}>
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${s.code}&bgcolor=1e293b&color=ffffff`} alt="QR" style={{ display:'block', borderRadius:4 }}/>
                        </div>
                        <div style={{ fontSize:10, color:'var(--gray-400)', marginTop:6 }}>Scan untuk isi kode</div>
                      </div>
                    </div>
                  )}
                  {isOpen && (
                    <div style={{ borderTop:'1px solid var(--gray-100)' }}>
                      <div style={{ padding:'12px 20px', fontSize:12, fontWeight:700, color:'var(--gray-500)', display:'flex', justifyContent:'space-between' }}>
                        <span>Daftar Kehadiran ({students.length} mahasiswa)</span>
                        <span style={{ fontWeight:400, color:'var(--gray-400)' }}>Hadir: {Object.values(sessionDetails).filter(a=>a.status==='hadir').length} · Belum: {students.length - Object.keys(sessionDetails).length}</span>
                      </div>
                      {students.map(st => {
                        const att = sessionDetails[st.id]
                        const st_status = att?.status || null
                        const initials = st.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()||'?'
                        return (
                          <div key={st.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', borderTop:'1px solid var(--gray-100)' }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--indigo-50)', color:'var(--indigo-600)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                              {st.avatar_url ? <img src={st.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : initials}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:600, fontSize:13 }}>{st.full_name}</div>
                              <div style={{ fontSize:11, color:'var(--gray-400)' }}>{st.nim}</div>
                            </div>
                            <div style={{ display:'flex', gap:4 }}>
                              {STATUS_OPTS.map(opt => {
                                const active = st_status === opt.value
                                return (<button key={opt.value} onClick={() => updateStatus(s.id, st.id, opt.value)} style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border: active ? 'none' : '1px solid var(--gray-200)', background: active ? opt.bg : 'transparent', color: active ? opt.color : 'var(--gray-400)', transition:'all .15s' }}>{opt.label}</button>)
                              })}
                            </div>
                            {att?.checked_in_at && <div style={{ fontSize:10, color:'var(--gray-400)', width:60, textAlign:'right' }}>{new Date(att.checked_in_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {!loading && sessions.length === 0 && (
              <div className="empty-state card" style={{ padding:60 }}>
                <CheckCircle2 size={32} color="var(--gray-200)"/>
                <p className="empty-state-text">Belum ada sesi absensi</p>
                <p className="empty-state-sub">Klik "+ Buat Sesi" untuk memulai</p>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'manual'   && <AttendanceManual    courseId={courseId} students={students} />}
      {tab === 'analitik' && <AttendanceAnalytics courseId={courseId} students={students} />}

      {/* ── Edit Sesi Modal ──────────────────────────────────── */}
      {editSession && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border-color)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Edit2 size={16} color="var(--indigo-600)"/>
                <h2 style={{ fontWeight:700, fontSize:16, margin:0 }}>Edit Sesi Absensi</h2>
              </div>
              <button onClick={() => setEditSession(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={18}/></button>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* Info kode sesi */}
              <div style={{ background:'var(--gray-50)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--gray-500)', border:'1px solid var(--gray-200)' }}>
                Kode Sesi: <strong style={{ fontFamily:'monospace', color:'var(--indigo-600)' }}>{editSession.code}</strong>
              </div>

              <div>
                <label className="label">Judul Pertemuan</label>
                <input className="input" value={editForm.title}
                  onChange={e => setEditForm(f => ({...f, title: e.target.value}))}/>
              </div>
              <div>
                <label className="label">No. Pertemuan</label>
                <input className="input" type="number" min={1} max={99}
                  value={editForm.meeting_number}
                  onChange={e => setEditForm(f => ({...f, meeting_number: +e.target.value}))}/>
              </div>

              {/* ── Tanggal & Jam Sesi ───────────────────────────────── */}
              <div>
                <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                  📅 Tanggal &amp; Jam Sesi
                  <span style={{ fontSize:10, fontWeight:400, color:'var(--gray-400)' }}>(untuk rekap &amp; jurnal)</span>
                </label>
                <input
                  className="input"
                  type="datetime-local"
                  value={editForm.created_at}
                  max={toDatetimeLocal(new Date().toISOString())}
                  onChange={e => setEditForm(f => ({...f, created_at: e.target.value}))}
                  style={{ cursor:'pointer' }}
                />
                {editForm.created_at && editForm.created_at !== toDatetimeLocal(editSession.created_at) && (
                  <div style={{ fontSize:11, color:'var(--indigo-600)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                    ⚠️ Diubah dari:{' '}
                    <strong>
                      {new Date(editSession.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}
                    </strong>
                    {' → '}
                    <strong>
                      {new Date(editForm.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}
                    </strong>
                  </div>
                )}
              </div>

              {/* Perpanjang / buka kembali */}
              <div>
                <label className="label">
                  {isExpired(editSession) ? 'Buka kembali selama' : 'Perpanjang durasi'}
                </label>
                <select className="input" value={editForm.extend_minutes}
                  onChange={e => setEditForm(f => ({...f, extend_minutes: +e.target.value}))}>
                  <option value={0}>
                    {isExpired(editSession) ? '— Tidak dibuka kembali' : '— Tidak diperpanjang'}
                  </option>
                  {[5,10,15,20,30,45,60].map(m => (
                    <option key={m} value={m}>+{m} menit{isExpired(editSession) ? ' (buka kembali)' : ''}</option>
                  ))}
                </select>
                {!isExpired(editSession) && editForm.extend_minutes > 0 && (
                  <div style={{ fontSize:11, color:'var(--indigo-600)', marginTop:4 }}>
                    ⏰ Sesi akan berakhir pada {new Date(new Date(editSession.expires_at).getTime() + editForm.extend_minutes * 60_000).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                )}
                {isExpired(editSession) && editForm.extend_minutes > 0 && (
                  <div style={{ fontSize:11, color:'#16a34a', marginTop:4 }}>
                    ✅ Sesi akan dibuka kembali selama {editForm.extend_minutes} menit
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border-color)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditSession(null)}>Batal</button>
              <button className="btn btn-primary" onClick={saveEditSession} disabled={editSaving}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {editSaving && <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/>}
                <Save size={13}/> Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 3px #bbf7d0; }
          50%      { box-shadow: 0 0 0 6px #86efac; }
        }
      `}</style>
    </div>
  )
}
