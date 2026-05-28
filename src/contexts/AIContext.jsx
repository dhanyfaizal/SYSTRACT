import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const AI_KEY_STORAGE = 'edusys_gemini_api_key'
const AI_MODEL_STORAGE = 'edusys_gemini_model'

async function detectBestModel(key) {
  if (!key) return 'gemini-1.5-flash'
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
    if (!res.ok) return 'gemini-1.5-flash'
    const data = await res.json()
    const models = data.models || []
    const names = models.map(m => m.name)

    const preferences = [
      'models/gemini-3.5-flash',
      'models/gemini-2.5-flash',
      'models/gemini-2.0-flash',
      'models/gemini-1.5-flash'
    ]

    for (const pref of preferences) {
      if (names.includes(pref)) {
        return pref.replace('models/', '')
      }
    }
    return 'gemini-1.5-flash'
  } catch (_) {
    return 'gemini-1.5-flash'
  }
}

const AIContext = createContext(null)

export function AIProvider({ children }) {
  const [apiKey, setApiKeyState] = useState(
    () => localStorage.getItem(AI_KEY_STORAGE) || ''
  )
  const [detectedModel, setDetectedModel] = useState(
    () => localStorage.getItem(AI_MODEL_STORAGE) || 'gemini-1.5-flash'
  )
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (!apiKey) return
    detectBestModel(apiKey).then(model => {
      setDetectedModel(model)
      localStorage.setItem(AI_MODEL_STORAGE, model)
    })
  }, [apiKey])

  const saveApiKey = useCallback((key) => {
    localStorage.setItem(AI_KEY_STORAGE, key)
    setApiKeyState(key)
  }, [])

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(AI_KEY_STORAGE)
    localStorage.removeItem(AI_MODEL_STORAGE)
    setApiKeyState('')
    setDetectedModel('gemini-1.5-flash')
  }, [])

  const hasKey = Boolean(apiKey)

  /**
   * Send a prompt to Gemini directly from browser
   * @param {string} prompt
   * @param {string} [systemPrompt]
   * @returns {Promise<string>} AI response text
   */
  const askGemini = useCallback(async (prompt, systemPrompt = '', customKey = null) => {
    const keyToUse = customKey || apiKey
    if (!keyToUse) throw new Error('NO_KEY')

    let modelToUse = detectedModel
    if (customKey) {
      modelToUse = await detectBestModel(customKey)
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: systemPrompt
            ? { parts: [{ text: systemPrompt }] }
            : undefined,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    )

    if (!response.ok) {
      let errMsg = 'Gagal menghubungi AI'
      try {
        const err = await response.json()
        errMsg = err.error?.message || errMsg
      } catch (_) {
        errMsg = `${response.status} ${response.statusText}`
      }
      throw new Error(errMsg)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Tidak ada respons)'
  }, [apiKey, detectedModel])

  return (
    <AIContext.Provider value={{ apiKey, hasKey, saveApiKey, clearApiKey, askGemini, chatOpen, setChatOpen }}>
      {children}
    </AIContext.Provider>
  )
}

export const useAI = () => {
  const ctx = useContext(AIContext)
  if (!ctx) throw new Error('useAI must be used inside <AIProvider>')
  return ctx
}
