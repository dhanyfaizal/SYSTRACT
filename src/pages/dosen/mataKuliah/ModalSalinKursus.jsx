// Modal salin kursus (admin): buat kursus baru dari kursus sumber, opsional beserta materi,
// tugas, bank soal, ujian, dan forum.
import { useState } from 'react'
import { X, Loader2, Copy, CheckCircle2, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { SEMESTERS } from './konstanta'

/**
 * @param {object}   sumber     kursus yang disalin
 * @param {object[]} dosenList  daftar instruktur
 * @param {Function} onSaved    (idKursusBaru) setelah selesai
 */
export default function ModalSalinKursus({ sumber, dosenList = [], onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ code: sumber.code + '-COPY', name: 'Salinan ' + sumber.name, semester: SEMESTERS[0], dosen_id: sumber.dosen_id || '' }))
  const [copyOpts, setCopyOpts] = useState({ materials: true, assignments: true, questions: true, exams: true, forums: true })
  const [copying, setCopying] = useState(false)
  const [copyStep, setCopyStep] = useState('')

  async function salin() {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Kode dan nama wajib diisi'); return }
    if (!form.dosen_id) { toast.error('Pilih dosen pengampu'); return }
    setCopying(true)
    try {
      setCopyStep('Membuat kursus baru...')
      const { data: newCourse, error: cErr } = await supabase.from('courses').insert({
        code: form.code.trim(), name: form.name.trim(),
        description: sumber.description || '',
        credits: sumber.credits, semester: form.semester,
        cover_color: sumber.cover_color || '#4f46e5',
        dosen_id: form.dosen_id, is_active: true,
      }).select().single()
      if (cErr) throw new Error('Gagal membuat kursus: ' + cErr.message)

      const sid = sumber.id, nid = newCourse.id

      await Promise.all([
        copyOpts.materials   && copyMaterials(sid, nid),
        copyOpts.assignments && copyAssignments(sid, nid),
        copyOpts.questions   && copyQuestions(sid, nid),
        copyOpts.exams       && copyExams(sid, nid),
        copyOpts.forums      && copyForums(sid, nid),
      ].filter(Boolean))

      toast.success(`Kursus "${newCourse.name}" berhasil disalin!`)
      onSaved?.(nid)
    } catch (err) {
      toast.error(err.message || 'Gagal menyalin kursus')
    } finally {
      setCopying(false)
      setCopyStep('')
    }
  }

  async function copyMaterials(fromId, toId) {
    setCopyStep('Menyalin materi...')
    const { data } = await supabase.from('materials').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('materials').insert(rows)
  }

  async function copyAssignments(fromId, toId) {
    setCopyStep('Menyalin tugas...')
    const { data } = await supabase.from('assignments').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({
      ...rest, course_id: toId, due_date: null,
    }))
    await supabase.from('assignments').insert(rows)
  }

  async function copyQuestions(fromId, toId) {
    setCopyStep('Menyalin bank soal...')
    const { data } = await supabase.from('questions').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('questions').insert(rows)
  }

  async function copyExams(fromId, toId) {
    setCopyStep('Menyalin struktur ujian...')
    const { data } = await supabase.from('exams').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({
      ...rest, course_id: toId,
      is_published: false,
      start_at: null, end_at: null,
    }))
    await supabase.from('exams').insert(rows)
  }

  async function copyForums(fromId, toId) {
    setCopyStep('Menyalin forum...')
    const { data } = await supabase.from('forums').select('*').eq('course_id', fromId)
    if (!data?.length) return
    const rows = data.map(({ id: _id, course_id: _c, created_at: _ca, updated_at: _ua, ...rest }) => ({ ...rest, course_id: toId }))
    await supabase.from('forums').insert(rows)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:520 }}>
        <div className="modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Copy size={15} color="var(--indigo-600)"/>
            <span className="modal-title">Salin Kursus</span>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} disabled={copying}><X size={14}/></button>
        </div>
        <div className="modal-body">
          <div style={{ background:'var(--gray-50)', borderRadius:10, padding:'10px 14px', marginBottom:16, border:'1px solid var(--gray-200)' }}>
            <div style={{ fontSize:11, color:'var(--gray-400)', fontWeight:600, marginBottom:3 }}>SUMBER KURSUS</div>
            <div style={{ fontWeight:700, fontSize:14 }}>{sumber?.name}</div>
            <div style={{ fontSize:12, color:'var(--gray-400)' }}>{sumber?.code} · {sumber?.semester} · {sumber?.credits} SKS</div>
          </div>

          <div className="input-group">
            <label className="input-label">Instruktur Pengampu Baru *</label>
            <select className="input" value={form.dosen_id} onChange={e => setForm(f => ({...f, dosen_id: e.target.value}))}>
              <option value="">— Pilih Instruktur —</option>
              {dosenList.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.email})</option>)}
            </select>
          </div>

          <div className="form-grid form-grid-2">
            <div className="input-group">
              <label className="input-label">Kode Kursus Baru *</label>
              <input className="input" placeholder="MIF123-COPY" value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))}/>
            </div>
            <div className="input-group">
              <label className="input-label">Semester Baru</label>
              <select className="input" value={form.semester} onChange={e => setForm(f => ({...f, semester: e.target.value}))}>
                {SEMESTERS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Nama Kursus Baru *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}/>
          </div>

          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--gray-600)', marginBottom:8 }}>Salin Konten Silabus:</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                { key:'materials',   label:'Materi & Modul',        desc:'Semua berkas lampiran materi per minggu' },
                { key:'assignments', label:'Tugas Praktik/Kelas',   desc:'Struktur tugas (deadline dikosongkan)' },
                { key:'questions',   label:'Bank Soal',              desc:'Semua soal pilihan ganda dari modul' },
                { key:'exams',       label:'Ujian',                  desc:'Struktur ujian (di-reset, belum dipublikasi)' },
                { key:'forums',      label:'Topik Forum Diskusi',    desc:'Thread forum baru (tanpa balasan diskusi)' },
              ].map(({ key, label, desc }) => (
                <div key={key}
                  onClick={() => !copying && setCopyOpts(o => ({...o, [key]: !o[key]}))}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8,
                    background: copyOpts[key] ? '#eef2ff' : 'var(--gray-50)',
                    border: `1px solid ${copyOpts[key] ? '#c7d2fe' : 'var(--gray-200)'}`,
                    cursor: copying ? 'default' : 'pointer', transition:'all .15s' }}
                >
                  {copyOpts[key]
                    ? <CheckCircle2 size={15} color="var(--indigo-600)" style={{ flexShrink:0 }}/>
                    : <Circle size={15} color="var(--gray-300)" style={{ flexShrink:0 }}/>}
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color: copyOpts[key] ? 'var(--indigo-700)' : 'var(--gray-700)' }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--gray-400)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {copying && copyStep && (
            <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:8, color:'var(--indigo-600)', fontSize:13 }}>
              <Loader2 size={14} style={{ animation:'spin .7s linear infinite', flexShrink:0 }}/>
              {copyStep}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={copying}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={salin} disabled={copying}
            style={{ display:'flex', alignItems:'center', gap:6 }}>
            {copying
              ? <><Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/> Menyalin...</>
              : <><Copy size={13}/> Salin Sekarang</>}
          </button>
        </div>
      </div>
    </div>
  )
}
