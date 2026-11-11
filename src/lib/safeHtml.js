// Penyaring HTML untuk teks slide (hasil AI, editan instruktur, atau impor).
//
// Hanya penanda format ringan yang dipertahankan: <strong>, <em>, <b>, <i>, <br>.
// Tag lain dibuang (isinya tetap sebagai teks), semua atribut dihapus, dan
// <script>/<style>/<iframe> dkk. dibuang beserta isinya. Hasilnya aman dipakai
// sebagai innerHTML / dangerouslySetInnerHTML maupun ditulis ke file HTML.

const ALLOWED = new Set(['strong', 'em', 'b', 'i', 'br'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select'])

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function walk(node, out) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push(escapeHtml(child.textContent))
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase()
      if (DROP_WITH_CONTENT.has(tag)) continue
      if (tag === 'br') { out.push('<br>'); continue }
      if (ALLOWED.has(tag)) {
        out.push(`<${tag}>`)
        walk(child, out)
        out.push(`</${tag}>`)
      } else {
        walk(child, out)
      }
    }
  }
}

/** @param {unknown} value  @param {typeof DOMParser} [Parser] */
export function sanitizeInline(value, Parser = globalThis.DOMParser) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (!/[<>&"']/.test(str)) return str
  if (!Parser) return escapeHtml(str)
  const doc = new Parser().parseFromString(`<!doctype html><html><head></head><body>${str}</body></html>`, 'text/html')
  const out = []
  walk(doc.body, out)
  return out.join('')
}

/** Hanya URL http(s); karakter yang bisa keluar dari atribut ikut di-encode. */
export function sanitizeUrl(url) {
  const s = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(s)) return ''
  return s.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\s/g, '%20')
}

const LAYOUTS = ['cover', 'thank_you', 'split', 'grid', 'list', 'table', 'accordion', 'legacy']
const COLORS = ['red', 'amber', 'green', 'blue']
const ICON_RE = /^fa-[a-z0-9-]+( fa-[a-z0-9-]+){0,3}$/

/**
 * Salinan data slide yang aman untuk ditulis sebagai HTML (template ekspor).
 * Jangan dipakai sebelum render teks biasa di React: entitas (&amp;) akan tampil apa adanya.
 */
export function sanitizeSlideData(data, Parser = globalThis.DOMParser) {
  const clean = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => clean(x, key))
    if (v && typeof v === 'object') {
      const o = {}
      for (const [k, x] of Object.entries(v)) o[k] = clean(x, k)
      return o
    }
    if (typeof v !== 'string') return v
    if (key === 'image_url') return sanitizeUrl(v)
    if (key === 'icon') return ICON_RE.test(v) ? v : 'fa-solid fa-lightbulb'
    if (key === 'color') return COLORS.includes(v) ? v : 'blue'
    if (key === 'layout') return LAYOUTS.includes(v) ? v : 'legacy'
    return sanitizeInline(v, Parser)
  }
  return data ? clean(data, '') : data
}
