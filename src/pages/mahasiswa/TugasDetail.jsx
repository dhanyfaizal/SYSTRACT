import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Eye, CheckCircle2, Link2, Info } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useMuatData } from '@/hooks/useMuatData'
import toast from 'react-hot-toast'

function fileInfo(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf')                         return { icon:'📄', color:'#ef4444' }
  if (['doc','docx'].includes(ext))          return { icon:'📝', color:'#2563eb' }
  if (['xls','xlsx'].includes(ext))          return { icon:'📊', color:'#16a34a' }
  if (['ppt','pptx'].includes(ext))          return { icon:'📑', color:'#d97706' }
  if (['jpg','jpeg','png','gif'].includes(ext)) return { icon:'🖼️', color:'#7c3aed' }
  if (['zip','rar','7z'].includes(ext))      return { icon:'📦', color:'#6b7280' }
  return { icon:'🔗', color:'#4285f4' }
}

// Tugas dan pengumpulan milik peserta ini.
async function muatTugas(id, userId) {
  const [{ data: assignment }, { data: submission }] = await Promise.all([
    supabase.from('assignments').select('*, course:courses(name,code)').eq('id', id).single(),
    supabase.from('submissions').select('*').eq('assignment_id', id).eq('student_id', userId).maybeSingle(),
  ])
  return { assignment, submission }
}

