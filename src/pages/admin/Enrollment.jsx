import { useState, useEffect } from 'react'
import { Plus, Trash2, Search, Loader2, X, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function AdminEnrollment() {
  const [courses,   setCourses]   = useState([])
  const [students,  setStudents]  = useState([])
  const [selCourse, setSelCourse] = useState('')
  const [enrolled,  setEnrolled]  = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [adding,    setAdding]    = useState(false)
  const { confirmDialog, showConfirm } = useConfirm()

  useEffect(() => {
    supabase.from('courses').select('id,code,name').order('name').then(({data}) => setCourses(data||[]))
    supabase.from('profiles').select('id,full_name,nim,email').eq('role','mahasiswa').order('full_name').then(({data}) => setStudents(data||[]))
  }, [])

  useEffect(() => {
    if (selCourse) fetchEnrolled()
  }, [selCourse])

  async function fetchEnrolled() {
    setLoading(true)
    const { data } = await supabase.from('enrollments')
      .select('id, student:profiles!student_id(id,full_name,nim,email)')
      .eq('course_id', selCourse)
    setEnrolled(data || [])
    setLoading(false)
  }

  async function handleAdd(studentId) {
    setAdding(true)
    const { error } = await supabase.from('enrollments').insert({ course_id: selCourse, student_id: studentId })
    if (error) { toast.error(error.message.includes('unique') ? 'Mahasiswa sudah terdaftar' : 'Gagal'); }
    else toast.success('Mahasiswa berhasil didaftarkan')
    setAdding(false); fetchEnrolled()
  }

  async function handleRemove(enrollId, name) {
    const ok = await showConfirm({
      title: 'Hapus Peserta?',
      message: `Hapus ${name} dari mata kuliah ini? Data nilai dan pengumpulan tidak akan terhapus.`,
      confirmLabel: 'Ya, Hapus',
      variant: 'warning',
    })
    if (!ok) return
    await supabase.from('enrollments').delete().eq('id', enrollId)
    toast('Enrollment dihapus', { icon:'🗑️' })
    fetchEnrolled()
  }

  const enrolledIds = new Set(enrolled.map(e => e.student?.id))
  const filteredStudents = students.filter(s =>
    !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.nim?.includes(search)
  ).filter(s => !enrolledIds.has(s.id))

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header">
        <h1 className="page-title">Enrollment Mahasiswa</h1>
        <p className="page-subtitle">Daftarkan mahasiswa ke mata kuliah</p>
      </div>

      <div className="input-group" style={{ maxWidth:400, marginBottom:24 }}>
        <label className="input-label">Pilih Mata Kuliah</label>
        <select className="input" value={selCourse} onChange={e => setSelCourse(e.target.value)}>
          <option value="">— Pilih Mata Kuliah —</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </select>
      </div>

      {selCourse && (
        <div className="dashboard-grid">
          {/* Enrolled list */}
          <div className="card">
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <GraduationCap size={15} color="var(--gray-500)"/>
                <strong style={{ fontSize:13 }}>Sudah Terdaftar ({enrolled.length})</strong>
              </div>
            </div>
            <div style={{ maxHeight:400, overflowY:'auto' }}>
              {loading ? <div style={{ padding:20, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
              : enrolled.length === 0 ? <div style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Belum ada mahasiswa</div>
              : enrolled.map((e, i) => (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom: i < enrolled.length-1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <div className="avatar" style={{ width:28, height:28, fontSize:11 }}>{e.student?.full_name?.[0]||'M'}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.student?.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.student?.nim}</div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleRemove(e.id, e.student?.full_name)}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add students */}
          <div className="card">
            <div className="card-header">
              <strong style={{ fontSize:13 }}>Tambah Mahasiswa</strong>
              <div style={{ position:'relative' }}>
                <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }}/>
                <input className="input" style={{ paddingLeft:26, fontSize:12 }} placeholder="Cari…" value={search} onChange={e => setSearch(e.target.value)}/>
              </div>
            </div>
            <div style={{ maxHeight:400, overflowY:'auto' }}>
              {filteredStudents.length === 0
                ? <div style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--gray-400)' }}>Semua mahasiswa sudah terdaftar</div>
                : filteredStudents.map((s, i) => (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom: i < filteredStudents.length-1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <div className="avatar" style={{ width:28, height:28, fontSize:11 }}>{s.full_name?.[0]||'M'}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{s.nim}</div>
                    </div>
                    <button className="btn btn-primary btn-icon btn-sm" onClick={() => handleAdd(s.id)} disabled={adding}>
                      <Plus size={12}/>
                    </button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
