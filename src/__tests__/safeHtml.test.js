import { describe, it, expect } from 'vitest'
import { escapeHtml, sanitizeInline, sanitizeUrl, sanitizeSlideData } from '@/lib/safeHtml'

describe('escapeHtml', () => {
  it('meng-escape karakter HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
  it('null/undefined menjadi string kosong', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('sanitizeInline', () => {
  it('mempertahankan format ringan', () => {
    expect(sanitizeInline('<strong>tebal</strong> dan <em>miring</em><br>')).toBe('<strong>tebal</strong> dan <em>miring</em><br>')
  })
  it('membuang script beserta isinya', () => {
    expect(sanitizeInline('aman<script>alert(1)</script>')).toBe('aman')
  })
  it('membuang atribut berbahaya tetapi menyimpan teks', () => {
    expect(sanitizeInline('<b onclick="x()">klik</b><img src=x onerror=alert(1)>')).toBe('<b>klik</b>')
  })
  it('tag lain dibuang, isinya tetap', () => {
    expect(sanitizeInline('<div><a href="javascript:x">tautan</a></div>')).toBe('tautan')
  })
  it('teks biasa dikembalikan apa adanya', () => {
    expect(sanitizeInline('Halo dunia')).toBe('Halo dunia')
  })
})

describe('sanitizeUrl', () => {
  it('hanya menerima http(s)', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeUrl('data:text/html,x')).toBe('')
    expect(sanitizeUrl('https://contoh.id/a b')).toBe('https://contoh.id/a%20b')
  })
  it('meng-encode karakter yang bisa keluar dari atribut', () => {
    expect(sanitizeUrl('https://x.id/"><script>')).toBe('https://x.id/%22%3E%3Cscript%3E')
  })
})

describe('sanitizeSlideData', () => {
  it('membersihkan seluruh pohon data slide', () => {
    const out = sanitizeSlideData({
      layout: 'tidak-dikenal', color: 'ungu', icon: 'fa-solid fa-x" onload="x',
      image_url: 'javascript:x', title: 'Judul<script>x</script>',
      items: [{ text: '<i>ok</i><iframe src=x></iframe>' }],
    })
    expect(out).toEqual({
      layout: 'legacy', color: 'blue', icon: 'fa-solid fa-lightbulb',
      image_url: '', title: 'Judul', items: [{ text: '<i>ok</i>' }],
    })
  })
})
