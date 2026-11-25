// Tab "Silabus & materi": daftar materi per modul, tambah/edit (ModalMateri), hapus,
// serta tombol ke generator slide AI dan laporan progres (ditangani halaman induk).
import { useState } from 'react'
import { Plus, Loader2, BookMarked, Bot, ExternalLink, ChevronDown, ChevronUp, BarChart3, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { groupMaterialsIntoModules } from '@/lib/modules'
import { typeOf } from './konstanta'
import ModalMateri from './ModalMateri'

/**
 * @param {object}   course      kursus terpilih (butuh id & cpmk)
 * @param {object[]} materials   materi kursus
 * @param {boolean}  loading     materi sedang dimuat
 * @param {Function} onBerubah   muat ulang materi setelah tambah/edit/hapus
 * @param {Function} onSlideAi   buka generator slide/soal AI untuk satu materi
 * @param {Function} onProgres   buka laporan progres peserta untuk satu materi
 */
export default function TabSilabus({ course, materials, loading, onBerubah, onSlideAi, onProgres }) {
  const { confirmDialog, showConfirm } = useConfirm()
  const [form, setForm] = useState(null) // null = tertutup; { materi: null } = tambah; { materi } = edit
  const [expandedModules, setExpandedModules] = useState({
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 99: true
  })

  async function hapus(id) {
    const ok = await showConfirm({
      title: 'Hapus Materi?',
      message: 'Materi dan semua file terkait akan dihapus. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('materials').delete().eq('id', id)
    if (error) {
      toast.error('Gagal menghapus: ' + error.message)
    } else {
      toast('Materi dihapus', { icon: '🗑️' })
      onBerubah?.()
    }
  }

  return (
    <>

      {/* Syllabus Area Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--gray-100)', paddingBottom: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookMarked size={16} color="var(--indigo-600)"/>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', margin: 0 }}>Silabus & Dokumen Materi</h3>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ materi: null })} style={{ gap: 6, fontSize: 12 }}>
          <Plus size={13}/> Tambah Materi
        </button>
      </div>

      {/* Materials List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 8 }}>
          <Loader2 size={24} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--indigo-600)' }} />
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Memuat materi silabus...</span>
        </div>
      ) : materials.length === 0 ? (
        <div className="empty-state card" style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--surface)', border: '2px dashed var(--gray-200)' }}>
          <BookMarked size={40} color="var(--gray-300)" style={{ marginBottom: 12 }} />
          <p className="empty-state-text" style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-600)', margin: 0 }}>Belum Ada Materi</p>
          <p className="empty-state-sub" style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4, marginBottom: 16 }}>Gunakan fitur AI RPS Assistant atau klik tombol di bawah untuk menambah materi silabus.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ materi: null })}><Plus size={13}/> Tambah Materi</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(100vh - 360px)', paddingRight: 4 }}>
          {groupMaterialsIntoModules(materials).map((mod) => {
            const isExpanded = !!expandedModules[mod.id]
            return (
              <div key={mod.id} className="card" style={{ flexShrink: 0, padding: 0, overflow: 'hidden', border: '1px solid var(--gray-200)', borderRadius: 10 }}>
                
                {/* Module Header Toggle */}
                <div 
                  onClick={() => setExpandedModules(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                  style={{ 
                    background: 'var(--gray-50)', 
                    padding: '12px 18px', 
                    borderBottom: isExpanded ? '1px solid var(--gray-200)' : 'none', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontWeight: 750, fontSize: 13, color: 'var(--indigo-700)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, 
                      height: 20, 
                      borderRadius: '50%', 
                      background: '#dcfce7', 
                      color: '#15803d', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      border: '1px solid #bbf7d0',
                      fontSize: 10,
                      fontWeight: 800
                    }}>
                      ✓
                    </div>
                    {mod.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="badge-pill badge-slate" style={{ fontSize: 10, padding: '2px 8px' }}>
                      {mod.items.length} Materi
                    </span>
                    {isExpanded ? <ChevronUp size={16} color="var(--gray-400)"/> : <ChevronDown size={16} color="var(--gray-400)"/>}
                  </div>
                </div>
                
                {/* Module Items (Collapsable) */}
                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mod.items.sort((a,b) => (a.week_number || 0) - (b.week_number || 0)).map((m, idx) => {
                      const links = (m.attachments && m.attachments.length)
                        ? m.attachments
                        : m.webview_link ? [{ mime: m.mime_type, url: m.webview_link, label: '' }]
                        : []
                        
                      const isExam = m.week_number === 8 || m.week_number === 16

                      return (
                        <div key={m.id} style={{
                          padding: '14px 18px',
                          borderTop: idx > 0 ? '1px solid var(--gray-100)' : 'none',
                          transition: 'background 0.2s',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 16
                        }}>
                          <div style={{
                            fontSize: 11, 
                            fontWeight: 800, 
                            color: 'var(--gray-400)', 
                            marginTop: 2, 
                            width: 32, 
                            textAlign: 'right', 
                            flexShrink: 0 
                          }}>
                            {m.week_number === 0 ? 'P' : `${m.week_number}.0`}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-900)' }}>{m.title}</div>
                            {m.description && (
                              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.4 }}>
                                {m.description}
                              </div>
                            )}
                            
                            {/* AI slide availability */}
                            {(m.slide_content || m.webslide_content) && (
                              <div style={{ marginTop: 8, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--indigo-700)', fontWeight: 600 }}>
                                <Bot size={11} color="var(--indigo-600)" /> 
                                Slide AI Tersedia!
                                {m.webslide_content && <span style={{ color: '#10b981' }}>(WebSlide Aktif)</span>}
                              </div>
                            )}

                            {/* Attachment chips */}
                            {links.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                {links.map((a, ai) => {
                                  const t = typeOf(a.mime)
                                  return (
                                    <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                        borderRadius: 20, fontSize: 11, fontWeight: 600, textDecoration: 'none',
                                        color: t.color, background: t.bg, border: `1px solid ${t.color}25`,
                                        cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                    >
                                      <span style={{ fontSize: 12 }}>{t.icon}</span>
                                      {a.label || t.label}
                                      <ExternalLink size={10} style={{ opacity: 0.7 }}/>
                                    </a>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          
                          {/* Slide Generator Actions */}
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => onSlideAi(m)}
                              style={{
                                gap: 4,
                                fontSize: 11,
                                padding: '4px 8px',
                                borderColor: 'var(--indigo-300)',
                                background: '#f8f8ff',
                                color: 'var(--indigo-700)'
                              }}
                            >
                              <Bot size={12} color="var(--indigo-600)" />
                              {isExam ? 'Soal AI' : 'Slide AI'}
                            </button>
                            {m.webslide_content?.slides?.length > 0 && (
                              <button className="btn btn-secondary btn-sm" onClick={() => onProgres(m)} title="Progres peserta: waktu baca, soal video, latihan"
                                style={{ gap: 4, fontSize: 11, padding: '4px 8px' }}>
                                <BarChart3 size={12} /> Progres
                              </button>
                            )}
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setForm({ materi: m })} title="Edit"><Edit2 size={13}/></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => hapus(m.id)} title="Hapus"><Trash2 size={13}/></button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {form && (
        <ModalMateri
          course={course}
          materi={form.materi}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); onBerubah?.() }}
        />
      )}
      {confirmDialog}
    </>
  )
}
