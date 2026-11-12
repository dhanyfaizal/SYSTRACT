import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, BookOpen, ClipboardList, FileText, MessageSquare, Megaphone, X, Command } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const TYPE_CONFIG = {
  course:       { label:'Mata Kuliah',  icon: BookOpen,      color:'#6366f1', route: (r,_) => `/${r.role==='mahasiswa'?'mata-kuliah':'mata-kuliah'}` },
  materi:       { label:'Materi',       icon: BookOpen,      color:'#0891b2', route: (r,id,cid) => `/mata-kuliah/${cid}` },
  tugas:        { label:'Tugas',        icon: ClipboardList, color:'#f59e0b', route: (r,id,cid) => `/mata-kuliah/${cid}` },
  forum:        { label:'Forum',        icon: MessageSquare, color:'#10b981', route: (r,id) => `/forum/${id}` },
  pengumuman:   { label:'Pengumuman',   icon: Megaphone,     color:'#ef4444', route: () => '/pengumuman' },
}

function useDebounce(val, delay) {
  const [debounced, setDebounced] = useState(val)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(val), delay)
    return () => clearTimeout(t)
  }, [val, delay])
  return debounced
}

export default function GlobalSearch() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selIdx,  setSelIdx]  = useState(0)
  const inputRef = useRef(null)
  const debouncedQ = useDebounce(query, 280)

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(true) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  useEffect(() => {
    if (debouncedQ.trim().length >= 2) doSearch(debouncedQ.trim())
    else setResults([])
  }, [debouncedQ])

  const doSearch = useCallback(async (q) => {
    setLoading(true)
    const like = `%${q}%`

    // Build course filter for non-admin
    let courseIds = null
    if (role === 'mahasiswa') {
      const { data } = await supabase.from('enrollments').select('course_id').eq('student_id', user.id)
      courseIds = (data||[]).map(e => e.course_id)
    } else if (role === 'dosen') {
      const { data } = await supabase.from('courses').select('id').eq('dosen_id', user.id)
      courseIds = (data||[]).map(c => c.id)
    }

    const inIds = (table, col='course_id') =>
      courseIds ? supabase.from(table).select('*').in(col, courseIds) : supabase.from(table).select('*')

    const promises = [
      // Courses
      (courseIds
        ? supabase.from('courses').select('id,code,name').in('id', courseIds||[])
        : supabase.from('courses').select('id,code,name')
      ).ilike('name', like).limit(4),

      // Materials
      inIds('materials').ilike('title', like).select('id,title,course_id').limit(4),

      // Assignments
      inIds('assignments').ilike('title', like).select('id,title,course_id,due_date').limit(4),

      // Forums
      inIds('forums').ilike('title', like).select('id,title,course_id').limit(4),

      // Announcements
      supabase.from('announcements').select('id,title').ilike('title', like).limit(3),
    ]

    const [courses, materials, assignments, forums, announcements] = await Promise.all(promises)

    const all = [
      ...(courses.data||[]).map(r => ({ ...r, _type:'course',     _label:r.name,  _sub:r.code })),
      ...(materials.data||[]).map(r => ({ ...r, _type:'materi',   _label:r.title, _sub:'Materi' })),
      ...(assignments.data||[]).map(r => ({ ...r, _type:'tugas',  _label:r.title, _sub: r.due_date ? `Deadline: ${new Date(r.due_date).toLocaleDateString('id-ID')}` : 'Tugas' })),
      ...(forums.data||[]).map(r => ({ ...r, _type:'forum',       _label:r.title, _sub:'Diskusi Forum' })),
      ...(announcements.data||[]).map(r => ({ ...r, _type:'pengumuman', _label:r.title, _sub:'Pengumuman' })),
    ]
    setResults(all)
    setSelIdx(0)
    setLoading(false)
  }, [user, role])

  function go(r) {
    const cfg = TYPE_CONFIG[r._type]
    if (!cfg) return
    navigate(cfg.route({ role }, r.id, r.course_id))
    setOpen(false)
    setQuery('')
    setResults([])
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i+1, results.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter' && results[selIdx]) go(results[selIdx])
  }

  // Group by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r._type]) acc[r._type] = []
    acc[r._type].push(r)
    return acc
  }, {})

  return (
    <>
      {/* Trigger input (in header) */}
      <div className="header-search" onClick={() => setOpen(true)} style={{ cursor:'pointer' }}>
        <Search size={14} className="header-search-icon" />
        <input
          className="input"
          placeholder="Cari mata kuliah, tugas… (Ctrl+K)"
          readOnly
          style={{ cursor:'pointer' }}
        />
        <div style={{ display:'flex', alignItems:'center', gap:2, position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
          <kbd style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:'var(--gray-100)', color:'var(--gray-400)', border:'1px solid var(--gray-200)', fontFamily:'inherit' }}>Ctrl</kbd>
          <kbd style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:'var(--gray-100)', color:'var(--gray-400)', border:'1px solid var(--gray-200)', fontFamily:'inherit' }}>K</kbd>
        </div>
      </div>

      {/* Search modal */}
      {open && (
        <div
          style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:80 }}
          onClick={e => { if (e.target===e.currentTarget) setOpen(false) }}
        >
          <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:580, boxShadow:'0 24px 80px rgba(0,0,0,.3)', overflow:'hidden' }}>
            {/* Search input */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid var(--border-color)' }}>
              <Search size={18} color="var(--indigo-600)"/>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ketik untuk mencari…"
                style={{ flex:1, border:'none', outline:'none', fontSize:15, background:'transparent', color:'var(--gray-900)' }}
              />
              {loading && <div className="spinner" style={{ width:16, height:16, borderWidth:2 }}/>}
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)', display:'flex' }}>
                <X size={16}/>
              </button>
            </div>

            {/* Results */}
            <div style={{ maxHeight:420, overflowY:'auto' }}>
              {query.length < 2 ? (
                <div style={{ padding:'24px 20px', textAlign:'center' }}>
                  <Search size={28} color="var(--gray-200)" style={{ marginBottom:8 }}/>
                  <div style={{ fontSize:13, color:'var(--gray-400)' }}>Ketik minimal 2 karakter untuk mencari</div>
                  <div style={{ fontSize:11, color:'var(--gray-300)', marginTop:6 }}>Cari di: Mata Kuliah, Materi, Tugas, Forum, Pengumuman</div>
                </div>
              ) : results.length === 0 && !loading ? (
                <div style={{ padding:'24px 20px', textAlign:'center' }}>
                  <div style={{ fontSize:13, color:'var(--gray-400)' }}>Tidak ada hasil untuk "<strong>{query}</strong>"</div>
                </div>
              ) : (
                Object.entries(grouped).map(([type, items]) => {
                  const cfg = TYPE_CONFIG[type]
                  if (!cfg || !items.length) return null
                  const Icon = cfg.icon
                  return (
                    <div key={type}>
                      <div style={{ padding:'10px 18px 4px', fontSize:10, fontWeight:800, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.6 }}>
                        {cfg.label}
                      </div>
                      {items.map((r, _idx) => {
                        const globalIdx = results.indexOf(r)
                        const isSel = globalIdx === selIdx
                        return (
                          <div key={r.id}
                            onClick={() => go(r)}
                            onMouseEnter={() => setSelIdx(globalIdx)}
                            style={{
                              display:'flex', alignItems:'center', gap:12,
                              padding:'10px 18px', cursor:'pointer',
                              background: isSel ? 'var(--indigo-50)' : 'transparent',
                              transition:'background .1s',
                            }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:`${cfg.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <Icon size={15} color={cfg.color}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--gray-800)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {r._label}
                              </div>
                              <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:1 }}>{r._sub}</div>
                            </div>
                            <div style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:`${cfg.color}18`, color:cfg.color, fontWeight:700, flexShrink:0 }}>
                              {cfg.label}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer hint */}
            <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border-color)', display:'flex', gap:16, alignItems:'center' }}>
              {[
                { keys:['↑','↓'], desc:'Navigasi' },
                { keys:['↵'],     desc:'Buka' },
                { keys:['Esc'],   desc:'Tutup' },
              ].map(h => (
                <div key={h.desc} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  {h.keys.map(k => (
                    <kbd key={k} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'var(--gray-100)', color:'var(--gray-500)', border:'1px solid var(--gray-200)', fontFamily:'inherit' }}>{k}</kbd>
                  ))}
                  <span style={{ fontSize:11, color:'var(--gray-400)' }}>{h.desc}</span>
                </div>
              ))}
              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--gray-300)' }}>
                {results.length} hasil
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
