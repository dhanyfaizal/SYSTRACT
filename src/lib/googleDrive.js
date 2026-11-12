/**
 * Google Drive Integration Helper
 * Requires: VITE_GOOGLE_CLIENT_ID + VITE_GOOGLE_API_KEY in .env
 *
 * Usage:
 *   import { openDrivePicker, uploadToDrive } from '@/lib/googleDrive'
 *
 *   // Let user pick an existing file from their Drive
 *   const file = await openDrivePicker()
 *   // Returns: { id, name, mimeType, webViewLink, webContentLink }
 *
 *   // Upload a new file (File object) to a specific Drive folder
 *   const result = await uploadToDrive(file, folderId, accessToken)
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY

let tokenClient   = null
let _pickerInited = false
let accessToken   = null

// ── Load the Google Identity Services script ──────────────────────────────
function loadGisScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts) return resolve()
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = resolve
    document.body.appendChild(script)
  })
}

// ── Load the Google Picker API script ────────────────────────────────────
function loadPickerScript() {
  return new Promise((resolve) => {
    if (window.google?.picker) return resolve()
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi.load('picker', () => {
        _pickerInited = true
        resolve()
      })
    }
    document.body.appendChild(script)
  })
}

// ── Obtain an OAuth2 access token via GIS ────────────────────────────────
async function getAccessToken() {
  if (accessToken) return accessToken

  await loadGisScript()

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) return reject(response)
        accessToken = response.access_token
        // Token expires in ~1h — reset so we re-request next time
        setTimeout(() => { accessToken = null }, (response.expires_in - 60) * 1000)
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken()
  })
}

// ── Open Drive Picker — returns selected file metadata ───────────────────
export async function openDrivePicker() {
  if (!CLIENT_ID || !API_KEY) {
    throw new Error('Google Drive belum dikonfigurasi. Hubungi administrator.')
  }

  await loadPickerScript()
  const token = await getAccessToken()

  return new Promise((resolve, reject) => {
    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.DOCS)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0]
          resolve({
            id:             doc.id,
            name:           doc.name,
            mimeType:       doc.mimeType,
            webViewLink:    doc.url,
            webContentLink: `https://drive.google.com/uc?id=${doc.id}&export=download`,
          })
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('Picker dibatalkan'))
        }
      })
      .build()
    picker.setVisible(true)
  })
}

// ── Upload a File to Google Drive (multipart upload) ─────────────────────
export async function uploadToDrive(file, folderId = null) {
  if (!CLIENT_ID) {
    throw new Error('Google Drive belum dikonfigurasi. Hubungi administrator.')
  }

  const token = await getAccessToken()

  const metadata = {
    name: file.name,
    mimeType: file.type,
    ...(folderId ? { parents: [folderId] } : {}),
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  )

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || 'Upload ke Drive gagal')
  }

  return response.json()
  // Returns: { id, name, mimeType, webViewLink, webContentLink }
}

// ── Create a Drive folder ────────────────────────────────────────────────
export async function createDriveFolder(name, parentFolderId = null) {
  const token = await getAccessToken()

  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentFolderId ? { parents: [parentFolderId] } : {}),
  }

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    }
  )

  if (!response.ok) throw new Error('Gagal membuat folder di Drive')
  return response.json()
}
