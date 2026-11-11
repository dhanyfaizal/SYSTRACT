import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import CoursePicker from "@/components/dosen/CoursePicker"
import { MessageSquare, Plus, Trash2, X, Loader2, Pin, MessageCircle, ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const BLANK = { title: '', body: '', is_pinned: false }

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso)
  const m = Math.floor(diff/60000)
  if (m < 1)   return 'Baru saja'
  if (m < 60)  return `${m} menit lalu`
  if (m < 1440) return `${Math.floor(m/60)} jam lalu`
  return `${Math.floor(m/1440)} hari lalu`
}

export default function DosenForumManager() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { confirmDialog, showConfirm } = useConfirm()
  const [courses,  setCourses]  = useState([])
  const [courseId, setCourseId] = useState('')
  const [forums,   setForums]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState(BLANK)

  useEffect(() => { if (user) fetchCourses() }, [user])
  useEffect(() => { if (courseId) fetchForums() }, [courseId])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,code,name').eq('dosen_id', user.id).order('name')
    setCourses(data || [])
    const paramId = searchParams.get('courseId')
    const match   = paramId && data?.find(c => c.id === paramId)
    setCourseId(match ? paramId : (data?.[0]?.id || ''))
  }

  async function fetchForums() {
    setLoading(true)
    const { data } = await supabase
      .from('forums')
      .select('*, forum_replies(count), author:profiles!forums_author_id_fkey(full_name, avatar_url)')
      .eq('course_id', courseId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setForums(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Judul diskusi wajib diisi'); return }
    setSaving(true)
    const { error } = await supabase.from('forums').insert({
      ...form, course_id: courseId, author_id: user.id,
    })
    if (error) toast.error('Gagal menyimpan: ' + error.message)
    else { toast.success('Topik diskusi dibuat'); setModal(false); setForm(BLANK); fetchForums() }
    setSaving(false)
  }

  async function togglePin(f) {
    await supabase.from('forums').update({ is_pinned: !f.is_pinned }).eq('id', f.id)
    toast(f.is_pinned ? 'Disematkan dilepas' : 'Topik disematkan', { icon: '📌' })
    fetchForums()
  }

  async function handleDelete(id) {
    const ok = await showConfirm({
      title: 'Hapus Topik Diskusi?',
      message: 'Semua balasan dalam topik ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('forums').delete().eq('id', id)
    toast('Topik dihapus', { icon: '🗑️' })
    fetchForums()
  }

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Kelola Forum</h1>
          <p className="page-subtitle">Buat topik diskusi untuk mahasiswa</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)} disabled={!courseId}>
          <Plus size={14}/> Buat Topik
        </button>
      </div>

      <CoursePicker courses={courses} courseId={courseId} onChange={setCourseId} />


      {loading ? (
        <div className="spinner" style={{ margin:'40px auto' }}/>
      ) : forums.length === 0 ? (
        <div className="empty-state card" style={{ padding:48 }}>
          <MessageSquare size={36} color="var(--gray-300)"/>
          <p className="empty-state-text">Belum ada topik diskusi</p>
          <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}><Plus size={13}/> Buat Topik</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {forums.map(f => (
            <div key={f.id} className="card"
              onClick={() => navigate(`/forum/${f.id}`)}
              style={{
                padding:'14px 18px',
                borderLeft: f.is_pinned ? '3px solid var(--indigo-500)' : undefined,
                cursor:'pointer', transition:'box-shadow .15s'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 12px rgba(99,102,241,.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}
            >
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{
                  width:36, height:36, borderRadius:8, overflow:'hidden', flexShrink:0,
                  background:'var(--indigo-100)', display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {f.author?.avatar_url
                    ? <img src={f.author.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <MessageSquare size={14} color="var(--indigo-600)"/>
                  }
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    {f.is_pinned && (
                      <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, color:'var(--indigo-600)', textTransform:'uppercase' }}>
                        <Pin size={10}/> Disematkan
                      </span>
                    )}
                    <span className="badge-pill badge-indigo">Dosen</span>
                  </div>
                  <div style={{ fontWeight:700, fontSize:14, marginTop:4, color:'var(--gray-900)' }}>{f.title}</div>
                  {f.body && (
                    <div style={{
                      fontSize:12, color:'var(--gray-500)', marginTop:4,
                      overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
                    }}>{f.body}</div>
                  )}
                  <div style={{ display:'flex', gap:16, marginTop:8, fontSize:11, color:'var(--gray-400)' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <MessageCircle size={11}/> {f.forum_replies?.[0]?.count || 0} balasan
                    </span>
                    <span>{timeAgo(f.created_at)}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Buka diskusi"
                    onClick={() => navigate(`/forum/${f.id}`)}
                    style={{ color:'var(--indigo-600)' }}
                  >
                    <ExternalLink size={13}/>
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title={f.is_pinned ? 'Lepas sematkan' : 'Sematkan'}
                    style={{ color: f.is_pinned ? 'var(--indigo-600)' : undefined }}
                    onClick={() => togglePin(f)}
                  >
                    <Pin size={13}/>
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(f.id)}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <MessageSquare size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Buat Topik Diskusi</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Judul Topik *</label>
                <input className="input" placeholder="cth: Diskusi Bab 3 — Deadlock" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Deskripsi / Pertanyaan Awal</label>
                <textarea className="input" rows={4} style={{ resize:'vertical' }} placeholder="Tuliskan pertanyaan atau deskripsi topik..." value={form.body} onChange={e => setForm(f=>({...f,body:e.target.value}))}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                <input type="checkbox" id="pin-topic" checked={form.is_pinned} onChange={e => setForm(f=>({...f,is_pinned:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--indigo-600)' }}/>
                <label htmlFor="pin-topic" style={{ fontSize:13, cursor:'pointer' }}>
                  <Pin size={11} style={{ marginRight:4, display:'inline' }}/>
                  Sematkan topik ini di atas
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Plus size={13}/>}
                Buat Topik
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
