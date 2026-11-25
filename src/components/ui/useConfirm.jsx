// Hook konfirmasi berbasis ConfirmDialog.
import { useState, useRef, useCallback } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

// ── useConfirm hook ───────────────────────────────────────────────
// Usage:
//   const { confirmDialog, showConfirm } = useConfirm()
//   await showConfirm({ title:'Hapus?', message:'...' })  // resolves true/false
//   return <>{confirmDialog}</>
export function useConfirm() {
  const [state, setState] = useState({ open:false, title:'', message:'', confirmLabel:'Ya, Hapus', cancelLabel:'Batal', variant:'danger' })
  const resolveRef = useRef(null)

  const showConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open:true, confirmLabel:'Ya, Hapus', cancelLabel:'Batal', variant:'danger', ...opts })
    })
  }, [])

  function handleConfirm() { setState(s => ({...s, open:false})); resolveRef.current?.(true) }
  function handleCancel()  { setState(s => ({...s, open:false})); resolveRef.current?.(false) }

  const confirmDialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirmDialog, showConfirm }
}
