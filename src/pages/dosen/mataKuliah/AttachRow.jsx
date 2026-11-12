import { X, ChevronDown } from 'lucide-react'
import { ATTACH_TYPES, typeOf, extractYouTubeId } from './konstanta'


// ── Row for one attachment ─────────────────────────────────────
export default function AttachRow({ attach, idx, onChange, onRemove, canRemove }) {
  const t = typeOf(attach.mime)
  const ytId = attach.mime === 'video/youtube' ? extractYouTubeId(attach.url) : null

  return (
    <div style={{ border:'1px solid var(--gray-200)', borderRadius:10, padding:'12px 14px', marginBottom:10, background:'var(--gray-50)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:18 }}>{t.icon}</span>
        <div style={{ position:'relative', flex:'0 0 160px' }}>
          <select
            className="input"
            value={attach.mime}
            onChange={e => onChange(idx, 'mime', e.target.value)}
            style={{ paddingRight:28, fontSize:12 }}
          >
            {ATTACH_TYPES.map(a => (
              <option key={a.id} value={a.mime}>{a.icon} {a.label}</option>
            ))}
          </select>
          <ChevronDown size={12} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--gray-400)' }}/>
        </div>
        <input
          className="input"
          placeholder="Label (opsional)"
          value={attach.label}
          onChange={e => onChange(idx, 'label', e.target.value)}
          style={{ flex:1, fontSize:12 }}
        />
        {canRemove && (
          <button className="btn btn-ghost btn-icon btn-sm" style={{ color:'var(--danger)', flexShrink:0 }} onClick={() => onRemove(idx)}>
            <X size={14}/>
          </button>
        )}
      </div>

      <input
        className="input"
        placeholder={t.placeholder}
        value={attach.url}
        onChange={e => onChange(idx, 'url', e.target.value)}
        style={{ fontSize:12 }}
      />

      {ytId && (
        <div style={{ position:'relative', marginTop:8, borderRadius:8, overflow:'hidden', aspectRatio:'16/9', maxHeight:120, background:'#000' }}>
          <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="thumbnail" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:.85 }}/>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width:40, height:40, background:'#ff0000', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:16, color: '#fff' }}>▶</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
