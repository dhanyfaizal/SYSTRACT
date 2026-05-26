/**
 * ShopItemManager — Admin CRUD for shop items.
 */
import { useState, useEffect } from 'react'
import {
  ShoppingBag, Plus, Edit2, Trash2, X, Save, Loader2,
  ToggleLeft, ToggleRight, Search
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast        from 'react-hot-toast'

const CATEGORY_LABELS = {
  hair: '💇 Rambut', hat: '🎩 Topi', shirt: '👕 Baju',
  accessory: '🕶️ Aksesoris', background: '🖼️ Background', face: '😊 Wajah',
}
const RARITY_OPTIONS = ['common', 'rare', 'epic', 'legendary']
const RARITY_COLORS  = { common: '#64748B', rare: '#3B82F6', epic: '#7C3AED', legendary: '#F59E0B' }

const EMPTY_FORM = {
  name: '', description: '', category: 'hair', price: 10,
  image_url: '/assets/avatar/', rarity: 'common', is_active: true, sort_order: 0,
}

export default function ShopItemManager() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [modal,   setModal]   = useState(null) // null | 'new' | item object
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase.from('shop_items').select('*').order('category').order('sort_order')
    setItems(data || [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY_FORM); setModal('new') }
  function openEdit(item) { setForm({ ...item }); setModal(item) }

  async function handleSave() {
    if (!form.name || !form.image_url) { toast.error('Nama dan URL gambar wajib diisi'); return }
    setSaving(true)

    if (modal === 'new') {
      const { error } = await supabase.from('shop_items').insert([{
        name: form.name, description: form.description, category: form.category,
        price: Number(form.price), image_url: form.image_url, rarity: form.rarity,
        is_active: form.is_active, sort_order: Number(form.sort_order),
      }])
      if (error) toast.error(error.message)
      else toast.success('Item ditambahkan!')
    } else {
      const { error } = await supabase.from('shop_items').update({
        name: form.name, description: form.description, category: form.category,
        price: Number(form.price), image_url: form.image_url, rarity: form.rarity,
        is_active: form.is_active, sort_order: Number(form.sort_order),
      }).eq('id', modal.id)
      if (error) toast.error(error.message)
      else toast.success('Item diperbarui!')
    }
    setSaving(false)
    setModal(null)
    fetchItems()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus item ini?')) return
    const { error } = await supabase.from('shop_items').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Item dihapus'); fetchItems() }
  }

  async function toggleActive(item) {
    await supabase.from('shop_items').update({ is_active: !item.is_active }).eq('id', item.id)
    fetchItems()
  }

  const filtered = items.filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={20} color="#7C3AED" /> Kelola Toko Avatar
          </h1>
          <p className="page-subtitle">Tambah, edit, dan kelola item toko avatar</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew} style={{ gap: 5 }}>
          <Plus size={14} /> Tambah Item
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">Semua Kategori</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="input" placeholder="Cari item..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 'auto' }}>{filtered.length} item</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="spinner" style={{ margin: '60px auto' }} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>ITEM</th>
                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>KATEGORI</th>
                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>HARGA</th>
                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>RARITY</th>
                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>STATUS</th>
                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--gray-500)', fontSize: 11 }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={item.image_url} alt="" style={{ maxWidth: 28, maxHeight: 28, objectFit: 'contain' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{item.description?.slice(0, 40)}</div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className="badge-pill badge-slate">{CATEGORY_LABELS[item.category] || item.category}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#D97706' }}>{item.price}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: RARITY_COLORS[item.rarity] + '18', color: RARITY_COLORS[item.rarity],
                    }}>
                      {item.rarity}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => toggleActive(item)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      {item.is_active
                        ? <ToggleRight size={22} color="#10B981" />
                        : <ToggleLeft size={22} color="var(--gray-300)" />}
                    </button>
                  </td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)} title="Edit"><Edit2 size={13} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)} title="Hapus" style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Tidak ada item</div>
          )}
        </div>
      )}

      {/* ── Modal: Add/Edit ────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'new' ? 'Tambah Item' : 'Edit Item'}</span>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="var(--gray-400)" /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Nama Item</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Contoh: Topi Baseball" />
              </div>
              <div className="input-group">
                <label className="input-label">Deskripsi</label>
                <input className="input" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Deskripsi singkat" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="input-group">
                  <label className="input-label">Kategori</label>
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Rarity</label>
                  <select className="input" value={form.rarity} onChange={e => setForm(f => ({ ...f, rarity: e.target.value }))}>
                    {RARITY_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="input-group">
                  <label className="input-label">Harga (Koin)</label>
                  <input className="input" type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Urutan</label>
                  <input className="input" type="number" min="0" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">URL Gambar</label>
                <input className="input" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="/assets/avatar/nama_file.svg" />
                <span className="input-hint">Path relatif ke public/ (contoh: /assets/avatar/hat_new.svg)</span>
              </div>
              {form.image_url && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 12, background: 'var(--gray-50)', borderRadius: 10 }}>
                  <img src={form.image_url} alt="Preview" style={{ maxHeight: 80, maxWidth: 80, objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)} disabled={saving}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 5 }}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Save size={13} />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
