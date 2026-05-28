import { useState } from 'react'
import { KeyRound, Eye, EyeOff, X, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useAI } from '@/contexts/AIContext'
import toast from 'react-hot-toast'

export default function AISettingsModal({ onClose }) {
  const { apiKey, baseUrl, apiType, modelName, saveSettings, clearApiKey, askGemini } = useAI()

  const [providerType, setProviderType] = useState(() => {
    if (baseUrl === 'https://generativelanguage.googleapis.com' && apiType === 'gemini') {
      return 'official'
    }
    return 'custom'
  })

  const [draftKey, setDraftKey] = useState(apiKey)
  const [draftType, setDraftType] = useState(apiType)
  const [draftUrl, setDraftUrl] = useState(baseUrl)
  const [draftModel, setDraftModel] = useState(modelName)

  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState(null) // null | true | false
  const [testMsg, setTestMsg] = useState('')

  function handleProviderChange(e) {
    const val = e.target.value
    setProviderType(val)
    setTestOk(null)
    setTestMsg('')
    if (val === 'official') {
      setDraftType('gemini')
      setDraftUrl('https://generativelanguage.googleapis.com')
      setDraftModel('gemini-1.5-flash')
    } else {
      if (draftUrl === 'https://generativelanguage.googleapis.com') {
        setDraftUrl('')
      }
    }
  }

  async function handleTest() {
    const key = draftKey.trim()
    const url = draftUrl.trim()
    const type = draftType
    const model = draftModel.trim()

    if (!key) {
      toast.error('Masukkan API Key terlebih dahulu')
      return
    }

    if (providerType === 'official') {
      if (!key.startsWith('AIzaSy')) {
        setTestOk(false)
        setTestMsg('API Key Gemini yang valid harus dimulai dengan "AIzaSy"')
        return
      }
    }

    setTesting(true); setTestOk(null); setTestMsg('')
    try {
      const res = await askGemini('Balas hanya dengan "OK" dalam satu kata.', '', {
        apiKey: key,
        apiType: type,
        baseUrl: url || (type === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1'),
        modelName: model || (type === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')
      })
      setTestOk(true)
      setTestMsg(`✓ Respons: "${res.trim().slice(0, 60)}"`)
    } catch (err) {
      setTestOk(false)
      setTestMsg(err.message || 'Koneksi gagal')
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    const key = draftKey.trim()
    const url = draftUrl.trim()
    const type = draftType
    const model = draftModel.trim()

    if (!key) {
      toast.error('API Key tidak boleh kosong')
      return
    }

    if (providerType === 'official') {
      if (!key.startsWith('AIzaSy')) {
        toast.error('API Key Gemini yang valid harus dimulai dengan "AIzaSy"')
        return
      }
    }

    const finalUrl = url || (type === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1')
    const finalModel = model || (type === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')

    saveSettings(key, type, finalUrl, finalModel)
    toast.success('Pengaturan AI disimpan di browser Anda')
    onClose()
  }

  function handleClear() {
    clearApiKey()
    setDraftKey('')
    setDraftType('gemini')
    setDraftUrl('https://generativelanguage.googleapis.com')
    setDraftModel('gemini-1.5-flash')
    setProviderType('official')
    setTestOk(null)
    setTestMsg('')
    toast('Pengaturan AI direset', { icon: '🗑️' })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
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
                Konfigurasi model AI kustom atau bawaan (BYOK)
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
            <strong>🔐 Privasi Terjamin:</strong> Konfigurasi AI disimpan hanya di{' '}
            <code style={{ background: 'var(--indigo-100)', padding: '0 4px', borderRadius: 3 }}>localStorage</code>{' '}
            browser Anda. Tidak pernah dikirim ke server EduSYS. Request AI dilakukan langsung dari browser ke API endpoint Anda.
          </div>

          {/* Select Provider */}
          <div className="input-group">
            <label className="input-label">Provider AI</label>
            <select
              className="input"
              value={providerType}
              onChange={handleProviderChange}
            >
              <option value="official">Official Google Gemini API</option>
              <option value="custom">Custom Proxy / Provider (Sumopod, VPS, dll.)</option>
            </select>
          </div>

          {/* Custom Fields */}
          {providerType === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderLeft: '2px solid var(--indigo-100)', paddingLeft: 12 }}>
              <div className="form-grid form-grid-2">
                <div className="input-group">
                  <label className="input-label">Tipe API</label>
                  <select
                    className="input"
                    value={draftType}
                    onChange={e => {
                      setDraftType(e.target.value)
                      setDraftModel('')
                      setDraftUrl('')
                    }}
                  >
                    <option value="gemini">Gemini API Format</option>
                    <option value="openai">OpenAI-Compatible Format</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Nama Model</label>
                  <input
                    type="text"
                    className="input"
                    placeholder={draftType === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'}
                    value={draftModel}
                    onChange={e => setDraftModel(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Base URL (API Endpoint)</label>
                <input
                  type="text"
                  className="input"
                  placeholder={draftType === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1'}
                  value={draftUrl}
                  onChange={e => setDraftUrl(e.target.value)}
                />
                <span className="input-hint">
                  Domain proxy atau custom endpoint Anda (contoh: dari Sumopod atau OpenClaw).
                </span>
              </div>
            </div>
          )}

          {/* API Key input */}
          <div className="input-group">
            <label className="input-label">API Key</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                className="input"
                style={{ paddingRight: 40, fontFamily: show ? 'monospace' : 'inherit', fontSize: show ? 12 : 14 }}
                placeholder={providerType === 'official' ? 'AIzaSy...' : 'Masukkan API Key Anda...'}
                value={draftKey}
                onChange={e => { setDraftKey(e.target.value); setTestOk(null) }}
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
            {providerType === 'official' && (
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
            )}
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
            <button className="btn btn-secondary btn-sm" onClick={handleTest} disabled={testing || !draftKey.trim()}>
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
