import { useState, useEffect } from 'react'
import {
  Plus, Play, Square, Archive, Trash2, Loader2, X,
  Calendar, CheckCircle2, Clock, BookOpen
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const PERIOD_LABEL = { ganjil: 'Ganjil', genap: 'Genap' }
const EMPTY = { name:'', year: new Date().getFullYear(), period:'ganjil', started_at:'', ended_at:'' }

export default function SemesterManager() {
  const [list,     setList]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const { confirmDialog, showConfirm } = useConfirm()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data } = await supabase.from('semesters')
      .select('*').order('year', { ascending:false }).order('period')
    setList(data || [])
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error('Nama semester wajib diisi'); return }
    setSaving(true)
    const { error } = await supabase.from('semesters').insert({
      name:       form.name.trim(),
      year:       Number(form.year),
      period:     form.period,
      is_active:  false,
      started_at: form.started_at || null,
      ended_at:   form.ended_at   || null,
    })
    setSaving(false)
    if (error) { toast.error('Gagal membuat semester'); return }
    toast.success('Semester berhasil dibuat')
    setShowForm(false); setForm(EMPTY); fetchAll()
  }

  async function handleActivate(sem) {
    const ok = await showConfirm({
      title: `Aktifkan Semester?`,
      message: `Semester "${sem.name}" akan diaktifkan. Semester aktif lainnya akan dinonaktifkan secara otomatis.`,
      confirmLabel: 'Ya, Aktifkan',
      variant: 'warning',
    })
    if (!ok) return
    // Nonaktifkan semua, lalu aktifkan yang dipilih
    await supabase.from('semesters').update({ is_active: false }).neq('id', sem.id)
    const { error } = await supabase.from('semesters').update({
      is_active: true,
      started_at: sem.started_at || new Date().toISOString(),
    }).eq('id', sem.id)
    if (error) { toast.error('Gagal mengaktifkan'); return }
    toast.success(`Semester "${sem.name}" diaktifkan`)
    fetchAll()
  }

  async function handleClose(sem) {
    const ok = await showConfirm({
      title: 'Tutup Semester?',
      message: `Semester "${sem.name}" akan ditutup. Poin tidak akan bertambah lagi setelah ini.`,
      confirmLabel: 'Ya, Tutup',
      variant: 'warning',
    })
    if (!ok) return
    const { error } = await supabase.from('semesters').update({
      is_active: false,
      ended_at:  new Date().toISOString(),
    }).eq('id', sem.id)
    if (error) { toast.error('Gagal menutup'); return }
    toast.success(`Semester "${sem.name}" ditutup dan diarsip`)
    fetchAll()
  }

  async function handleDelete(sem) {
    const ok = await showConfirm({
      title: 'Hapus Semester?',
      message: `Hapus semester "${sem.name}"? Semua data poin terkait akan ikut terhapus dan tidak dapat dipulihkan.`,
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('semesters').delete().eq('id', sem.id)
    if (error) { toast.error('Gagal menghapus'); return }
    toast.success('Semester dihapus')
    fetchAll()
  }

  function f(field, val) { setForm(p => ({ ...p, [field]: val })) }

  const active   = list.find(s => s.is_active)
  const inactive  = list.filter(s => !s.is_active)
  const _archived = inactive.filter(s => s.ended_at)
  const _pending   = inactive.filter(s => !s.ended_at)

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="page-title">Manajemen Semester</h1>
          <p className="page-subtitle">Kelola semester aktif, buka/tutup, dan arsip</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}
          style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Plus size={15}/> Buat Semester
        </button>
      </div>

      {/* Semester aktif banner */}
      {active ? (
        <div style={{ marginBottom:20, padding:'16px 20px', background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:12, color:'#fff', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:10, background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <CheckCircle2 size={22} color="#fff"/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:700, opacity:.75, letterSpacing:.5, textTransform:'uppercase' }}>Semester Aktif</div>
            <div style={{ fontSize:18, fontWeight:800 }}>{active.name}</div>
            <div style={{ fontSize:12, opacity:.75 }}>
              Dimulai: {active.started_at ? new Date(active.started_at).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : '–'}
            </div>
          </div>
          <button onClick={() => handleClose(active)}
            style={{ padding:'8px 16px', borderRadius:8, background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
            <Square size={13}/> Tutup Semester
          </button>
        </div>
      ) : (
        <div style={{ marginBottom:20, padding:'14px 20px', background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
          <Clock size={18} color="#92400e"/>
          <span style={{ fontSize:13, color:'#92400e', fontWeight:600 }}>Tidak ada semester aktif — poin tidak akan terekam sampai semester diaktifkan</span>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h2 style={{ fontWeight:700, fontSize:16, margin:0 }}>Buat Semester Baru</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={18}/></button>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="label">Nama Semester</label>
                <input className="input" placeholder="contoh: Genap 2024/2025" value={form.name} onChange={e=>f('name',e.target.value)}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="label">Tahun Akademik</label>
                  <input className="input" type="number" min={2020} max={2099} value={form.year} onChange={e=>f('year',e.target.value)}/>
                </div>
                <div>
                  <label className="label">Periode</label>
                  <select className="input" value={form.period} onChange={e=>f('period',e.target.value)}>
                    <option value="ganjil">Ganjil</option>
                    <option value="genap">Genap</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="label">Tanggal Mulai (opsional)</label>
                  <input className="input" type="date" value={form.started_at} onChange={e=>f('started_at',e.target.value)}/>
                </div>
                <div>
                  <label className="label">Tanggal Selesai (opsional)</label>
                  <input className="input" type="date" value={form.ended_at} onChange={e=>f('ended_at',e.target.value)}/>
                </div>
              </div>
            </div>
            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--gray-100)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                {saving && <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/>}
                Buat Semester
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inactive semesters (pending + archived) */}
      {inactive.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>Semester Tidak Aktif</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {inactive.map(s => <SemesterCard key={s.id} sem={s} onActivate={handleActivate} onDelete={handleDelete}/>)}
          </div>
        </>
      )}

      {loading && <div className="spinner" style={{ margin:'40px auto' }}/>}
    </div>
    </>
  )
}

function SemesterCard({ sem, onActivate, onDelete, archived }) {
  const startDate = sem.started_at ? new Date(sem.started_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '–'
  const endDate   = sem.ended_at   ? new Date(sem.ended_at  ).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '–'

  return (
    <div className="card" style={{ opacity: sem.is_active ? 1 : archived ? .75 : 1 }}>
      <div style={{ padding:'14px 20px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:8, background: archived ? 'var(--gray-100)' : '#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {archived ? <Archive size={18} color="var(--gray-400)"/> : <Calendar size={18} color="var(--indigo-600)"/>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--gray-800)', display:'flex', alignItems:'center', gap:6 }}>
            {sem.name}
            {archived && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'var(--gray-100)', color:'var(--gray-500)', fontWeight:600 }}>Arsip</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--gray-400)' }}>
            {PERIOD_LABEL[sem.period]} · {sem.year}
            {sem.started_at && ` · ${startDate}`}
            {sem.ended_at   && ` – ${endDate}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {/* Tombol Aktifkan selalu muncul untuk semua semester tidak aktif */}
          <button className="btn btn-primary btn-sm" onClick={() => onActivate(sem)}
            style={{ display:'flex', alignItems:'center', gap:5 }}>
            <Play size={12}/> Aktifkan
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(sem)}
            style={{ color:'#dc2626' }}>
            <Trash2 size={14}/>
          </button>
        </div>
      </div>
    </div>
  )
}
