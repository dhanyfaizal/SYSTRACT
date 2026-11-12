import { FileText, ClipboardList, Table2, Award } from 'lucide-react'


/* ── Tab bar ─────────────────────────────────────────────── */
export default function TabBar({ active, onChange }) {
  const tabs = [
    { key:'tugas', icon: ClipboardList, label:'Tugas' },
    { key:'ujian', icon: FileText,      label:'Ujian'  },
    { key:'rekap', icon: Table2,        label:'Rekap'  },
    { key:'sertifikat', icon: Award,    label:'Validasi Sertifikat' },
  ]
  return (
    <div style={{ display:'flex', gap:4, background:'var(--gray-100)', borderRadius:10, padding:4, width:'fit-content', marginBottom:20 }}>
      {tabs.map(({ key, icon: _Icon, label }) => (
        <button key={key} onClick={() => onChange(key)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all .15s',
            background: active===key ? '#fff' : 'transparent',
            color:      active===key ? 'var(--indigo-700)' : 'var(--gray-500)',
            boxShadow:  active===key ? 'var(--shadow-sm)' : 'none',
          }}>
          <Icon size={14}/> {label}
        </button>
      ))}
    </div>
  )
}
