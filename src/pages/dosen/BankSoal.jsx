import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import CoursePicker from "@/components/dosen/CoursePicker"
import { Database, Plus, Edit2, Trash2, X, Loader2, ChevronDown, Search, Upload, FileDown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/withRetry'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const DIFFICULTIES = [
  { value: 'mudah',  label: 'Mudah',  bg: '#dcfce7', color: '#16a34a' },
  { value: 'sedang', label: 'Sedang', bg: '#fef9c3', color: '#ca8a04' },
  { value: 'sulit',  label: 'Sulit',  bg: '#fee2e2', color: '#dc2626' },
]

const LETTERS = ['A','B','C','D','E']

const BLANK_FORM = {
  question_text: '', difficulty: 'sedang', category: '',
  options: ['','','','',''], correct_answer: 0, explanation: '',
}

function DiffBadge({ value }) {
  const d = DIFFICULTIES.find(x => x.value === value) || DIFFICULTIES[1]
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:d.bg, color:d.color }}>
      {d.label}
    </span>
  )
}

export default function BankSoal() {
  const { user } = useAuth()
  const { confirmDialog, showConfirm } = useConfirm()
  const [searchParams] = useSearchParams()
  const [courses,   setCourses]   = useState([])
  const [courseId,  setCourseId]  = useState('')
  const [questions, setQuestions] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState(BLANK_FORM)
  const [filterDiff,   setFilterDiff]   = useState('all')
  const [search,       setSearch]       = useState('')
  const [importModal,  setImportModal]  = useState(false)
  const [importRows,   setImportRows]   = useState([])   // parsed preview rows
  const [importErrors, setImportErrors] = useState([])   // per-row errors
  const [importing,    setImporting]    = useState(false)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [expandedIds,   setExpandedIds]   = useState(new Set())
  const [collapsedTopics, setCollapsedTopics] = useState(new Set())
  const [editingTopic,  setEditingTopic]  = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { if (user) fetchCourses() }, [user])
  useEffect(() => { if (courseId) fetchQuestions() }, [courseId])

  async function fetchCourses() {
    const { data } = await supabase.from('courses').select('id,code,name').eq('dosen_id', user.id).order('name')
    setCourses(data || [])
    const paramId = searchParams.get('courseId')
    const match   = paramId && data?.find(c => c.id === paramId)
    setCourseId(match ? paramId : (data?.[0]?.id || ''))
  }

  async function fetchQuestions() {
    setLoading(true)
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('course_id', courseId)
      .order('category', { ascending: true })
      .order('created_at', { ascending: true })
    setQuestions(data || [])
    setLoading(false)
  }

  function openNew() { setForm(BLANK_FORM); setEditing(null); setModal(true) }
  function openEdit(q) {
    setForm({
      question_text: q.question_text, difficulty: q.difficulty,
      category: q.category || '', explanation: q.explanation || '',
      options: q.options?.length === 5 ? [...q.options] : [...q.options, ...Array(5-q.options.length).fill('')],
      correct_answer: q.correct_answer,
    })
    setEditing(q.id); setModal(true)
  }

  function setOption(i, val) {
    setForm(f => { const o = [...f.options]; o[i] = val; return { ...f, options: o } })
  }

  async function handleSave() {
    if (!form.question_text.trim())            { toast.error('Teks soal wajib diisi'); return }
    if (form.options.some(o => !o.trim()))     { toast.error('Semua 5 pilihan jawaban wajib diisi'); return }
    setSaving(true)
    const payload = {
      course_id: courseId, created_by: user.id,
      question_text: form.question_text.trim(),
      difficulty: form.difficulty,
      category: form.category.trim() || null,
      options: form.options.map(o => o.trim()),
      correct_answer: form.correct_answer,
      explanation: form.explanation.trim() || null,
    }
    const { error } = await withRetry(() =>
      editing
        ? supabase.from('questions').update(payload).eq('id', editing)
        : supabase.from('questions').insert(payload)
    )
    if (error) toast.error('Gagal menyimpan: ' + error.message)
    else { toast.success(editing ? 'Soal diperbarui' : 'Soal ditambahkan'); setModal(false); fetchQuestions() }
    setSaving(false)
  }

  /* ── CSV helpers ─────────────────────────────────────────────── */
  function downloadTemplate() {
    const header = 'question_text,difficulty,topik,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation'
    const samples = [
      '"Apa kepanjangan dari CPU?",mudah,Bab 1 - Pengantar,"Central Processing Unit","Control Processing Unit","Core Processing Unit","Central Program Unit","Computer Processing Unit",A,"CPU adalah otak komputer"',
      '"Berapa jumlah bit dalam 1 byte?",mudah,Bab 1 - Pengantar,4,8,16,32,64,B,""',
      '"Apa yang dimaksud dengan paging?",sedang,Bab 2 - Manajemen Memori,"Membagi proses menjadi bagian sama besar","Menggabungkan memori fisik","Alokasi memori berurutan","Kompresi data di memori","Enkripsi memori",A,""',
      '"Algoritma penjadwalan mana yang bersifat preemptive?",sulit,Bab 3 - Penjadwalan,FCFS,SJF,"Round Robin",Priority,"Shortest Job Next",C,"Round Robin menggunakan time quantum"',
    ]
    const csv = header + '\n' + samples.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'template_bank_soal.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function parseCSVLine(line) {
    const result = []; let cur = ''; let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    result.push(cur.trim())
    return result
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim())
      // Detect columns from header row
      const headerCols = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
      const col = name => headerCols.indexOf(name)
      // Support both new 'topik' and old 'category' header
      const topikCol = col('topik') !== -1 ? col('topik') : col('category')
      const isNewFormat = col('question_text') !== -1  // named columns
      const rows = []; const errors = []
      lines.slice(1).forEach((line, idx) => {
        const parts = parseCSVLine(line)
        const get = i => (parts[i] || '').trim()
        let qt, diff, topik, oa, ob, oc, od, oe, ans, expl
        if (isNewFormat) {
          qt    = get(col('question_text'))
          diff  = get(col('difficulty'))
          topik = topikCol !== -1 ? get(topikCol) : ''
          oa = get(col('option_a')); ob = get(col('option_b')); oc = get(col('option_c'))
          od = get(col('option_d')); oe = get(col('option_e'))
          ans  = get(col('correct_answer'))
          expl = col('explanation') !== -1 ? get(col('explanation')) : ''
        } else {
          // positional fallback
          ;[qt, diff, topik, oa, ob, oc, od, oe, ans, expl] = parts.map(p => (p||'').trim())
        }
        const rowNum = idx + 2
        const rowErrors = []
        if (!qt)    rowErrors.push('Teks soal kosong')
        if (!['mudah','sedang','sulit'].includes((diff||'').toLowerCase())) rowErrors.push('Kesulitan harus: mudah/sedang/sulit')
        if (!topik) rowErrors.push('Topik wajib diisi')
        const letter = (ans||'').toUpperCase()
        if (!['A','B','C','D','E'].includes(letter)) rowErrors.push('Jawaban benar harus A/B/C/D/E')
        if ([oa,ob,oc,od,oe].some(o => !(o||'').trim())) rowErrors.push('Semua 5 pilihan harus diisi')
        if (rowErrors.length) { errors.push({ row: rowNum, msg: rowErrors.join(', ') }); return }
        rows.push({
          question_text: qt,
          difficulty: diff.toLowerCase(),
          category: topik,        // stored as 'category' in DB
          options: [oa,ob,oc,od,oe].map(o => o.trim()),
          correct_answer: ['A','B','C','D','E'].indexOf(letter),
          explanation: expl || null,
        })
      })
      setImportRows(rows); setImportErrors(errors); setImportModal(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!importRows.length) return
    setImporting(true)
    const payload = importRows.map(r => ({ ...r, course_id: courseId, created_by: user.id }))
    const { error } = await supabase.from('questions').insert(payload)
    if (error) toast.error('Gagal import: ' + error.message)
    else { toast.success(`${importRows.length} soal berhasil diimport!`); setImportModal(false); fetchQuestions() }
    setImporting(false)
  }

  async function handleDelete(id) {
    const ok = await showConfirm({
      title: 'Hapus Soal?',
      message: 'Soal ini akan dihapus dari bank soal secara permanen.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('questions').delete().eq('id', id)
    toast('Soal dihapus', { icon: '🗑️' })
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    fetchQuestions()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)))
    }
  }

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  async function handleBulkDelete() {
    if (!selectedIds.size) return
    const ok = await showConfirm({
      title: `Hapus ${selectedIds.size} Soal?`,
      message: `${selectedIds.size} soal yang dipilih akan dihapus permanen dari bank soal. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Ya, Hapus Semua',
      variant: 'danger',
    })
    if (!ok) return
    const ids = [...selectedIds]
    const { error } = await supabase.from('questions').delete().in('id', ids)
    if (error) { toast.error('Gagal menghapus: ' + error.message); return }
    toast.success(`${ids.length} soal berhasil dihapus`, { icon: '🗑️' })
    setSelectedIds(new Set())
    fetchQuestions()
  }

  function toggleCollapse(topic) {
    setCollapsedTopics(prev => {
      const s = new Set(prev)
      s.has(topic) ? s.delete(topic) : s.add(topic)
      return s
    })
  }

  async function renameTopic(oldName, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setEditingTopic(null); return }
    // Update all questions in this topic
    const ids = questions.filter(q => (q.category || '(Tanpa Topik)') === oldName).map(q => q.id)
    if (!ids.length) { setEditingTopic(null); return }
    const { error } = await supabase.from('questions').update({ category: trimmed }).in('id', ids)
    if (error) { toast.error('Gagal mengganti nama topik'); return }
    toast.success(`Topik diubah: "${oldName}" → "${trimmed}"`)
    setEditingTopic(null)
    fetchQuestions()
  }

  const filtered = questions.filter(q => {
    if (filterDiff !== 'all' && q.difficulty !== filterDiff) return false
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase()) &&
        !q.category?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    all:    questions.length,
    mudah:  questions.filter(q => q.difficulty === 'mudah').length,
    sedang: questions.filter(q => q.difficulty === 'sedang').length,
    sulit:  questions.filter(q => q.difficulty === 'sulit').length,
  }


  return (
    <>
    {confirmDialog}
    <div>
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Bank Soal</h1>
          <p className="page-subtitle">Kelola soal pilihan ganda per mata kuliah</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate} style={{ gap:4 }}>
            <FileDown size={14}/> Download Template
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={!courseId} style={{ gap:4 }}>
            <Upload size={14}/> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleFileChange}/>
          <button className="btn btn-primary" onClick={openNew} disabled={!courseId}>
            <Plus size={14}/> Tambah Soal
          </button>
        </div>
      </div>

      <CoursePicker courses={courses} courseId={courseId} onChange={setCourseId} />


      {/* Stats + filter */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        {[
          { key:'all',    label:`Semua (${counts.all})`,       bg:'var(--indigo-100)', color:'var(--indigo-700)' },
          { key:'mudah',  label:`Mudah (${counts.mudah})`,     bg:'#dcfce7', color:'#16a34a' },
          { key:'sedang', label:`Sedang (${counts.sedang})`,   bg:'#fef9c3', color:'#ca8a04' },
          { key:'sulit',  label:`Sulit (${counts.sulit})`,     bg:'#fee2e2', color:'#dc2626' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterDiff(f.key)}
            style={{ fontSize:12, fontWeight:700, padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer',
              background: filterDiff===f.key ? f.color : f.bg,
              color:      filterDiff===f.key ? '#fff'  : f.color,
              transition:'all .15s',
            }}>{f.label}</button>
        ))}
        <div style={{ position:'relative', marginLeft:'auto' }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--gray-400)' }}/>
          <input className="input" style={{ paddingLeft:28, fontSize:12, width:220 }} placeholder="Cari soal atau topik..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Bulk action bar — shown when items selected */}
      {selectedIds.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'#1e1b4b', borderRadius:10, padding:'10px 16px', marginBottom:12 }}>
          <input type="checkbox" checked={selectedIds.size === filtered.length} onChange={toggleAll}
            style={{ width:16, height:16, accentColor:'#818cf8', cursor:'pointer' }}/>
          <span style={{ fontSize:13, color:'#c7d2fe', fontWeight:600 }}>{selectedIds.size} soal dipilih</span>
          <button onClick={() => setSelectedIds(new Set())} style={{ fontSize:12, color:'#a5b4fc', background:'none', border:'none', cursor:'pointer', padding:'2px 8px' }}>Batalkan</button>
          <button onClick={handleBulkDelete}
            style={{ marginLeft:'auto', fontSize:12, fontWeight:700, background:'#dc2626', color:'#fff', border:'none', borderRadius:8, padding:'7px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <Trash2 size={13}/> Hapus {selectedIds.size} Soal
          </button>
        </div>
      )}

      {/* Select-all row — shown when list has items and nothing selected */}
      {filtered.length > 0 && selectedIds.size === 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'0 4px' }}>
          <input type="checkbox" onChange={toggleAll} checked={false}
            style={{ width:15, height:15, accentColor:'var(--indigo-600)', cursor:'pointer' }}/>
          <span style={{ fontSize:12, color:'var(--gray-400)', cursor:'pointer' }} onClick={toggleAll}>Pilih semua ({filtered.length} soal)</span>
        </div>
      )}

      {/* Question list grouped by topic */}
      {loading ? <div className="spinner" style={{ margin:'40px auto' }}/> :
       filtered.length === 0 ? (
        <div className="empty-state card" style={{ padding:48 }}>
          <Database size={36} color="var(--gray-300)"/>
          <p className="empty-state-text">{questions.length === 0 ? 'Belum ada soal di bank soal' : 'Tidak ada soal yang cocok'}</p>
          {questions.length === 0 && <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={13}/> Tambah Soal Pertama</button>}
        </div>
       ) : (() => {
         // Group by topic
         const topicMap = {}
         filtered.forEach(q => {
           const t = q.category || '(Tanpa Topik)'
           if (!topicMap[t]) topicMap[t] = []
           topicMap[t].push(q)
         })
         const topicOrder = Object.keys(topicMap).sort()
         return (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {topicOrder.map(topic => (
              <div key={topic} className="card" style={{ padding:0, overflow:'hidden' }}>
                {/* Topic header — click to collapse */}
                <div
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:'#eef2ff', borderBottom: collapsedTopics.has(topic) ? 'none' : '1px solid #c7d2fe', cursor:'pointer', userSelect:'none' }}
                  onClick={() => toggleCollapse(topic)}
                >
                  {/* Collapse chevron */}
                  <ChevronDown size={14} style={{ color:'var(--indigo-400)', flexShrink:0, transform: collapsedTopics.has(topic) ? 'rotate(-90deg)' : 'none', transition:'transform .2s' }}/>

                  {/* Topic name — inline edit */}
                  {editingTopic?.old === topic ? (
                    <input
                      autoFocus
                      value={editingTopic.draft}
                      onChange={e => setEditingTopic(et => ({ ...et, draft: e.target.value }))}
                      onBlur={() => renameTopic(topic, editingTopic.draft)}
                      onKeyDown={e => { if (e.key==='Enter') renameTopic(topic, editingTopic.draft); if (e.key==='Escape') setEditingTopic(null) }}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)', border:'1px solid #a5b4fc', borderRadius:6, padding:'2px 8px', background:'#fff', outline:'none', width:240 }}
                    />
                  ) : (
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--indigo-700)' }}>{topic}</span>
                  )}

                  <span style={{ fontSize:11, color:'var(--indigo-400)', fontWeight:500 }}>{topicMap[topic].length} soal</span>

                  {/* Edit topic name button */}
                  <button
                    onClick={e => { e.stopPropagation(); setEditingTopic({ old: topic, draft: topic }) }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--indigo-400)', padding:'2px 4px', borderRadius:4, display:'flex', alignItems:'center' }}
                    title="Ganti nama topik"
                  >
                    <Edit2 size={11}/>
                  </button>

                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    {['mudah','sedang','sulit'].map(d => {
                      const n = topicMap[topic].filter(q => q.difficulty===d).length
                      if (!n) return null
                      const c = d==='mudah'?'#16a34a':d==='sedang'?'#ca8a04':'#dc2626'
                      const bg = d==='mudah'?'#dcfce7':d==='sedang'?'#fef9c3':'#fee2e2'
                      return <span key={d} style={{ fontSize:10, fontWeight:700, color:c, background:bg, padding:'2px 8px', borderRadius:20 }}>{n} {d}</span>
                    })}
                  </div>
                </div>
                {/* Compact question rows — hidden when collapsed */}
                {!collapsedTopics.has(topic) && (<div>
                  {topicMap[topic].map((q, i) => {
                    const isExp = expandedIds.has(q.id)
                    const isSel = selectedIds.has(q.id)
                    const correctLetter = LETTERS[q.correct_answer]
                    return (
                      <div key={q.id} style={{ borderBottom:'1px solid var(--gray-100)', background: isSel ? '#f5f3ff' : '' }}>
                        {/* Compact row */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', cursor:'pointer' }}
                          onClick={() => toggleExpand(q.id)}>
                          <input type="checkbox" checked={isSel}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelect(q.id)}
                            style={{ width:15, height:15, accentColor:'var(--indigo-600)', cursor:'pointer', flexShrink:0 }}/>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--gray-400)', width:22, flexShrink:0, textAlign:'center' }}>{i+1}</span>
                          <DiffBadge value={q.difficulty}/>
                          <span style={{ flex:1, fontSize:13, color:'var(--gray-800)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
                            {q.question_text}
                          </span>
                          <span style={{ fontSize:11, fontWeight:800, color:'#16a34a', background:'#dcfce7', border:'1px solid #86efac', borderRadius:6, padding:'2px 8px', flexShrink:0 }}>
                            ✓ {correctLetter}
                          </span>
                          <div style={{ display:'flex', gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(q)} title="Edit"><Edit2 size={12}/></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)' }} onClick={() => handleDelete(q.id)} title="Hapus"><Trash2 size={12}/></button>
                          </div>
                          <ChevronDown size={13} style={{ color:'var(--gray-300)', flexShrink:0, transform: isExp ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}/>
                        </div>
                        {/* Expanded detail */}
                        {isExp && (
                          <div style={{ padding:'12px 16px 14px 64px', background:'var(--gray-50)', borderTop:'1px solid var(--gray-100)' }}>
                            <p style={{ fontSize:13, fontWeight:600, color:'var(--gray-800)', marginBottom:10, lineHeight:1.7 }}>{q.question_text}</p>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px', marginBottom: q.explanation ? 10 : 0 }}>
                              {q.options?.map((opt, oi) => (
                                <div key={oi} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'5px 10px', borderRadius:8,
                                  background: oi===q.correct_answer ? '#dcfce7' : '#fff',
                                  border: oi===q.correct_answer ? '1px solid #86efac' : '1px solid var(--gray-200)' }}>
                                  <span style={{ fontWeight:800, fontSize:12, color: oi===q.correct_answer ? '#16a34a' : 'var(--gray-400)', flexShrink:0 }}>{LETTERS[oi]}.</span>
                                  <span style={{ fontSize:12, color: oi===q.correct_answer ? '#15803d' : 'var(--gray-700)' }}>{opt}</span>
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <div style={{ fontSize:11, color:'var(--gray-500)', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'6px 10px', marginTop:8 }}>
                                <strong style={{ color:'#92400e' }}>Penjelasan:</strong> {q.explanation}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                    })}
                </div>)}
              </div>
            ))}
          </div>
         )
       })()}


      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:640, width:'95vw' }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Database size={16} color="var(--indigo-600)"/>
                <span className="modal-title">{editing ? 'Edit' : 'Tambah'} Soal</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ maxHeight:'75vh', overflowY:'auto' }}>

              {/* Question text */}
              <div className="input-group">
                <label className="input-label">Teks Soal *</label>
                <textarea className="input" rows={3} style={{ resize:'vertical' }}
                  placeholder="Tuliskan pertanyaan di sini..."
                  value={form.question_text}
                  onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}/>
              </div>

              {/* Difficulty + Category */}
              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label">Tingkat Kesulitan</label>
                  <div style={{ display:'flex', gap:6 }}>
                    {DIFFICULTIES.map(d => (
                      <button key={d.value} type="button" onClick={() => setForm(f => ({ ...f, difficulty: d.value }))}
                        style={{ flex:1, padding:'7px 4px', borderRadius:8, border:`2px solid ${form.difficulty===d.value ? d.color : 'var(--gray-200)'}`,
                          background: form.difficulty===d.value ? d.bg : '#fff', color: d.color, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Topik <span style={{ fontWeight:400, color:'var(--gray-400)' }}>(wajib — digunakan saat membuat ujian)</span></label>
                  <input className="input" placeholder="cth: Bab 1, Manajemen Proses..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}/>
                </div>
              </div>

              {/* Options */}
              <div className="input-group">
                <label className="input-label">Pilihan Jawaban * <span style={{ fontWeight:400, color:'var(--gray-400)' }}>(pilih jawaban yang benar)</span></label>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {form.options.map((opt, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {/* Correct answer radio */}
                      <button type="button" onClick={() => setForm(f => ({ ...f, correct_answer: i }))}
                        style={{ width:28, height:28, borderRadius:'50%', border:`2px solid ${form.correct_answer===i ? 'var(--indigo-600)' : 'var(--gray-300)'}`,
                          background: form.correct_answer===i ? 'var(--indigo-600)' : '#fff',
                          color: form.correct_answer===i ? '#fff' : 'var(--gray-400)',
                          fontSize:12, fontWeight:800, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {LETTERS[i]}
                      </button>
                      <input className="input" placeholder={`Pilihan ${LETTERS[i]}...`} value={opt}
                        onChange={e => setOption(i, e.target.value)}
                        style={{ border: form.correct_answer===i ? '1.5px solid var(--indigo-400)' : '', background: form.correct_answer===i ? 'var(--indigo-50)' : '' }}/>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:6 }}>
                  Klik huruf di sebelah kiri untuk menandai jawaban yang benar (saat ini: <strong>{LETTERS[form.correct_answer]}</strong>)
                </div>
              </div>

              {/* Explanation */}
              <div className="input-group" style={{ marginBottom:0 }}>
                <label className="input-label">Penjelasan <span style={{ fontWeight:400, color:'var(--gray-400)' }}>(opsional, ditampilkan setelah ujian)</span></label>
                <textarea className="input" rows={2} style={{ resize:'vertical' }}
                  placeholder="Jelaskan mengapa jawaban ini benar..."
                  value={form.explanation}
                  onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/>}
                {editing ? 'Simpan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Preview Modal ── */}
      {importModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:820, width:'96vw' }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Upload size={16} color="var(--indigo-600)"/>
                <span className="modal-title">Preview Import Soal</span>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setImportModal(false)}><X size={14}/></button>
            </div>
            <div className="modal-body" style={{ maxHeight:'65vh', overflowY:'auto' }}>
              {/* Summary */}
              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, background:'#dcfce7', color:'#16a34a', padding:'5px 12px', borderRadius:20 }}>
                  <CheckCircle2 size={13} style={{ display:'inline', marginRight:4 }}/>{importRows.length} soal valid
                </span>
                {importErrors.length > 0 && (
                  <span style={{ fontSize:13, fontWeight:700, background:'#fee2e2', color:'#dc2626', padding:'5px 12px', borderRadius:20 }}>
                    <AlertTriangle size={13} style={{ display:'inline', marginRight:4 }}/>{importErrors.length} baris error
                  </span>
                )}
              </div>

              {/* Errors */}
              {importErrors.length > 0 && (
                <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#dc2626', marginBottom:6 }}>Baris yang dilewati:</div>
                  {importErrors.map(e => (
                    <div key={e.row} style={{ fontSize:12, color:'#991b1b', marginBottom:3 }}>Baris {e.row}: {e.msg}</div>
                  ))}
                </div>
              )}

              {/* Preview table */}
              {importRows.length > 0 && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'var(--gray-50)', borderBottom:'2px solid var(--gray-200)' }}>
                        {['#','Soal','Kesulitan','Topik','A','B','C','D','E','Jwb'].map(h => (
                          <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'var(--gray-500)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid var(--gray-100)' }}>
                          <td style={{ padding:'8px 10px', color:'var(--gray-400)' }}>{i+1}</td>
                          <td style={{ padding:'8px 10px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.question_text}</td>
                          <td style={{ padding:'8px 10px' }}><DiffBadge value={r.difficulty}/></td>
                          <td style={{ padding:'8px 10px', color:'var(--gray-500)' }}>{r.category || '—'}</td>
                          {r.options.map((o,oi) => (
                            <td key={oi} style={{ padding:'8px 10px', color: oi===r.correct_answer ? '#16a34a' : 'var(--gray-600)', fontWeight: oi===r.correct_answer ? 700 : 400, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o}</td>
                          ))}
                          <td style={{ padding:'8px 10px', fontWeight:700, color:'var(--indigo-600)' }}>{LETTERS[r.correct_answer]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importRows.length === 0 && (
                <div style={{ textAlign:'center', padding:32, color:'var(--gray-400)' }}>Tidak ada baris valid yang bisa diimport.</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setImportModal(false)}>Batal</button>
              <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing || !importRows.length}>
                {importing && <Loader2 size={13} style={{ animation:'spin .7s linear infinite' }}/>}
                Import {importRows.length} Soal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
