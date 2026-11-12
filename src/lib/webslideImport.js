// Impor file HTML WebSlide (kerangka SYSTRACT, hasil "Unduh File HTML") kembali
// menjadi data slide yang dipakai pemutar SPA peserta (materials.webslide_content).
//
// Mengenali dua format: bagian bergaya Pitch Deck (src/lib/spaBlocks.js, atribut data-f/data-k)
// dan deck slide lama. Teks melewati penyaring safeHtml: hanya <strong>/<em>/<b>/<i>/<br> yang
// dipertahankan, skrip dan atribut lain dibuang, URL media hanya http(s).

import { sanitizeInline } from './safeHtml.js'
import { JENIS_SLIDE, urlVideoValid } from './sisipSlide.js'

export class WebSlideImportError extends Error {}

const LAYOUTS = ['cover', 'statement', 'list', 'grid', 'split', 'steps', 'stats', 'table', 'accordion', 'discussion', 'quiz', 'media', 'thank_you', 'legacy']
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
const text = (el) => clean(el?.textContent)

// Kebalikan dari renderHtmlMedia di template: iframe YouTube → tautan YouTube biasa.
// Hanya alamat http(s) yang diterima (mencegah javascript:/data: ikut tersimpan).
const httpOnly = (url) => (/^https?:\/\//i.test(url || '') ? url : '')

function mediaUrl(col) {
  if (!col) return ''
  const iframe = col.querySelector('iframe[src]')
  if (iframe) {
    const src = iframe.getAttribute('src')
    const m = src.match(/youtube\.com\/embed\/([^?&#/]{11})/)
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : httpOnly(src)
  }
  const video = col.querySelector('video[src]')
  if (video) return httpOnly(video.getAttribute('src'))
  const img = col.querySelector('img[src]')
  return img ? httpOnly(img.getAttribute('src')) : ''
}

function detectLayout(slideEl) {
  const explicit = slideEl.getAttribute('data-layout')
  if (LAYOUTS.includes(explicit)) return explicit
  if (slideEl.querySelector('.slide-layout-cover-grid')) return 'cover'
  if (slideEl.querySelector('.cover-content')) return 'thank_you'
  if (slideEl.querySelector('.webslide-split-stacked')) return 'split'
  if (slideEl.querySelector('.grid-2-col, .grid-2x2')) return 'grid'
  if (slideEl.querySelector('.table-wrapper table')) return 'table'
  if (slideEl.querySelector('.accordion-container')) return 'accordion'
  if (slideEl.querySelector('.content-list .accent-card')) return 'list'
  if (slideEl.querySelector('.content-list .content-item')) return 'legacy'
  return 'legacy'
}

function parseSlide(slideEl, idx) {
  const layout = detectLayout(slideEl)
  const slide = { slide_no: idx + 1, layout }

  const h2 = slideEl.querySelector('.slide-title')
  if (h2) slide.title = text(h2)

  const imgCol = slideEl.querySelector('.slide-image-col')
  const image = mediaUrl(imgCol)
  if (image) slide.image_url = image

  const ref = slideEl.querySelector('.slide-reference-footer span')
  if (ref) slide.reference = text(ref).replace(/^Rujukan:\s*/i, '')

  if (layout === 'cover') {
    const h1 = slideEl.querySelector('.slide-layout-cover-grid h1')
    const span = h1?.querySelector('span')
    if (span) slide.title = text(span)
    if (h1) {
      // Teks sebelum <br> adalah subjudul (nama kursus).
      const sub = Array.from(h1.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
      if (clean(sub)) slide.subtitle = clean(sub)
    }
    const p = slideEl.querySelector('.slide-content-col > p')
    if (p) slide.description = text(p)
  } else if (layout === 'thank_you') {
    slide.title = slide.title || 'Terima Kasih'
    const p = slideEl.querySelector('.cover-content p')
    if (p) slide.description = text(p)
  } else if (layout === 'split') {
    const card = slideEl.querySelector('.webslide-split-stacked .accent-card')
    slide.split_left = {
      heading: text(card?.querySelector('h3')),
      description: text(card?.querySelector('p')),
    }
    slide.split_right = Array.from(slideEl.querySelectorAll('.webslide-split-right-points p')).map(text).filter(Boolean)
  } else if (layout === 'grid') {
    slide.grid_items = Array.from(slideEl.querySelectorAll('.tile')).map((t) => {
      const icon = t.querySelector('i')?.getAttribute('class') || ''
      return {
        icon: /^fa-[\w-]+( fa-[\w-]+)*$/.test(icon) ? icon : 'fa-solid fa-lightbulb',
        title: text(t.querySelector('h3')),
        desc: text(t.querySelector('p')),
      }
    }).filter((g) => g.title || g.desc)
  } else if (layout === 'list') {
    slide.list_items = Array.from(slideEl.querySelectorAll('.content-list .accent-card')).map((c) => {
      const color = (c.getAttribute('class') || '').match(/accent-(blue|green|amber|red)\b/) // warna yang diizinkan prompt AI & template
      return { text: text(c.querySelector('p') || c), color: color ? color[1] : 'blue' }
    }).filter((l) => l.text)
  } else if (layout === 'table') {
    const table = slideEl.querySelector('.table-wrapper table')
    slide.table_data = {
      headers: Array.from(table.querySelectorAll('thead th')).map(text),
      rows: Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map(text)),
    }
  } else if (layout === 'accordion') {
    slide.accordion_items = Array.from(slideEl.querySelectorAll('details.accordion-item')).map((d) => ({
      header: text(d.querySelector('summary span') || d.querySelector('summary')),
      content: text(d.querySelector('.accordion-content')),
    })).filter((a) => a.header || a.content)
  } else {
    // Format lama (poin bercentang) disimpan sebagai daftar agar dirender pemutar.
    slide.layout = 'list'
    slide.list_items = Array.from(slideEl.querySelectorAll('.content-list .item-text'))
      .map((el) => ({ text: text(el), color: 'blue' }))
      .filter((l) => l.text)
  }

  return slide
}

// Poin teks per bagian untuk outline (langkah 1 di modal instruktur). Teks polos, tanpa tag.
function outlinePoints(s, toPlain) {
  const p = (v) => toPlain(v)
  const pair = (a, b) => [p(a), p(b)].filter(Boolean).join(': ')
  switch (s.layout) {
    case 'cover': case 'thank_you': return [p(s.subtitle), p(s.description)].filter(Boolean)
    case 'statement': return [p(s.body), ...(s.facts || []).map((f) => `${p(f.value)} — ${p(f.label)}`)].filter(Boolean)
    case 'split': return [s.split_left?.heading && pair(s.split_left.heading, s.split_left.description), ...(s.split_right || []).map(p)].filter(Boolean)
    case 'grid': return (s.grid_items || []).map((g) => pair(g.title, g.desc))
    case 'list': return (s.list_items || []).map((l) => p(l.text))
    case 'steps': return (s.steps || []).map((st) => pair(st.title, st.body))
    case 'stats': return (s.stats || []).map((st) => [p(st.value), p(st.label), p(st.note)].filter(Boolean).join(' — '))
    case 'table': return (s.table_data?.rows || []).map((r) => r.map(p).join(' — '))
    case 'accordion': return (s.accordion_items || []).map((a) => pair(a.header, a.content))
    case 'discussion': return (s.discussion_items || []).map((d) => `Pertanyaan: ${p(d.question)}${d.hint ? ` Petunjuk: ${p(d.hint)}` : ''}`)
    case 'quiz': return (s.quiz_items || []).map((q) => `Soal: ${p(q.question)} Jawaban: ${p((q.options || [])[q.answer])}${q.explanation ? `. ${p(q.explanation)}` : ''}`)
    case 'media': return [p(s.caption), p(s.description)].filter(Boolean)
    default: return (s.content || []).map(p)
  }
}

// ── Format baru: bagian bergaya Pitch Deck dari src/lib/spaBlocks.js ──────────
// Setiap teks ditandai data-f="path", nilai non-teks dengan data-k="path" data-v="nilai".

function setPath(obj, path, value) {
  const keys = path.split('.')
  let cur = obj
  keys.forEach((k, i) => {
    const last = i === keys.length - 1
    const nextIsIndex = !last && /^\d+$/.test(keys[i + 1])
    if (last) { cur[k] = value; return }
    if (cur[k] === undefined) cur[k] = nextIsIndex ? [] : {}
    cur = cur[k]
  })
}

const SAFE_PATH = /^[a-z_]+(\.(\d{1,3}|[a-z_]+)){0,3}$/

function parseSxSection(sec, idx, Parser) {
  const layoutAttr = sec.getAttribute('data-layout')
  const slide = { slide_no: idx + 1, layout: LAYOUTS.includes(layoutAttr) ? layoutAttr : 'legacy' }
  const own = (el) => el.closest('.sx-sec') === sec
  sec.querySelectorAll('[data-f]').forEach((el) => {
    const path = el.getAttribute('data-f')
    if (!own(el) || !SAFE_PATH.test(path)) return
    // Pertahankan format ringan (<strong>/<em>/…); penyaring membuang sisanya.
    setPath(slide, path, sanitizeInline(el.innerHTML.replace(/\s+/g, ' ').trim(), Parser))
  })
  sec.querySelectorAll('[data-k]').forEach((el) => {
    const path = el.getAttribute('data-k')
    if (!own(el) || !SAFE_PATH.test(path)) return
    const raw = el.getAttribute('data-v') || ''
    setPath(slide, path, el.getAttribute('data-t') === 'n' ? Number(raw) : raw)
  })
  // Rapikan larik yang berlubang (mis. butir yang dihapus saat diedit).
  for (const [k, v] of Object.entries(slide)) {
    if (Array.isArray(v)) slide[k] = v.filter((x) => x !== undefined)
  }
  if (slide.table_data?.rows) slide.table_data.rows = slide.table_data.rows.filter(Boolean).map((r) => r.filter((c) => c !== undefined))
  return slide
}

/**
 * @param {string} html  isi file HTML
 * @param {typeof DOMParser} [Parser]  disuntikkan saat diuji di luar browser
 * @returns {{ webslide: object, outline: object }}
 */
export function parseWebSlideHtml(html, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html')
  // Isi skrip/gaya bukan konten materi; buang agar tidak terbaca sebagai teks.
  doc.querySelectorAll('script, style, noscript, template').forEach((el) => el.remove())
  const toPlain = (v) => {
    if (!v) return ''
    return clean(new Parser().parseFromString(`<!doctype html><html><body>${v}</body></html>`, 'text/html').body.textContent)
  }

  let slides
  let title
  const sxSections = Array.from(doc.querySelectorAll('section.sx-sec'))
  if (sxSections.length > 0) {
    slides = sxSections.map((sec, i) => parseSxSection(sec, i, Parser))
    const t = doc.querySelector('[data-f="deck.title"]')
    title = t ? sanitizeInline(t.innerHTML.replace(/\s+/g, ' ').trim(), Parser) : ''
  } else {
    // Format lama (deck slide 16:9 sebelum gaya Pitch Deck).
    const slideEls = Array.from(doc.querySelectorAll('.slide'))
      .filter((el) => /^slide\d+$/.test(el.getAttribute('id') || ''))
    if (slideEls.length === 0) {
      throw new WebSlideImportError('File ini tidak memakai kerangka WebSlide SYSTRACT. Gunakan file dari "Unduh File HTML" sebagai dasar.')
    }
    // Slide penutup lama ditambahkan otomatis oleh template lama; jangan ikut disimpan.
    slides = slideEls.map(parseSlide).filter((s) => s.layout !== 'thank_you')
  }

  if (!title) {
    const cover = slides.find((s) => s.layout === 'cover')
    const docTitle = clean(doc.querySelector('title')?.textContent)
    title = cover?.title || docTitle.replace(/^WebSlide\s*-\s*/i, '').split(' - ')[0] || 'Materi'
  }
  slides.forEach((s, i) => { s.slide_no = i + 1 })

  return {
    webslide: { title, slides },
    outline: {
      title: toPlain(title),
      slides: slides.map((s) => ({
        slide_no: s.slide_no,
        title: toPlain(s.title) || `Bagian ${s.slide_no}`,
        content: outlinePoints(s, toPlain),
        ...(s.image_url ? { image_url: s.image_url } : {}),
        // Bagian "media" yang berisi video dikembalikan sebagai slide video.
        ...(s.layout === 'media' && urlVideoValid(s.image_url) ? { jenis: JENIS_SLIDE.video } : {}),
      })),
    },
  }
}
