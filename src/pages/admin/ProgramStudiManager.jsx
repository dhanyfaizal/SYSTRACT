import { useState, useEffect } from 'react'
import { Plus, Trash2, GraduationCap, Loader2, X, AlertTriangle, Edit2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function ProgramStudiManager() {
  const [list,    setList]    = useState([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form,    setForm]    = useState({ name: '', code: '' })
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(null)  // id being deleted
  const { confirmDialog, showConfirm } = useConfirm()

  useEffect(() => { fetchList() }, [])

  async function fetchList() {
    const { data } = await supabase
      .from('program_studi')
      .select('*')
      .order('name')
    setList(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!form.name.trim()) { toast.error('Nama program studi wajib diisi'); return }
    setSaving(true)
    const { error } = await supabase.from('program_studi').insert({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase() || null,
    })
    if (error) {
      toast.error(error.message.includes('unique') ? 'Program studi sudah ada' : 'Gagal menambahkan')
    } else {
      toast.success('Program studi ditambahkan')
      setForm({ name: '', code: '' })
      setAdding(false)
      fetchList()
    }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editingItem.name.trim()) { toast.error('Nama program studi wajib diisi'); return }
    setSaving(true)
    const { error } = await supabase
      .from('program_studi')
      .update({
        name: editingItem.name.trim(),
        code: editingItem.code.trim().toUpperCase() || null,
      })
      .eq('id', editingItem.id)
    if (error) {
      toast.error(error.message.includes('unique') ? 'Program studi sudah ada' : 'Gagal mengubah')
    } else {
      toast.success('Program studi diperbarui')
      setEditingItem(null)
      fetchList()
    }
    setSaving(false)
  }

  async function handleDelete(id, name) {
    const ok = await showConfirm({
      title: 'Hapus Program Studi?',
      message: `Hapus "${name}"? Pengguna yang terdaftar di prodi ini tidak akan ikut terhapus.`,
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    setDeleting(id)
    const { error } = await supabase.from('program_studi').delete().eq('id', id)
    if (error) toast.error('Gagal menghapus')
    else { toast('Program studi dihapus', { icon: '🗑️' }); fetchList() }
    setDeleting(null)
  }

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Program Studi</h1>
          <p className="page-subtitle">{list.length} program studi terdaftar</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14}/> Tambah Prodi
        </button>
      </div>

      {/* Info */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
        padding: '12px 16px', marginBottom: 20,
        display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: '#1e40af',
      }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
        <span>
          Program studi ini digunakan sebagai pilihan di form edit pengguna.
          Menghapus prodi tidak akan menghapus pengguna yang sudah terdaftar.
        </span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <div className="spinner"/>
          </div>
        ) : list.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <GraduationCap size={32} color="var(--gray-200)"/>
              <p className="empty-state-text">Belum ada program studi</p>
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                <Plus size={13}/> Tambah
              </button>
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                {['#', 'Nama Program Studi', 'Kode', 'Aksi'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--gray-400)', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'var(--indigo-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <GraduationCap size={14} color="var(--indigo-600)"/>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.code
                      ? <span className="badge-pill badge-indigo">{p.code}</span>
                      : <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>–</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{ color: 'var(--indigo-600)' }}
                      onClick={() => setEditingItem({ id: p.id, name: p.name, code: p.code || '' })}
                    >
                      <Edit2 size={13}/>
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{ color: 'var(--danger)' }}
                      disabled={deleting === p.id}
                      onClick={() => handleDelete(p.id, p.name)}
                    >
                      {deleting === p.id
                        ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }}/>
                        : <Trash2 size={13}/>
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {adding && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAdding(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Tambah Program Studi</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setAdding(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Nama Program Studi *</label>
                <input
                  className="input"
                  placeholder="cth: Sistem Informasi"
                  value={form.name}
                  autoFocus
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Kode (opsional)</label>
                <input
                  className="input"
                  placeholder="cth: SI"
                  maxLength={10}
                  value={form.code}
                  style={{ textTransform: 'uppercase' }}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <span className="input-hint">Kode singkat program studi, maks 10 karakter</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }}/> : <Plus size={13}/>}
                Tambahkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingItem(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Edit Program Studi</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingItem(null)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Nama Program Studi *</label>
                <input
                  className="input"
                  placeholder="cth: Sistem Informasi"
                  value={editingItem.name}
                  autoFocus
                  onChange={e => setEditingItem(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleEdit()}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Kode (opsional)</label>
                <input
                  className="input"
                  placeholder="cth: SI"
                  maxLength={10}
                  value={editingItem.code}
                  style={{ textTransform: 'uppercase' }}
                  onChange={e => setEditingItem(f => ({ ...f, code: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleEdit()}
                />
                <span className="input-hint">Kode singkat program studi, maks 10 karakter</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleEdit} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }}/> : <Save size={13}/>}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
