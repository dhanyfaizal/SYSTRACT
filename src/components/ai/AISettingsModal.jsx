import { useState } from 'react'
import { KeyRound, Eye, EyeOff, X, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useAI } from '@/contexts/AIContext'
import toast from 'react-hot-toast'

export default function AISettingsModal({ onClose }) {
  const { apiKey, saveApiKey, clearApiKey, askGemini } = useAI()

  const [draft,    setDraft]    = useState(apiKey)
  const [show,     setShow]     = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [testOk,   setTestOk]   = useState(null) // null | true | false
  const [testMsg,  setTestMsg]  = useState('')

  async function handleTest() {
    const key = draft.trim()
    if (!key) {
      toast.error('Masukkan API Key terlebih dahulu')
      return
    }
    if (!key.startsWith('AIzaSy')) {
      setTestOk(false)
      setTestMsg('API Key Gemini yang valid harus dimulai dengan "AIzaSy"')
      return
    }
    setTesting(true); setTestOk(null); setTestMsg('')
    try {
      const res = await askGemini('Balas hanya dengan "OK" dalam satu kata.', '', key)
      setTestOk(true)
      setTestMsg(`✓ Respons: "${res.trim().slice(0,60)}"`)
    } catch (err) {
      setTestOk(false)
      setTestMsg(err.message || 'Koneksi gagal')
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    const key = draft.trim()
    if (!key) { toast.error('API Key tidak boleh kosong'); return }
    if (!key.startsWith('AIzaSy')) {
      toast.error('API Key Gemini yang valid harus dimulai dengan "AIzaSy"')
      return
    }
    saveApiKey(key)
    toast.success('API Key disimpan di browser Anda')
    onClose()
  }

  function handleClear() {
    clearApiKey()
    setDraft('')
    setTestOk(null)
    toast('API Key dihapus', { icon: '🗑️' })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--indigo-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <KeyRound size={16} color="var(--indigo-600)" />
            </div>
            <div>
              <div className="modal-title">Pengaturan AI Assistant</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>
                Gemini API Key (BYOK — disimpan di browser Anda)
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Info box */}
          <div style={{
            background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)',
            borderRadius: 8, padding: '12px 14px',
            fontSize: 12, color: 'var(--gray-700)', lineHeight: 1.6
          }}>
            <strong>🔐 Privasi Terjamin:</strong> API Key disimpan hanya di{' '}
            <code style={{ background: 'var(--indigo-100)', padding: '0 4px', borderRadius: 3 }}>localStorage</code>{' '}
            browser Anda. Tidak pernah dikirim ke server EduSYS. Request AI dilakukan langsung dari browser ke Google.
          </div>

          {/* API Key input */}
          <div className="input-group">
            <label className="input-label">Gemini API Key</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                className="input"
                style={{ paddingRight: 40, fontFamily: show ? 'monospace' : 'inherit', fontSize: show ? 12 : 14 }}
                placeholder="AIza..."
                value={draft}
                onChange={e => { setDraft(e.target.value); setTestOk(null) }}
              />
              <button
                className="btn btn-ghost btn-icon btn-sm"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: 4 }}
                onClick={() => setShow(v => !v)}
                type="button"
              >
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <span className="input-hint">
              Dapatkan key di{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--indigo-600)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                Google AI Studio <ExternalLink size={10} />
              </a>
            </span>
          </div>

          {/* Test result */}
          {testOk !== null && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px', borderRadius: 8,
              background: testOk ? '#d1fae5' : '#fee2e2',
              color: testOk ? '#065f46' : '#991b1b',
              fontSize: 12
            }}>
              {testOk
                ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                : <AlertCircle  size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              }
              {testMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClear} style={{ color: 'var(--danger)' }}>
            Hapus Key
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleTest} disabled={testing || !draft.trim()}>
              {testing
                ? <><Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> Menguji…</>
                : 'Test Key'
              }
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
