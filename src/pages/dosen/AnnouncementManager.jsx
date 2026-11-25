import { useState, useEffect, useRef, useEffectEvent } from 'react'
import {
  Plus, Pencil, Trash2, Image, Loader2, X, Upload, Eye, EyeOff, ToggleLeft, ToggleRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/useConfirm'

const EMPTY_FORM = { title:'', content:'', course_id:'', image_url:'', is_active:true, priority:0, expires_at:'' }

export default function AnnouncementManager() {
  const { user } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const [list,      setList]      = useState([])
  const [courses,   setCourses]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [editId,    setEditId]    = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [imgFile,   setImgFile]   = useState(null)
  const [imgPrev,   setImgPrev]   = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  // Dipanggil efek di bawah; selalu memakai fungsi & state terbaru (useEffectEvent).
  const muatSaatBerubah = useEffectEvent(() => { fetchAll() })
  useEffect(() => { muatSaatBerubah() }, [user])

  async function fetchAll() {
    setLoading(true)
    const [{ data: ann }, { data: crs }] = await Promise.all([
      supabase.from('announcements')
        .select('*, course:courses(name,code)')
        .eq('author_id', user.id)
        .order('priority', { ascending:false })
        .order('created_at', { ascending:false }),
      supabase.from('courses').select('id,name,code').eq('dosen_id', user.id).order('name'),
    ])
    setList(ann || [])
    setCourses(crs || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM); setEditId(null); setImgFile(null); setImgPrev('')
    setShowForm(true)
  }
  function openEdit(a) {
    setForm({ title:a.title, content:a.content, course_id:a.course_id||'',
      image_url:a.image_url||'', is_active:a.is_active, priority:a.priority,
      expires_at: a.expires_at ? a.expires_at.slice(0,16) : '' })
    setImgFile(null); setImgPrev(a.image_url||'')
    setEditId(a.id); setShowForm(true)
  }

  async function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5*1024*1024) { toast.error('Ukuran file maksimal 5MB'); return }
    setImgFile(file)
    setImgPrev(URL.createObjectURL(file))
  }

  async function uploadImage() {
    if (!imgFile) return form.image_url || ''
    setUploading(true)
    const ext  = imgFile.name.split('.').pop()
    const path = `announcements/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('announcement-images').upload(path, imgFile, { upsert:true })
    if (error) { toast.error('Gagal upload gambar'); setUploading(false); return form.image_url || '' }
    const { data: { publicUrl } } = supabase.storage.from('announcement-images').getPublicUrl(path)
    setUploading(false)
    return publicUrl
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Judul dan konten wajib diisi'); return }
    if (!form.course_id) { toast.error('Pilih mata kuliah'); return }
    setSaving(true)
    const imageUrl = await uploadImage()
    const payload = {
      title:    form.title.trim(),
      content:  form.content.trim(),
      type:     'course',
      course_id: form.course_id,
      image_url: imageUrl || null,
      is_active: form.is_active,
      priority:  Number(form.priority) || 0,
      expires_at:form.expires_at || null,
      author_id: user.id,
    }
    if (editId) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editId)
      if (error) { toast.error('Gagal menyimpan'); setSaving(false); return }
      toast.success('Pengumuman diperbarui')
    } else {
      const { error } = await supabase.from('announcements').insert(payload)
      if (error) { toast.error('Gagal menyimpan'); setSaving(false); return }
      toast.success('Pengumuman ditambahkan')
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  async function handleToggle(a) {
    await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id)
    toast.success(a.is_active ? 'Dinonaktifkan' : 'Diaktifkan')
    fetchAll()
  }
  async function handleDelete(id) {
    const ok = await showConfirm({
      title: 'Hapus Pengumuman?',
      message: 'Pengumuman ini akan dihapus dan tidak ditampilkan lagi kepada mahasiswa.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('announcements').delete().eq('id', id)
    toast.success('Dihapus'); fetchAll()
  }

  function f(field, val) { setForm(p => ({ ...p, [field]: val })) }

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title">Pengumuman Mata Kuliah</h1>
          <p className="page-subtitle">Buat pengumuman untuk mahasiswa di mata kuliah Anda</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Plus size={15}/> Tambah Pengumuman
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, width:'100%', maxWidth:580, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border-color)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h2 style={{ fontWeight:700, fontSize:16, margin:0 }}>{editId ? 'Edit' : 'Tambah'} Pengumuman</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={18}/></button>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* Mata Kuliah */}
              <div>
                <label className="label">Mata Kuliah</label>
                <select className="input" value={form.course_id} onChange={e => f('course_id', e.target.value)}>
                  <option value="">-- Pilih Mata Kuliah --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
                </select>
              </div>

              {/* Judul */}
              <div>
                <label className="label">Judul</label>
                <input className="input" placeholder="Judul pengumuman" value={form.title} onChange={e=>f('title',e.target.value)}/>
              </div>

              {/* Konten */}
              <div>
                <label className="label">Konten</label>
                <textarea className="input" rows={4} placeholder="Isi pengumuman..." value={form.content} onChange={e=>f('content',e.target.value)} style={{ resize:'vertical' }}/>
              </div>

              {/* Upload Gambar */}
              <div>
                <label className="label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Image size={13}/> Gambar Banner (opsional, PNG/JPG maks 5MB)
                </label>
                {imgPrev && (
                  <div style={{ marginBottom:10, position:'relative', display:'inline-block' }}>
                    <img src={imgPrev} alt="preview" style={{ height:120, borderRadius:10, objectFit:'cover', border:'1px solid var(--gray-200)', display:'block', maxWidth:'100%' }}/>
                    <button onClick={() => { setImgFile(null); setImgPrev(''); f('image_url','') }}
                      style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,.55)', border:'none', borderRadius:'50%', width:22, height:22, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <X size={12}/>
                    </button>
                  </div>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}
                  style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Upload size={13}/> {imgPrev ? 'Ganti Gambar' : 'Upload Gambar'}
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display:'none' }} onChange={handleImagePick}/>
              </div>

              {/* Prioritas + Expired */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="label">Prioritas</label>
                  <input className="input" type="number" min={0} value={form.priority} onChange={e=>f('priority',e.target.value)}/>
                </div>
                <div>
                  <label className="label">Kadaluarsa (opsional)</label>
                  <input className="input" type="datetime-local" value={form.expires_at} onChange={e=>f('expires_at',e.target.value)}/>
                </div>
              </div>

              {/* Aktif toggle */}
              <div>
                <button onClick={() => f('is_active', !form.is_active)}
                  style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:form.is_active?'#16a34a':'var(--gray-400)' }}>
                  {form.is_active ? <ToggleRight size={22} color="#16a34a"/> : <ToggleLeft size={22}/>}
                  {form.is_active ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
            </div>

            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border-color)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving||uploading}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {(saving||uploading) ? <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/> : null}
                {uploading ? 'Upload...' : saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner"/></div>
      ) : list.length === 0 ? (
        <div className="empty-state card" style={{ padding:60 }}>
          <p className="empty-state-text">Belum ada pengumuman</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop:12 }}><Plus size={14}/> Tambah</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {list.map(a => (
            <div key={a.id} className="card" style={{ opacity: a.is_active ? 1 : .6 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'16px 20px' }}>
                {a.image_url ? (
                  <img src={a.image_url} alt="" style={{ width:80, height:56, objectFit:'cover', borderRadius:8, flexShrink:0, border:'1px solid var(--gray-200)' }}/>
                ) : (
                  <div style={{ width:80, height:56, borderRadius:8, background:'var(--gray-100)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Image size={20} color="var(--gray-300)"/>
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'#fef3c7', color:'#92400e' }}>
                      📘 {a.course?.code || 'MK'}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color: a.is_active?'#16a34a':'var(--gray-400)' }}>
                      {a.is_active ? '● Aktif' : '○ Nonaktif'}
                    </span>
                    {a.expires_at && <span style={{ fontSize:11, color:'#dc2626' }}>Exp: {new Date(a.expires_at).toLocaleDateString('id-ID')}</span>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--gray-800)', marginBottom:2 }}>{a.title}</div>
                  <div style={{ fontSize:12, color:'var(--gray-500)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.content}</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(a)} title={a.is_active?'Nonaktifkan':'Aktifkan'}>
                    {a.is_active ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}><Pencil size={14}/></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a.id)} style={{ color:'#dc2626' }}><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  )
}
