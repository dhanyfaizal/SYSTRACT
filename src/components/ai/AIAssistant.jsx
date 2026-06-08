import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Loader2, KeyRound } from 'lucide-react'
import { useAI }  from '@/contexts/AIContext'
import { useAuth } from '@/contexts/AuthContext'
import AISettingsModal from './AISettingsModal'

// System prompt adapts to user role
function buildSystemPrompt(role, pageName = '') {
  const base = `Kamu adalah Asisten AI SYSTRACT milik STIKOM Yos Sudarso. Jawab dalam Bahasa Indonesia yang ramah, sopan, dan solutif. Format respons menggunakan susunan markdown yang rapi (seperti tebal, list poin, dan blok kode pemrograman jika diperlukan) agar mudah dibaca oleh pengguna.`
  if (role === 'mahasiswa') return `${base} Bantu mahasiswa memahami materi kuliah, memberikan panduan pengerjaan tugas, dan memberikan tips belajar secara efektif.`
  if (role === 'dosen')     return `${base} Bantu dosen merancang rubrik penilaian tugas, menyusun butir soal ujian, membuat modul bahan ajar, dan memberikan inspirasi feedback konstruktif.`
  if (role === 'admin')     return `${base} Bantu admin mengelola alur kerja sistem, menyusun format laporan, dan menyusun teks pengumuman resmi institusi.`
  return base
}

