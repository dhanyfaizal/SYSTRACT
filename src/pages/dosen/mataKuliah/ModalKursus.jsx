// Modal tambah/edit kursus. Admin memilih instruktur pengampu; instruktur otomatis menjadi pengampu.
import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth'
import { COLORS, SEMESTERS, BLANK_COURSE_FORM, pecahKompetensi } from './konstanta'

function formDariKursus(c, isAdmin, userId) {
  if (!c) return { ...BLANK_COURSE_FORM, dosen_id: isAdmin ? '' : userId }
  return {
    code:        c.code,
    name:        c.name,
    description: c.description || '',
    credits:     c.credits,
    semester:    c.semester || SEMESTERS[0],
    cover_color: c.cover_color || '#4f46e5',
    dosen_id:    c.dosen_id || '',
    kompetensi_teks: (c.kompetensi_singkat || []).join(', '),
  }
}

/**
 * @param {object|null} kursus     null untuk kursus baru
 * @param {object[]}    dosenList  daftar instruktur (untuk admin)
 * @param {Function}    onSaved    ({ id, baru }) setelah tersimpan
 */
export default function ModalKursus({ kursus, dosenList = [], onClose, onSaved }) {
  const { user, isAdmin } = useAuth()
  const [form, setForm] = useState(() => formDariKursus(kursus, isAdmin, user?.id))
  const [saving, setSaving] = useState(false)

  async function simpan() {
    if (!form.code || !form.name) { toast.error('Kode dan nama wajib diisi'); return }
    if (isAdmin && !form.dosen_id) { toast.error('Pilih dosen pengampu terlebih dahulu'); return }

    setSaving(true)
    const { kompetensi_teks, ...isiForm } = form
    const payload = {
      ...isiForm,
      kompetensi_singkat: pecahKompetensi(kompetensi_teks),
      dosen_id: isAdmin ? form.dosen_id : user.id,
    }

    let error
    let returnedData = null
    if (kursus?.id) {
      ;({ error } = await supabase.from('courses').update(payload).eq('id', kursus?.id))
    } else {
      const res = await supabase.from('courses').insert(payload).select().single()
      error = res.error
      returnedData = res.data
    }

    if (error) {
      console.error('[EduSYS] save course:', error)
      toast.error(`Gagal menyimpan: ${error.message}`)
    } else {
      toast.success(kursus?.id ? 'Kursus diperbarui' : 'Kursus ditambahkan')
      onSaved?.({ id: kursus?.id || returnedData?.id || null, baru: !kursus })
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <span className="modal-title">{kursus ? 'Edit' : 'Tambah'} Mata Kuliah</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
        </div>
        <div className="modal-body">
          {isAdmin && (
            <div className="input-group">
              <label className="input-label">Instruktur Pengampu *</label>
              <select className="input" value={form.dosen_id} onChange={e => setForm(f => ({...f, dosen_id: e.target.value}))}>
                <option value="">— Pilih Instruktur —</option>
                {dosenList.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name} ({d.email})</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-grid form-grid-2">
            <div className="input-group">
              <label className="input-label">Kode Kursus *</label>
              <input className="input" placeholder="MIF123" value={form.code} onChange={e => setForm(f=>({...f, code:e.target.value}))}/>
            </div>
            <div className="input-group">
              <label className="input-label">SKS</label>
              <input className="input" type="number" min={1} max={6} value={form.credits} onChange={e => setForm(f=>({...f, credits:+e.target.value}))}/>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Nama Kursus *</label>
            <input className="input" placeholder="Pemrograman Web" value={form.name} onChange={e => setForm(f=>({...f, name:e.target.value}))}/>
          </div>
          <div className="input-group">
            <label className="input-label">Deskripsi</label>
            <textarea className="input" rows={2} style={{ resize:'vertical' }} value={form.description} onChange={e => setForm(f=>({...f, description:e.target.value}))}/>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="kompetensi-singkat">Kompetensi singkat (tercetak di sertifikat)</label>
            <input id="kompetensi-singkat" className="input" placeholder="cth: Excel, Word, PowerPoint" value={form.kompetensi_teks || ''} onChange={e => setForm(f=>({...f, kompetensi_teks:e.target.value}))}/>
            <span className="input-hint">
              Pisahkan dengan koma, maks. 6 butir pendek.{pecahKompetensi(form.kompetensi_teks).length > 0 && ` Tampil: ${pecahKompetensi(form.kompetensi_teks).join(' · ')}`}
            </span>
          </div>
          <div className="input-group">
            <label className="input-label">Semester</label>
            <select className="input" value={form.semester} onChange={e => setForm(f=>({...f, semester:e.target.value}))}>
              {SEMESTERS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Warna Kelas</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f=>({...f,cover_color:c}))}
                  style={{ width:28, height:28, borderRadius:'50%', background:c,
                    border: form.cover_color===c ? '3px solid var(--gray-900)' : '3px solid transparent',
                    cursor:'pointer' }}/>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={simpan} disabled={saving}>
            {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : null}
            {kursus ? 'Simpan' : 'Tambahkan'}
          </button>
        </div>
      </div>
    </div>
  )
}
