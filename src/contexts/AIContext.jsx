import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const AI_KEY_STORAGE = 'edusys_gemini_api_key'
const AI_BASE_URL_STORAGE = 'edusys_ai_base_url'
const AI_TYPE_STORAGE = 'edusys_ai_type'
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
  const [baseUrl, setBaseUrlState] = useState(
    () => localStorage.getItem(AI_BASE_URL_STORAGE) || 'https://generativelanguage.googleapis.com'
  )
  const [apiType, setApiTypeState] = useState(
    () => localStorage.getItem(AI_TYPE_STORAGE) || 'gemini'
  )
  const [detectedModel, setDetectedModel] = useState(
    () => localStorage.getItem(AI_MODEL_STORAGE) || 'gemini-1.5-flash'
  )
  const [chatOpen, setChatOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')

  const askWithContext = useCallback((prompt) => {
    setInitialPrompt(prompt)
    setChatOpen(true)
  }, [])

  useEffect(() => {
    if (!apiKey) return
    // Only detect best model when using official Gemini endpoint
    if (apiType === 'gemini' && baseUrl === 'https://generativelanguage.googleapis.com') {
      detectBestModel(apiKey).then(model => {
        setDetectedModel(model)
        localStorage.setItem(AI_MODEL_STORAGE, model)
      })
    }
  }, [apiKey, apiType, baseUrl])

  const saveSettings = useCallback((key, type, url, model) => {
    localStorage.setItem(AI_KEY_STORAGE, key)
    localStorage.setItem(AI_TYPE_STORAGE, type)
    localStorage.setItem(AI_BASE_URL_STORAGE, url)
    localStorage.setItem(AI_MODEL_STORAGE, model)
    setApiKeyState(key)
    setApiTypeState(type)
    setBaseUrlState(url)
    setDetectedModel(model)
  }, [])

  const saveApiKey = useCallback((key) => {
    saveSettings(key, 'gemini', 'https://generativelanguage.googleapis.com', 'gemini-1.5-flash')
  }, [saveSettings])

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(AI_KEY_STORAGE)
    localStorage.removeItem(AI_TYPE_STORAGE)
    localStorage.removeItem(AI_BASE_URL_STORAGE)
    localStorage.removeItem(AI_MODEL_STORAGE)
    setApiKeyState('')
    setApiTypeState('gemini')
    setBaseUrlState('https://generativelanguage.googleapis.com')
    setDetectedModel('gemini-1.5-flash')
  }, [])

  const hasKey = Boolean(apiKey)

  /**
   * Send a prompt to AI directly from browser
   * @param {string} prompt
   * @param {string} [systemPrompt]
   * @param {string|object} [customSettings]
   * @returns {Promise<string>} AI response text
   */
  const askGemini = useCallback(async (prompt, systemPrompt = '', customSettings = null) => {
    let keyToUse = apiKey
    let typeToUse = apiType
    let urlToUse = baseUrl
    let modelToUse = detectedModel

    if (customSettings) {
      if (typeof customSettings === 'string') {
        keyToUse = customSettings
      } else {
        keyToUse = customSettings.apiKey ?? apiKey
        typeToUse = customSettings.apiType ?? apiType
        urlToUse = customSettings.baseUrl ?? baseUrl
        modelToUse = customSettings.modelName ?? detectedModel
      }
    }

    if (!keyToUse) throw new Error('NO_KEY')

    const normalizedBaseUrl = urlToUse.replace(/\/+$/, '')
    const isCustomUrl = urlToUse !== 'https://generativelanguage.googleapis.com'
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    // Gunakan proxy di produksi untuk custom URL guna mengatasi CORS
    const useProxy = isCustomUrl && !isLocalhost

    if (useProxy) {
      const proxyBody = {
        targetUrl: typeToUse === 'gemini'
          ? `${normalizedBaseUrl}/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`
          : `${normalizedBaseUrl}/chat/completions`,
        method: 'POST',
        headers: typeToUse === 'gemini'
          ? { 'Content-Type': 'application/json' }
          : {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${keyToUse}`
            },
        body: typeToUse === 'gemini'
          ? {
              system_instruction: systemPrompt
                ? { parts: [{ text: systemPrompt }] }
                : undefined,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
            }
          : {
              model: modelToUse,
              messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 2048
            }
      }

      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyBody)
      })

      if (!response.ok) {
        let errMsg = 'Gagal menghubungi AI via Proxy'
        try {
          const err = await response.json()
          errMsg = err.error?.message || err.message || errMsg
        } catch (_) {
          errMsg = `${response.status} ${response.statusText}`
        }
        throw new Error(errMsg)
      }

      const data = await response.json()
      if (typeToUse === 'gemini') {
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Tidak ada respons)'
      } else {
        return data.choices?.[0]?.message?.content || '(Tidak ada respons)'
      }
    }

    // Direct Browser Calls (for official Gemini or local development)
    if (typeToUse === 'gemini') {
      const response = await fetch(
        `${normalizedBaseUrl}/v1beta/models/${modelToUse}:generateContent?key=${keyToUse}`,
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
    } else {
      // OpenAI Compatible
      const response = await fetch(
        `${normalizedBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keyToUse}`
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2048
          })
        }
      )

      if (!response.ok) {
        let errMsg = 'Gagal menghubungi AI'
        try {
          const err = await response.json()
          errMsg = err.error?.message || err.message || errMsg
        } catch (_) {
          errMsg = `${response.status} ${response.statusText}`
        }
        throw new Error(errMsg)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || '(Tidak ada respons)'
    }
  }, [apiKey, apiType, baseUrl, detectedModel])

  return (
    <AIContext.Provider value={{
      apiKey,
      baseUrl,
      apiType,
      modelName: detectedModel,
      hasKey,
      saveApiKey,
      saveSettings,
      clearApiKey,
      askGemini,
      chatOpen,
      setChatOpen,
      initialPrompt,
      setInitialPrompt,
      askWithContext
    }}>
      {children}
    </AIContext.Provider>
  )
}

export const useAI = () => {
  const ctx = useContext(AIContext)
  if (!ctx) throw new Error('useAI must be used inside <AIProvider>')
  return ctx
}