export function parseInlineMarkdown(text) {
  if (!text) return ''
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`)/g)
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={idx} style={{ fontWeight: 700 }}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={idx} style={{
          background: 'rgba(120, 120, 120, 0.15)',
          color: 'inherit',
          padding: '2px 5px',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: '11.5px',
          wordBreak: 'break-word'
        }}>
          {token.slice(1, -1)}
        </code>
      )
    }
    return token
  })
}

export function formatMessageText(text) {
  if (!text) return ''
  
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)
  
  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const codeLines = part.slice(3, -3).trim().split('\n')
      let language = ''
      if (codeLines.length > 0 && !codeLines[0].includes(' ') && codeLines[0].length < 15) {
        language = codeLines.shift()
      }
      const codeContent = codeLines.join('\n')
      return (
        <div key={index} style={{
          background: '#0f172a',
          color: '#e2e8f0',
          borderRadius: 8,
          padding: '12px 14px',
          fontFamily: 'monospace',
          fontSize: '12px',
          margin: '10px 0',
          overflowX: 'auto',
          lineHeight: 1.5,
          border: '1px solid #334155',
          textAlign: 'left'
        }}>
          {language && (
            <div style={{
              fontSize: '10px',
              color: '#94a3b8',
              textTransform: 'uppercase',
              marginBottom: 6,
              paddingBottom: 4,
              borderBottom: '1px solid #1e293b',
              fontWeight: 700,
              letterSpacing: '0.5px'
            }}>
              {language}
            </div>
          )}
          <pre style={{ margin: 0, whiteSpace: 'pre' }}><code>{codeContent}</code></pre>
        </div>
      )
    }
    
    const lines = part.split('\n')
    return (
      <div key={index}>
        {lines.map((line, lineIdx) => {
          const content = line
          
          // Bullet lists (- or * or digits)
          const listMatch = content.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
          if (listMatch) {
            const indent = listMatch[1].length * 10
            const marker = listMatch[2]
            const itemText = listMatch[3]
            return (
              <div key={lineIdx} style={{ display: 'flex', gap: 6, paddingLeft: indent + 8, margin: '4px 0', textAlign: 'left' }}>
                <span style={{ color: 'var(--indigo-500)', fontWeight: 700 }}>{marker}</span>
                <span style={{ flex: 1 }}>{parseInlineMarkdown(itemText)}</span>
              </div>
            )
          }
          
          // Headings (#)
          const headingMatch = content.match(/^(#{1,6})\s+(.+)$/)
          if (headingMatch) {
            const level = headingMatch[1].length
            const headingText = headingMatch[2]
            const size = level === 1 ? '16px' : level === 2 ? '14.5px' : '13px'
            return (
              <div key={lineIdx} style={{ fontWeight: 700, fontSize: size, margin: '12px 0 6px 0', color: 'inherit', textAlign: 'left' }}>
                {parseInlineMarkdown(headingText)}
              </div>
            )
          }
          
          return (
            <p key={lineIdx} style={{ margin: content.trim() === '' ? '8px 0' : '3px 0', minHeight: content.trim() === '' ? '8px' : 'auto', textAlign: 'left' }}>
              {parseInlineMarkdown(content)}
            </p>
          )
        })}
      </div>
    )
  })
}

export default function AIAssistant() {
  const { hasKey, chatOpen, setChatOpen, askGemini, initialPrompt, setInitialPrompt } = useAI()
  const { role } = useAuth()

  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Halo! 👋 Saya AI Assistant SYSTRACT. Ada yang bisa saya bantu?' }
  ])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [keyModal, setKeyModal] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (chatOpen && initialPrompt) {
      const text = initialPrompt
      setInitialPrompt('') // Clear immediately to prevent loop
      setMessages(m => [...m, { role: 'user', text }])
      setLoading(true)

      askGemini(text, buildSystemPrompt(role))
        .then(reply => {
          setMessages(m => [...m, { role: 'bot', text: reply }])
        })
        .catch(err => {
          const errText = err.message === 'NO_KEY'
            ? '⚠️ API Key belum diatur. Klik tombol kunci untuk menambahkan key Gemini Anda.'
            : `❌ Error: ${err.message}`
          setMessages(m => [...m, { role: 'bot', text: errText }])
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [chatOpen, initialPrompt, askGemini, role, setInitialPrompt])

  useEffect(() => {
    if (chatOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [chatOpen, messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    setMessages(m => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const reply = await askGemini(text, buildSystemPrompt(role))
      setMessages(m => [...m, { role: 'bot', text: reply }])
    } catch (err) {
      const errText = err.message === 'NO_KEY'
        ? '⚠️ API Key belum diatur. Klik tombol kunci untuk menambahkan key Gemini Anda.'
        : `❌ Error: ${err.message}`
      setMessages(m => [...m, { role: 'bot', text: errText }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      {/* FAB */}
      {!chatOpen && (
        <button className="fab-ai" onClick={() => setChatOpen(true)} title="AI Assistant">
          <Sparkles size={20} />
        </button>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div className="ai-panel">
          {/* Panel header */}
          <div className="ai-panel-header">
            <Sparkles size={16} />
            <span className="ai-panel-title">AI Assistant</span>
            <button
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, padding: '3px 6px', color: '#fff', cursor: 'pointer' }}
              onClick={() => setKeyModal(true)}
              title="Pengaturan API Key"
            >
              <KeyRound size={13} />
            </button>
            <button
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, padding: '3px 6px', color: '#fff', cursor: 'pointer', marginLeft: 4 }}
              onClick={() => setChatOpen(false)}
            >
              <X size={13} />
            </button>
          </div>

          {/* No key warning banner */}
          {!hasKey && (
            <div style={{
              padding: '8px 14px', fontSize: 11,
              background: '#fef3c7', color: '#92400e',
              display: 'flex', alignItems: 'center', gap: 6,
              borderBottom: '1px solid #fde68a'
            }}>
              <KeyRound size={11} />
              API Key belum diset —{' '}
              <button
                onClick={() => setKeyModal(true)}
                style={{ background: 'none', border: 'none', color: '#92400e', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}
              >
                Atur sekarang
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="ai-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
                {formatMessageText(msg.text)}
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg-bot">
                <div className="ai-typing">
                  <div className="ai-dot" />
                  <div className="ai-dot" />
                  <div className="ai-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="ai-input-row">
            <input
              ref={inputRef}
              className="input"
              placeholder="Tanya sesuatu…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              className="btn btn-primary btn-icon"
              onClick={send}
              disabled={!input.trim() || loading}
            >
              {loading
                ? <Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} />
                : <Send size={14} />
              }
            </button>
          </div>
        </div>
      )}

      {keyModal && <AISettingsModal onClose={() => setKeyModal(false)} />}
    </>
  )
}
