import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, MessageSquare, Coins, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAI } from '@/contexts/AIContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { formatMessageText } from '@/components/ai/AIAssistant'

export default function ForumDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const { askWithContext, askGemini, hasKey } = useAI()
  const navigate = useNavigate()
  const [forum,   setForum]   = useState(null)
  const [replies, setReplies] = useState([])
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState('')

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

  async function handleAIAnalysis() {
    if (!hasKey) {
      toast.error('Silakan atur API Key Anda terlebih dahulu di menu AI Assistant!')
      return
    }

    setAnalyzing(true)
    setShowAnalysis(false)
    setAiSummary('')

    try {
      const commentsText = replies.length > 0 
        ? replies.map(r => `- ${r.author?.full_name}: "${r.body}"`).join('\n')
        : 'Belum ada komentar sama sekali.'

      const prompt = `Berikut adalah seluruh komentar/balasan dari forum diskusi berjudul "${forum.title}":\n\n${commentsText}\n\nInstruksi:\n1. Buat rangkuman singkat, padat, dan langsung ke inti diskusi (maksimal 150-200 kata).\n2. Tuliskan 3-4 poin menarik dari jalannya diskusi.\n3. Harap ringkas dan pastikan kalimat terakhir Anda selesai dengan sempurna (tidak terpotong di tengah kalimat/kata). Jawab dalam Bahasa Indonesia.`

      const res = await askGemini(prompt)
      setAiSummary(res)
      setShowAnalysis(true)
    } catch (err) {
      toast.error(err.message || 'Gagal menganalisis diskusi')
    } finally {
      setAnalyzing(false)
    }
  }

  async function sendReply() {
    if (!body.trim()) return
    setSending(true)
    const { data: inserted, error } = await supabase
      .from('forum_replies')
      .insert({ forum_id: id, author_id: user.id, body: body.trim() })
      .select('id')
      .single()
    if (error) { toast.error('Gagal mengirim balasan'); setSending(false); return }

    // Award +3 poin untuk mahasiswa yang membalas forum
    if (forum?.course_id) {
      const { data: semData } = await supabase
        .from('semesters').select('id').eq('is_active', true).single()
      if (semData) {
        // Cek apakah sudah pernah dapat poin dari reply ini (idempotent)
        await supabase.from('points_log').insert({
          user_id:     user.id,
          course_id:   forum.course_id,
          semester_id: semData.id,
          points:      3,
          source:      'forum',
          reason:      'Balas forum: ' + id,
          reference_id: inserted?.id,
        })
        toast.success('Balasan terkirim! +3 pts 💬', { icon: '💬' })
      } else {
        toast.success('Balasan terkirim')
      }
    } else {
      toast.success('Balasan terkirim')
    }

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
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{
                  color: 'var(--indigo-600)',
                  background: 'var(--indigo-50)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--indigo-100)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--indigo-50)' }}
                onClick={() => askWithContext(`Tolong jelaskan atau analisis topik diskusi forum berikut:\n\nJudul: "${forum.title}"\nIsi: "${forum.body || ''}"\nDibuat oleh: ${forum.author?.full_name || 'Pengguna'}\n\nBerikan rangkuman dan poin diskusi yang menarik dari topik ini.`)}
              >
                <Sparkles size={11} /> Tanya AI
              </button>

              <button
                style={{
                  color: 'var(--indigo-600)',
                  background: 'var(--indigo-50)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--indigo-100)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--indigo-50)' }}
                onClick={handleAIAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <Loader2 size={11} style={{ animation: 'spin .7s linear infinite', marginRight: 2 }} />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={11} />
                    <span>Rangkum Diskusi</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {forum.body && <p style={{ fontSize:13, color:'var(--gray-700)', lineHeight:1.7 }}>{forum.body}</p>}
        </div>
      </div>

      {/* AI Analysis Panel */}
      {showAnalysis && (
        <div className="card" style={{
          marginBottom: 16,
          border: '1px solid var(--indigo-100)',
          background: 'var(--surface)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--indigo-50)',
            borderBottom: '1px solid var(--indigo-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--indigo-700)' }}>
              <Sparkles size={14} color="var(--indigo-600)" />
              <span>Analisis & Rangkuman AI</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAnalysis(false)} style={{ padding: 4 }}>
              Tutup
            </button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px' }}>
            {/* Summary */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                📝 Rangkuman Diskusi
              </div>
              <div style={{
                background: 'var(--gray-50)',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--gray-700)',
                lineHeight: 1.6
              }}>
                {formatMessageText(aiSummary)}
              </div>
            </div>

            {/* Participation */}
            <div className="form-grid form-grid-2" style={{ gap: 16 }}>
              {/* Sudah */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
                  Sudah Partisipasi ({sudahPartisipasi.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sudahPartisipasi.length === 0 ? (
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Belum ada mahasiswa berpartisipasi.</span>
                  ) : (
                    sudahPartisipasi.map(s => (
                      <span key={s.id} className="badge-pill badge-green" style={{ padding: '4px 10px', fontSize: 11 }}>
                        ✓ {s.full_name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Belum */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }}></span>
                  Belum Partisipasi ({belumPartisipasi.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {belumPartisipasi.length === 0 ? (
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Semua mahasiswa sudah berpartisipasi.</span>
                  ) : (
                    belumPartisipasi.map(s => (
                      <span key={s.id} className="badge-pill badge-red" style={{ padding: '4px 10px', fontSize: 11 }}>
                        ✗ {s.full_name}
                      </span>
                    ))
                  )}
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
