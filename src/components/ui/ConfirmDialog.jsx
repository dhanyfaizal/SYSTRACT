import { AlertTriangle, Trash2, Info, X } from 'lucide-react'

// ── ConfirmDialog UI Component ────────────────────────────────────
export function ConfirmDialog({ open, title, message, confirmLabel = 'Ya, Hapus', cancelLabel = 'Batal', variant = 'danger', onConfirm, onCancel }) {
  if (!open) return null

  const variants = {
    danger:  { icon: Trash2,         iconBg: '#fee2e2', iconColor: '#dc2626', btnClass: 'btn-danger',   btnBg: '#dc2626' },
    warning: { icon: AlertTriangle,  iconBg: '#fef3c7', iconColor: '#d97706', btnClass: 'btn-warning',  btnBg: '#d97706' },
    info:    { icon: Info,           iconBg: '#dbeafe', iconColor: '#2563eb', btnClass: 'btn-primary',  btnBg: '#4f46e5' },
  }
  const v = variants[variant] || variants.danger
  const Icon = v.icon

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:20, animation:'fadeIn .15s ease',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'var(--white, #fff)',
          borderRadius:16, padding:'28px 28px 24px',
          width:'100%', maxWidth:420,
          boxShadow:'0 20px 60px rgba(0,0,0,.25)',
          animation:'slideUp .18s ease',
        }}
      >
        {/* Icon + Close */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{
            width:48, height:48, borderRadius:12, flexShrink:0,
            background: v.iconBg, display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon size={22} color={v.iconColor}/>
          </div>
          <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)', padding:4, borderRadius:6, lineHeight:1 }}>
            <X size={16}/>
          </button>
        </div>

        {/* Text */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--gray-900)', marginBottom:6 }}>
            {title}
          </div>
          <div style={{ fontSize:13, color:'var(--gray-500)', lineHeight:1.6 }}>
            {message}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding:'8px 18px', borderRadius:8, border:'1px solid var(--gray-200)',
              background:'white', color:'var(--gray-700)', fontSize:13, fontWeight:600,
              cursor:'pointer', transition:'background .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background='var(--gray-50)'}
            onMouseLeave={e => e.currentTarget.style.background='white'}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding:'8px 20px', borderRadius:8, border:'none',
              background: v.btnBg, color:'white', fontSize:13, fontWeight:700,
              cursor:'pointer', transition:'opacity .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity='.85'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
