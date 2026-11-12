import { useState, useRef } from 'react'
import { Upload, Link2, Loader2, X, CheckCircle2 } from 'lucide-react'
import { openDrivePicker, uploadToDrive } from '@/lib/googleDrive'
import toast from 'react-hot-toast'

/**
 * DriveUploadButton
 * Props:
 *   folderId?    - Google Drive folder to upload into
 *   onSuccess    - callback({ id, name, mimeType, webViewLink, webContentLink })
 *   accept?      - file input accept string (default: '*')
 *   label?       - button label
 *   mode?        - 'upload' | 'pick' | 'both' (default: 'both')
 */
export default function DriveUploadButton({
  folderId,
  onSuccess,
  accept = '*',
  label: _label = 'File Drive',
  mode = 'both',
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)
  const fileRef = useRef(null)

  const driveConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID &&
    import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE')

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!driveConfigured) {
      toast.error('Google Drive belum dikonfigurasi (VITE_GOOGLE_CLIENT_ID)')
      return
    }
    setUploading(true)
    try {
      const data = await uploadToDrive(file, folderId)
      setResult(data)
      onSuccess?.(data)
      toast.success(`"${data.name}" berhasil diunggah ke Drive`)
    } catch (err) {
      toast.error(err.message || 'Upload gagal')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handlePick() {
    if (!driveConfigured) {
      toast.error('Google Drive belum dikonfigurasi')
      return
    }
    setUploading(true)
    try {
      const data = await openDrivePicker()
      setResult(data)
      onSuccess?.(data)
      toast.success(`"${data.name}" dipilih dari Drive`)
    } catch (err) {
      if (err.message !== 'Picker dibatalkan') toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  function clearResult() {
    setResult(null)
    onSuccess?.(null)
  }

  if (result) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: '#d1fae5', border: '1px solid #a7f3d0',
        borderRadius: 8, fontSize: 12,
      }}>
        <CheckCircle2 size={14} color="#059669" />
        <a href={result.webViewLink} target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, color: '#065f46', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.name}
        </a>
        <button onClick={clearResult} className="btn btn-ghost btn-icon btn-sm" style={{ padding: 2 }}>
          <X size={12} color="#065f46" />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {(mode === 'upload' || mode === 'both') && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading
              ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} />
              : <Upload size={13} />
            }
            Upload ke Drive
          </button>
        </>
      )}
      {(mode === 'pick' || mode === 'both') && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handlePick}
          disabled={disabled || uploading}
        >
          <Link2 size={13} /> Pilih dari Drive
        </button>
      )}
    </div>
  )
}
