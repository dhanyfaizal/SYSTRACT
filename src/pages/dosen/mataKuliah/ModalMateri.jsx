// Modal tambah/edit materi: judul, deskripsi, nomor topik, beban belajar & CPMK, dan lampiran.
import { useState } from 'react'
import { X, Loader2, BookMarked, PlusCircle, Plus, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import BebanBelajarFields from '@/components/dosen/BebanBelajarFields'
import AttachRow from './AttachRow'
import { ATTACH_TYPES, BLANK_ATTACH, BLANK_MATERIAL_FORM } from './konstanta'

function formDariMateri(m) {
  if (!m) return BLANK_MATERIAL_FORM()
  const attachments = (m.attachments && m.attachments.length > 0)
    ? m.attachments
    : m.webview_link ? [{ mime: m.mime_type || ATTACH_TYPES[0].mime, url: m.webview_link, label: '' }]
    : [BLANK_ATTACH()]
  return { title: m.title, description: m.description || '', week_number: m.week_number || 1, attachments,
    estimasi_menit: m.estimasi_menit ?? null, jenis_aktivitas: m.jenis_aktivitas ?? null, cpmk_kode: m.cpmk_kode || [] }
}

/** materi: null untuk materi baru. onSaved dipanggil setelah tersimpan. */
export default function ModalMateri({ course, materi, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState(() => formDariMateri(materi))
  const [saving, setSaving] = useState(false)

  function updateAttach(idx, key, val) {
    setForm(f => {
      const arr = [...f.attachments]
      arr[idx] = { ...arr[idx], [key]: val }
      return { ...f, attachments: arr }
    })
  }
  const addAttach = () => setForm(f => ({ ...f, attachments: [...f.attachments, BLANK_ATTACH()] }))
  const removeAttach = (idx) => setForm(f => ({ ...f, attachments: f.attachments.filter((_, i) => i !== idx) }))

  async function simpan() {
    if (!form.title.trim()) { toast.error('Judul wajib diisi'); return }
    const filled = form.attachments.filter(a => a.url.trim())
    if (filled.length === 0) { toast.error('Tambahkan minimal 1 lampiran dengan URL'); return }
    setSaving(true)
    const first = filled[0]

    const payload = {
      title: form.title,
      description: form.description,
      week_number: form.week_number,
      attachments: filled,
      webview_link: first.url,
      mime_type: first.mime,
      estimasi_menit: form.estimasi_menit ?? null,
      jenis_aktivitas: form.jenis_aktivitas || null,
      cpmk_kode: form.cpmk_kode || [],
    }

    let error
    if (materi) {
      ;({ error } = await supabase.from('materials').update(payload).eq('id', materi.id))
    } else {
      ;({ error } = await supabase.from('materials').insert({ ...payload, course_id: course.id, uploaded_by: user.id }))
    }

    // Cadangan bila kolom attachments belum ada di server.
    if (error && error.message?.includes('attachments')) {
      toast('⚠️ Kolom attachments belum ada di server. Menyimpan dengan link tunggal...', { duration: 5000 })
      const fallbackPayload = {
        title: form.title,
        description: form.description,
        week_number: form.week_number,
        webview_link: first.url,
        mime_type: first.mime
      }
      if (materi) {
        ;({ error } = await supabase.from('materials').update(fallbackPayload).eq('id', materi.id))
      } else {
        ;({ error } = await supabase.from('materials').insert({ ...fallbackPayload, course_id: course.id, uploaded_by: user.id }))
      }
    }

    setSaving(false)
    if (error) {
      toast.error('Gagal menyimpan: ' + error.message)
    } else {
      toast.success(materi ? 'Materi diperbarui' : 'Materi ditambahkan')
      onSaved?.()
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:540, maxHeight:'85vh', overflow:'auto' }}>
        <div className="modal-header" style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookMarked size={16} color="var(--indigo-600)"/>
            <span className="modal-title">{materi ? 'Edit Materi' : 'Tambah Materi'}</span>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
        </div>
        <div className="modal-body">
          <div className="input-group">
            <label className="input-label">Judul Materi *</label>
            <input className="input" placeholder="cth: Pengantar Jaringan Komputer" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
          </div>
          <div className="input-group">
            <label className="input-label">Deskripsi</label>
            <textarea className="input" rows={2} style={{ resize:'vertical' }} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))}/>
          </div>
          <div className="input-group">
            <label className="input-label">Nomor Topik</label>
            <input className="input" type="number" min={0} max={16} value={form.week_number} onChange={e => setForm(f=>({...f,week_number:+e.target.value}))}/>
            <span className="input-hint">Isi 0 untuk materi umum / pendahuluan kelas</span>
          </div>

          <BebanBelajarFields
            value={form}
            onChange={(v) => setForm(f => ({ ...f, estimasi_menit: v.estimasi_menit, jenis_aktivitas: v.jenis_aktivitas, cpmk_kode: v.cpmk_kode }))}
            cpmkList={(course?.cpmk || []).filter(c => c?.kode)}
            denganJenis
            petunjukMenit="Total waktu menonton, membaca, atau praktik semua lampiran materi ini."
          />

          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent: 'space-between', marginBottom:10 }}>
              <label className="input-label" style={{ margin:0 }}>
                Lampiran Berkas ({form.attachments.length})
              </label>
              <button className="btn btn-ghost btn-sm" onClick={addAttach} style={{ gap:5, color:'var(--indigo-600)', padding: '2px 8px', fontSize: 12 }}>
                <PlusCircle size={13}/> Tambah Lampiran
              </button>
            </div>

            {form.attachments.map((a, i) => (
              <AttachRow
                key={i}
                attach={a}
                idx={i}
                onChange={updateAttach}
                onRemove={removeAttach}
                canRemove={form.attachments.length > 1}
              />
            ))}
          </div>
        </div>
        <div className="modal-footer" style={{ position:'sticky', bottom:0, background:'var(--surface)', zIndex:1 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={simpan} disabled={saving}>
            {saving ? <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> : materi ? <Edit2 size={13}/> : <Plus size={13}/>}
            {materi ? 'Simpan Materi' : 'Tambahkan'}
          </button>
        </div>
      </div>
    </div>
  )
}
