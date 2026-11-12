import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, MessageSquare, Coins } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ForumDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [forum,   setForum]   = useState(null)
  const [replies, setReplies] = useState([])
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const [enrolledStudents, setEnrolledStudents] = useState([])
  const isStaf = ['dosen', 'admin'].includes(profile?.role)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: f }, { data: r }] = await Promise.all([
      supabase.from('forums').select('*, author:profiles(full_name, avatar_url), course:courses(name,code)').eq('id', id).single(),
      supabase.from('forum_replies').select('*, author:profiles(full_name, avatar_url)').eq('forum_id', id).order('created_at'),
    ])
    setForum(f)
    setReplies(r || [])

    // Ambil mahasiswa yang terdaftar di kelas forum ini
    if (f?.course_id) {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student:profiles(id, full_name)')
        .eq('course_id', f.course_id)
      const students = enrollments?.map(e => e.student).filter(Boolean) || []
      setEnrolledStudents(students)
    }

    setLoading(false)
  }

  async function sendReply() {
    if (!body.trim()) return
    setSending(true)
    const { error } = await supabase
      .from('forum_replies')
      .insert({ forum_id: id, author_id: user.id, body: body.trim() })
    if (error) { toast.error('Gagal mengirim balasan'); setSending(false); return }

    // Poin balasan (+3, maks. 10 per hari) diberikan server lewat trigger trg_poin_balas_forum.
    toast.success('Balasan terkirim', { icon: '💬' })

    setBody(''); fetchData(); setSending(false)
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div className="spinner"/></div>
  if (!forum)  return <div className="empty-state"><p>Thread tidak ditemukan.</p></div>

  // Calculate participation lists
  const repliedUserIds = new Set(replies.map(r => r.author_id))
  const sudahPartisipasi = enrolledStudents.filter(s => repliedUserIds.has(s.id))
  const belumPartisipasi = enrolledStudents.filter(s => !repliedUserIds.has(s.id))

  return (
    <div style={{ maxWidth:720, margin:'0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom:16 }}>
        <ArrowLeft size={14}/> Kembali
      </button>

      {/* Original post */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-body">
          <div style={{ fontSize:11, color:'var(--gray-400)', marginBottom:8 }}>
            {forum.course?.code} · {forum.course?.name}
            {forum.is_pinned && <span style={{ marginLeft:8, color:'var(--indigo-600)', fontWeight:600 }}>📌 Pinned</span>}
          </div>
          <h1 style={{ fontSize:18, fontWeight:800, marginBottom:12 }}>{forum.title}</h1>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div className="avatar" style={{ width:32, height:32 }}>
                {forum.author?.avatar_url ? <img src={forum.author.avatar_url} alt=""/> : forum.author?.full_name?.[0]||'U'}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>{forum.author?.full_name}</div>
                <div style={{ fontSize:11, color:'var(--gray-400)' }}>{new Date(forum.created_at).toLocaleString('id-ID')}</div>
              </div>
            </div>
            
          </div>
          {forum.body && <p style={{ fontSize:13, color:'var(--gray-700)', lineHeight:1.7 }}>{forum.body}</p>}
        </div>
      </div>

      {/* Partisipasi peserta (hanya dosen/admin) */}
      {isStaf && enrolledStudents.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Partisipasi peserta
            </div>
            <div className="form-grid form-grid-2" style={{ gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Sudah membalas ({sudahPartisipasi.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sudahPartisipasi.length === 0
                    ? <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Belum ada.</span>
                    : sudahPartisipasi.map(s => <span key={s.id} className="badge-pill badge-green" style={{ padding: '4px 10px', fontSize: 11 }}>✓ {s.full_name}</span>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Belum membalas ({belumPartisipasi.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {belumPartisipasi.length === 0
                    ? <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Semua sudah membalas.</span>
                    : belumPartisipasi.map(s => <span key={s.id} className="badge-pill badge-red" style={{ padding: '4px 10px', fontSize: 11 }}>✗ {s.full_name}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replies */}
      <div style={{ fontSize:12, fontWeight:700, color:'var(--gray-500)', marginBottom:10 }}>
        {replies.length} Balasan
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
        {replies.map(r => (
          <div key={r.id} className="card" style={{ padding:'12px 16px' }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <div className="avatar" style={{ width:28, height:28, fontSize:11, flexShrink:0 }}>
                {r.author?.avatar_url ? <img src={r.author.avatar_url} alt=""/> : r.author?.full_name?.[0]||'U'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600 }}>{r.author?.full_name}</span>
                  <span style={{ fontSize:11, color:'var(--gray-400)' }}>{new Date(r.created_at).toLocaleString('id-ID')}</span>
                </div>
                <p style={{ fontSize:13, color:'var(--gray-700)', lineHeight:1.6 }}>{r.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply form */}
      <div className="card">
        <div className="card-body" style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
          <div className="avatar" style={{ width:32, height:32, flexShrink:0 }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : profile?.full_name?.[0]||'U'}
          </div>
          <div style={{ flex:1 }}>
            <textarea
              className="input"
              placeholder="Tulis balasan…"
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ resize:'vertical', fontFamily:'inherit' }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
              <button className="btn btn-primary btn-sm" onClick={sendReply} disabled={sending || !body.trim()}>
                {sending ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Send size={13}/>}
                Kirim
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