export default function TugasDetail() {
  const { id }   = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const tugas = useMuatData(user ? `${id}:${user.id}` : null, () => muatTugas(id, user.id))
  const assignment = tugas.data?.assignment ?? null
  const submission = tugas.data?.submission ?? null
  const loading = !user || tugas.loading
  const fetchData = tugas.muatUlang
  const [submitting, setSubmitting] = useState(false)

  const [linkUrl,  setLinkUrl]  = useState('')
  const [linkName, setLinkName] = useState('')

  async function handleSubmit() {
    if (!linkUrl.trim()) { toast.error('Masukkan link Google Drive terlebih dahulu'); return }
    setSubmitting(true)
    try {
      const payload = {
        assignment_id: id,
        student_id:    user.id,
        webview_link:  linkUrl.trim(),
        file_name:     linkName.trim() || 'File Tugas',
        status:        'submitted',
        submitted_at:  new Date().toISOString(),
      }
      if (submission) {
        await supabase.from('submissions').update(payload).eq('id', submission.id)
      } else {
        await supabase.from('submissions').insert(payload)
      }
      toast.success('Tugas berhasil dikumpulkan! 🎉')
      setLinkUrl(''); setLinkName('')
      fetchData()
    } catch (err) {
      toast.error('Gagal mengumpulkan: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}><div className="spinner"/></div>
  if (!assignment) return <div className="empty-state"><p>Tugas tidak ditemukan.</p></div>

  const due        = assignment.due_date ? new Date(assignment.due_date) : null
  const overdue    = due && due < new Date()
  const isGraded   = submission?.status === 'graded'
  const isRevision = submission?.status === 'revision'
  const fi         = fileInfo(submission?.file_name || '')
  const showForm   = !isGraded && (!overdue || assignment.allow_late_submission || isRevision)

  return (
    <div style={{ maxWidth:740, margin:'0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom:16 }}>
        <ArrowLeft size={14}/> Kembali
      </button>

      {/* ── Assignment info ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header">
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase' }}>
              {assignment.course?.code} · {assignment.course?.name}
            </div>
            <h1 style={{ fontSize:18, fontWeight:800, color:'var(--gray-900)', marginTop:2 }}>{assignment.title}</h1>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:12, color: overdue ? 'var(--danger)' : 'var(--gray-500)' }}>
              {due ? `📅 ${due.toLocaleString('id-ID', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}` : 'Tidak ada deadline'}
            </div>
            <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>Nilai maks: {assignment.max_score}</div>
          </div>
        </div>
        <div className="card-body">
          {assignment.description && (
            <p style={{ fontSize:13, color:'var(--gray-600)', lineHeight:1.7, marginBottom: assignment.rubric?.criteria ? 16 : 0 }}>
              {assignment.description}
            </p>
          )}
          {assignment.rubric?.criteria && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--gray-700)', marginBottom:8 }}>Rubrik Penilaian:</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {assignment.rubric.criteria.map((c, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--gray-50)', borderRadius:6 }}>
                    <div style={{ flex:1, fontSize:12 }}><strong>{c.name}</strong>{c.description ? ` — ${c.description}` : ''}</div>
                    <span className="badge-pill badge-indigo">{c.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Submission card ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <strong style={{ fontSize:14 }}>Pengumpulan Tugas</strong>
          {submission && (
            <span className={`badge-pill ${isGraded ? 'badge-green' : isRevision ? 'badge-amber' : submission.status==='submitted' ? 'badge-indigo' : 'badge-slate'}`}>
              {isGraded ? '✓ Sudah Dinilai' : isRevision ? '↩ Perlu Revisi' : '📨 Dikumpulkan'}
            </span>
          )}
        </div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Current submission */}
          {submission?.webview_link && (
            <div style={{ background:'var(--gray-50)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--gray-200)' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase', marginBottom:8 }}>
                File yang dikumpulkan
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:22 }}>{fi.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{submission.file_name}</div>
                  <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:1 }}>{new Date(submission.submitted_at).toLocaleString('id-ID')}</div>
                </div>
                <a href={submission.webview_link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ gap:4 }}>
                  <Eye size={12}/> Lihat
                </a>
              </div>
            </div>
          )}

          {/* Grade & feedback */}
          {isGraded && (
            <div style={{ background:'linear-gradient(135deg,#eef2ff,#f0fdf4)', border:'1px solid #c7d2fe', borderRadius:10, padding:'16px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: submission.feedback ? 10 : 0 }}>
                <CheckCircle2 size={20} color="#16a34a"/>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--gray-800)' }}>
                  Nilai: <span style={{ fontSize:22, color:'#4f46e5' }}>{submission.grade}</span>
                  <span style={{ fontSize:13, color:'var(--gray-400)' }}> / {assignment.max_score}</span>
                </div>
              </div>
              {submission.feedback && (
                <div style={{ fontSize:12, color:'var(--gray-700)', lineHeight:1.7, background:'#fff', borderRadius:8, padding:'10px 12px', border:'1px solid var(--gray-200)' }}>
                  <strong>💬 Feedback Dosen:</strong><br/>{submission.feedback}
                </div>
              )}
            </div>
          )}

          {/* Revision alert */}
          {isRevision && (
            <div style={{ background:'#fff7ed', border:'1.5px solid #fed7aa', borderRadius:10, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: submission.feedback ? 10 : 0 }}>
                <span style={{ fontSize:20 }}>↩</span>
                <div style={{ fontWeight:700, fontSize:13, color:'#c2410c' }}>Dosen meminta revisi</div>
              </div>
              {submission.feedback && (
                <div style={{ fontSize:12, color:'#9a3412', lineHeight:1.7, background:'#ffedd5', borderRadius:8, padding:'10px 12px', border:'1px solid #fed7aa' }}>
                  <strong>📝 Catatan Revisi:</strong><br/>{submission.feedback}
                </div>
              )}
              <div style={{ fontSize:11, color:'#ea580c', marginTop:10, fontWeight:600 }}>⬇ Perbaiki file Anda dan kumpulkan ulang di bawah</div>
            </div>
          )}

          {/* Link form */}
          {showForm && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--gray-600)' }}>
                {submission ? '🔄 Perbarui link file:' : '🔗 Tempel link Google Drive:'}
              </div>

              <div className="input-group" style={{ marginBottom:0 }}>
                <label className="input-label">Link Google Drive *</label>
                <div style={{ position:'relative' }}>
                  <Link2 size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }}/>
                  <input
                    className="input"
                    style={{ paddingLeft:34 }}
                    placeholder="https://drive.google.com/file/d/..."
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group" style={{ marginBottom:0 }}>
                <label className="input-label">Nama File <span style={{ fontWeight:400, color:'var(--gray-400)' }}>(opsional)</span></label>
                <input
                  className="input"
                  placeholder="cth: Laporan_Praktikum_Dhany.pdf"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Overdue */}
          {overdue && !assignment.allow_late_submission && !submission && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#991b1b' }}>
              ⚠️ Deadline telah berakhir dan pengumpulan terlambat tidak diizinkan.
            </div>
          )}
        </div>

        {!isGraded && !(overdue && !assignment.allow_late_submission) && (
          <div className="card-footer" style={{ justifyContent:'flex-end', display:'flex' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !linkUrl.trim()}>
              {submitting ? <Loader2 size={14} style={{ animation:'spin .7s linear infinite' }}/> : <Send size={14}/>}
              {submission ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}
            </button>
          </div>
        )}
      </div>

      {/* ── Panduan share Google Drive ── */}
      <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:'16px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Info size={16} color="#2563eb"/>
          <span style={{ fontWeight:700, fontSize:13, color:'#1e40af' }}>Cara berbagi file Google Drive dengan benar</span>
        </div>
        <ol style={{ margin:0, paddingLeft:18, display:'flex', flexDirection:'column', gap:10 }}>
          <li style={{ fontSize:12, color:'#1e3a8a', lineHeight:1.7 }}>
            Buka file Anda di <strong>Google Drive</strong>, klik kanan → <strong>"Bagikan"</strong> (atau ikon 🔗 di pojok kanan atas)
          </li>
          <li style={{ fontSize:12, color:'#1e3a8a', lineHeight:1.7 }}>
            Di bagian <strong>"Akses Umum"</strong>, ubah dari <em>"Terbatas"</em> menjadi{' '}
            <span style={{ background:'#dbeafe', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>Anyone with the link</span>
          </li>
          <li style={{ fontSize:12, color:'#1e3a8a', lineHeight:1.7 }}>
            Pastikan peran diset ke{' '}
            <span style={{ background:'#dcfce7', padding:'1px 6px', borderRadius:4, fontWeight:700, color:'#166534' }}>Viewer</span>{' '}
            — dosen hanya perlu melihat, bukan mengedit
          </li>
          <li style={{ fontSize:12, color:'#1e3a8a', lineHeight:1.7 }}>
            Klik <strong>"Salin link"</strong>, lalu tempel di kolom <em>"Link Google Drive"</em> di atas
          </li>
        </ol>
        <div style={{ marginTop:12, padding:'8px 12px', background:'#fef9c3', borderRadius:8, border:'1px solid #fde68a', fontSize:11, color:'#92400e', display:'flex', gap:6 }}>
          ⚠️ <span>Jika link tidak diset <strong>"Anyone with the link"</strong>, dosen tidak akan bisa membuka file Anda dan tugas dianggap tidak valid.</span>
        </div>
      </div>
    </div>
  )
}
