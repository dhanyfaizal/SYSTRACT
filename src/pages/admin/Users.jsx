import { useState, useEffect, useRef } from 'react'
import { Users, Search, Edit2, Loader2, X, Shield, CheckSquare, Square, ChevronDown, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const ROLES = ['mahasiswa','dosen','admin','guest']
const ROLE_COLORS = { admin:'badge-red', dosen:'badge-amber', mahasiswa:'badge-indigo', guest:'badge-slate' }
const ROLE_LABELS = { mahasiswa:'Mahasiswa', dosen:'Dosen', admin:'Admin', guest:'Guest' }

export default function AdminUsers() {
  const [users,       setUsers]       = useState([])
  const [prodiList,   setProdiList]   = useState([])
  const [search,      setSearch]      = useState('')
  const [filterRole,  setFilterRole]  = useState('')
  const [loading,     setLoading]     = useState(true)
  const [editing,     setEditing]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [editForm,    setEditForm]    = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkRole,    setBulkRole]    = useState('mahasiswa')
  const [bulkSaving,  setBulkSaving]  = useState(false)
  const [page,        setPage]        = useState(0)
  const [totalCount,  setTotalCount]  = useState(0)
  const [roleCounts,  setRoleCounts]  = useState({})
  const PAGE_SIZE = 25
  const searchTimer = useRef(null)
  const { confirmDialog, showConfirm } = useConfirm()

  useEffect(() => { fetchUsers(0, '', ''); fetchProdi(); fetchRoleCounts() }, [])

  async function fetchUsers(pageNum = page, q = search, role = filterRole) {
    setLoading(true)
    const from = pageNum * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase.from('profiles').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    // Server-side role filter
    if (role) query = query.eq('role', role)

    // Server-side search (multi-column OR)
    if (q.trim()) {
      const s = q.trim()
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,nim.ilike.%${s}%,nidn.ilike.%${s}%`)
    }

    const { data, count } = await query
    setUsers(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  async function fetchRoleCounts() {
    const counts = {}
    await Promise.all(ROLES.map(async r => {
      const { count } = await supabase.from('profiles')
        .select('*', { count: 'exact', head: true }).eq('role', r)
      counts[r] = count || 0
    }))
    setRoleCounts(counts)
  }

  async function fetchProdi() {
    const { data } = await supabase.from('program_studi').select('id, name, code').order('name')
    setProdiList(data || [])
  }

  // ── Single edit ─────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name:     editForm.full_name,
      nim:           editForm.role === 'mahasiswa' ? editForm.nim  : null,
      nidn:          editForm.role === 'dosen'     ? editForm.nidn : null,
      program_studi: editForm.program_studi || null,
      role:          editForm.role,
    }).eq('id', editing.id)
    if (error) {
      toast.error(`Gagal menyimpan: ${error.message}`)
    } else {
      toast.success('Profil berhasil diperbarui')
      fetchUsers(page, search, filterRole)
      fetchRoleCounts()
      setEditing(null)
    }
    setSaving(false)
  }

  // ── Bulk change role ─────────────────────────────────────────────
  async function handleBulkChangeRole() {
    if (!selectedIds.size) return
    const selectedNames = users.filter(u => selectedIds.has(u.id)).map(u => u.full_name || u.email).slice(0,3)
    const more = selectedIds.size > 3 ? ` +${selectedIds.size - 3} lainnya` : ''
    const ok = await showConfirm({
      title: `Ubah Role ${selectedIds.size} Pengguna?`,
      message: `${selectedNames.join(', ')}${more} akan diubah menjadi role "${ROLE_LABELS[bulkRole]}". Tindakan ini mempengaruhi akses sistem mereka.`,
      confirmLabel: `Ya, Ubah ke ${ROLE_LABELS[bulkRole]}`,
      variant: 'warning',
    })
    if (!ok) return

    setBulkSaving(true)
    const ids = [...selectedIds]
    const updates = ids.map(id => supabase.from('profiles').update({ role: bulkRole }).eq('id', id))
    const results = await Promise.all(updates)
    const failed = results.filter(r => r.error)
    if (failed.length) {
      toast.error(`${failed.length} pengguna gagal diupdate`)
    } else {
      toast.success(`${ids.length} pengguna berhasil diubah ke role "${ROLE_LABELS[bulkRole]}"`)
      setSelectedIds(new Set())
    }
    setBulkSaving(false)
    fetchUsers(page, search, filterRole)
    fetchRoleCounts()
  }

  // ── Selection helpers ────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(users.map(u => u.id)))
    }
  }

  // Helpers: search debounce + role filter
  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(0)
      fetchUsers(0, val, filterRole)
    }, 300)
  }

  function handleRoleFilter(role) {
    setFilterRole(role)
    setPage(0)
    setSelectedIds(new Set())
    fetchUsers(0, search, role)
  }

  function goToPage(p) {
    const next = Math.max(0, Math.min(p, Math.ceil(totalCount / PAGE_SIZE) - 1))
    setPage(next)
    fetchUsers(next, search, filterRole)
    setSelectedIds(new Set())
  }

  const allSelected  = users.length > 0 && selectedIds.size === users.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < users.length
  const totalPages   = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Manajemen Pengguna</h1>
          <p className="page-subtitle">{totalCount} pengguna terdaftar</p>
        </div>
      </div>

      {/* ── Bulk Action Bar (muncul saat ada yang dipilih) ─────── */}
      {selectedIds.size > 0 && (
        <div style={{
          background:'linear-gradient(135deg, #4f46e5, #7c3aed)',
          borderRadius:12, padding:'12px 18px', marginBottom:16,
          display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
          boxShadow:'0 4px 20px rgba(79,70,229,.3)',
          animation:'slideUp .2s ease',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'white' }}>
            <UserCheck size={16}/>
            <span style={{ fontWeight:700, fontSize:14 }}>{selectedIds.size} pengguna dipilih</span>
          </div>

          <div style={{ height:20, width:1, background:'rgba(255,255,255,.3)' }}/>

          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, color:'rgba(255,255,255,.8)' }}>Ubah role ke:</span>
            <div style={{ position:'relative' }}>
              <select
                value={bulkRole}
                onChange={e => setBulkRole(e.target.value)}
                style={{
                  padding:'6px 32px 6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.4)',
                  background:'rgba(255,255,255,.15)', color:'white', fontSize:13, fontWeight:700,
                  cursor:'pointer', appearance:'none', outline:'none',
                }}
              >
                {ROLES.map(r => (
                  <option key={r} value={r} style={{ background:'#4f46e5', color:'white' }}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'white', pointerEvents:'none' }}/>
            </div>

            <button
              onClick={handleBulkChangeRole}
              disabled={bulkSaving}
              style={{
                padding:'6px 16px', borderRadius:8, border:'2px solid rgba(255,255,255,.6)',
                background:'white', color:'#4f46e5', fontSize:13, fontWeight:700,
                cursor:'pointer', display:'flex', alignItems:'center', gap:6, transition:'all .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.9)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
            >
              {bulkSaving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : <Shield size={13}/>}
              Terapkan
            </button>
          </div>

          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:6, padding:'5px 12px', color:'white', fontSize:12, cursor:'pointer', fontWeight:600 }}
          >
            Batal pilih
          </button>
        </div>
      )}

      <div className="card">
        {/* ── Toolbar: Search + Filter Role ─────────────────────── */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }}/>
            <input className="input" style={{ paddingLeft:32 }} placeholder="Cari nama, email, NIM, NIDN…"
              value={search} onChange={e => handleSearchChange(e.target.value)}/>
          </div>

          {/* Filter chip by role */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button
              onClick={() => handleRoleFilter('')}
              style={{
                padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer',
                background: !filterRole ? 'var(--indigo-600)' : 'var(--gray-100)',
                color:      !filterRole ? 'white'              : 'var(--gray-600)',
                border:'none', transition:'all .12s',
              }}
            >
              Semua ({totalCount})
            </button>
            {ROLES.map(r => (
              <button
                key={r}
                onClick={() => handleRoleFilter(r === filterRole ? '' : r)}
                style={{
                  padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer',
                  background: filterRole === r ? 'var(--indigo-600)' : 'var(--gray-100)',
                  color:      filterRole === r ? 'white'              : 'var(--gray-600)',
                  border:'none', transition:'all .12s',
                }}
              >
                {ROLE_LABELS[r]} ({roleCounts[r] ?? '…'})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding:32, display:'flex', justifyContent:'center' }}><div className="spinner"/></div>
        ) : users.length === 0 ? (
          <div className="empty-state" style={{ padding:40 }}>
            <Users size={32} color="var(--gray-300)"/>
            <p className="empty-state-text">Tidak ada pengguna ditemukan</p>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--gray-50)', borderBottom:'1px solid var(--gray-200)' }}>
                {/* Checkbox select-all */}
                <th style={{ padding:'10px 12px 10px 16px', width:40 }}>
                  <button
                    onClick={toggleSelectAll}
                    style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', color: allSelected ? 'var(--indigo-600)' : 'var(--gray-400)', padding:0 }}
                    title={allSelected ? 'Batalkan semua' : 'Pilih semua'}
                  >
                    {allSelected
                      ? <CheckSquare size={16} color="var(--indigo-600)"/>
                      : someSelected
                        ? <CheckSquare size={16} color="var(--indigo-400)" style={{ opacity:.6 }}/>
                        : <Square size={16}/>
                    }
                  </button>
                </th>
                {['Pengguna','Role','NIM/NIDN','Program Studi','Aksi'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isSelected = selectedIds.has(u.id)
                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: i < users.length-1 ? '1px solid var(--gray-100)' : 'none',
                      background: isSelected ? '#eef2ff' : 'transparent',
                      transition: 'background .1s',
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding:'12px 12px 12px 16px' }}>
                      <button
                        onClick={() => toggleSelect(u.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:0 }}
                      >
                        {isSelected
                          ? <CheckSquare size={16} color="var(--indigo-600)"/>
                          : <Square size={16} color="var(--gray-300)"/>
                        }
                      </button>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div className="avatar" style={{ width:30, height:30, fontSize:12 }}>
                          {u.avatar_url ? <img src={u.avatar_url} alt=""/> : u.full_name?.[0]||'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{u.full_name||'–'}</div>
                          <div style={{ fontSize:11, color:'var(--gray-400)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <span className={`badge-pill ${ROLE_COLORS[u.role]||'badge-slate'}`}>{u.role}</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'var(--gray-600)' }}>{u.nim||u.nidn||'–'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'var(--gray-600)' }}>{u.program_studi||'–'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(u); setEditForm({...u}) }} title="Edit pengguna">
                        <Edit2 size={13}/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Footer: count + pagination */}
        {!loading && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--gray-100)', fontSize:12, color:'var(--gray-400)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
            <span>
              Halaman {page + 1} dari {Math.max(1, totalPages)}
              {' · '}{totalCount} pengguna{filterRole ? ` (${ROLE_LABELS[filterRole]})` : ''}
            </span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {selectedIds.size > 0 && <span style={{ color:'var(--indigo-600)', fontWeight:600, marginRight:8 }}>{selectedIds.size} dipilih (halaman ini)</span>}
              <button className="btn btn-secondary btn-sm" onClick={() => goToPage(page - 1)} disabled={page === 0}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px' }}>
                <ChevronLeft size={13}/> Prev
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px' }}>
                Next <ChevronRight size={13}/>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Single User Modal ─────────────────────────────── */}
      {editing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Shield size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Edit Pengguna</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(null)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Nama Lengkap</label>
                <input className="input" value={editForm.full_name||''} onChange={e => setEditForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select className="input" value={editForm.role} onChange={e => {
                  const newRole = e.target.value
                  setEditForm(f => ({ ...f, role: newRole, nim: newRole === 'mahasiswa' ? f.nim : '', nidn: newRole === 'dosen' ? f.nidn : '' }))
                }}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <span className="input-hint">Mengubah role akan mempengaruhi akses sistem</span>
              </div>
              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label" style={{ color: editForm.role !== 'mahasiswa' ? 'var(--gray-300)' : undefined }}>NIM</label>
                  <input className="input" placeholder="Untuk mahasiswa" value={editForm.nim || ''} disabled={editForm.role !== 'mahasiswa'}
                    style={editForm.role !== 'mahasiswa' ? { background:'var(--gray-50)', color:'var(--gray-300)', cursor:'not-allowed' } : {}}
                    onChange={e => setEditForm(f => ({...f, nim: e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label" style={{ color: editForm.role !== 'dosen' ? 'var(--gray-300)' : undefined }}>NIDN/NUPTK</label>
                  <input className="input" placeholder="Untuk dosen" value={editForm.nidn || ''} disabled={editForm.role !== 'dosen'}
                    style={editForm.role !== 'dosen' ? { background:'var(--gray-50)', color:'var(--gray-300)', cursor:'not-allowed' } : {}}
                    onChange={e => setEditForm(f => ({...f, nidn: e.target.value}))}/>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Program Studi</label>
                <select className="input" value={editForm.program_studi || ''} onChange={e => setEditForm(f => ({...f, program_studi: e.target.value}))}>
                  <option value="">— Pilih Program Studi —</option>
                  {prodiList.map(p => (
                    <option key={p.id} value={p.name}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
