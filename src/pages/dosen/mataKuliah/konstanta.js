
export const COLORS   = ['#4f46e5','#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

export const SEMESTERS = ['Ganjil 2025/2026','Genap 2025/2026','Ganjil 2026/2027']



export const BLANK_COURSE_FORM = { code:'', name:'', description:'', credits:3, semester: SEMESTERS[0], cover_color:'#4f46e5', dosen_id:'', kompetensi_teks:'' }

/** "Excel, Word ,  PowerPoint" → ['Excel','Word','PowerPoint'] (maks. 6, tanpa duplikat). */
export const pecahKompetensi = (teks = '') =>
  [...new Set(String(teks).split(/[,;\n·]/).map((x) => x.trim()).filter(Boolean))].slice(0, 6)


// ── Attachment type definitions ────────────────────────────────
export const ATTACH_TYPES = [
  { id: 'drive',   label: 'Google Drive',   icon: '📁', color: '#4285f4', bg: '#e8f0fe', mime: 'application/vnd.google-apps.document', placeholder: 'https://drive.google.com/file/d/...' },
  { id: 'youtube', label: 'YouTube',         icon: '🎬', color: '#ff0000', bg: '#fff1f2', mime: 'video/youtube',                        placeholder: 'https://www.youtube.com/watch?v=...' },
  { id: 'pdf',     label: 'PDF / Dokumen',   icon: '📄', color: '#ef4444', bg: '#fef2f2', mime: 'application/pdf',                      placeholder: 'https://example.com/file.pdf' },
  { id: 'web',     label: 'Artikel / Web',   icon: '🌐', color: '#10b981', bg: '#f0fdf4', mime: 'text/html',                            placeholder: 'https://...' },
]


export const BLANK_ATTACH = () => ({ mime: ATTACH_TYPES[0].mime, url: '', label: '' })

export const BLANK_MATERIAL_FORM = () => ({ title: '', description: '', week_number: 1, attachments: [BLANK_ATTACH()], estimasi_menit: null, jenis_aktivitas: null, cpmk_kode: [] })


export function typeOf(mime) { return ATTACH_TYPES.find(t => t.mime === mime) || ATTACH_TYPES[3] }


export function extractYouTubeId(url = '') {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}
