// Impor file HTML WebSlide (kerangka SYSTRACT, hasil "Unduh File HTML") kembali
// menjadi data slide yang dipakai pemutar SPA peserta (materials.webslide_content).
//
// Hanya kerangka buatan src/lib/webslideTemplate.js yang dikenali. Semua isi dibaca
// sebagai teks biasa (textContent), sehingga skrip atau markup di dalam file tidak
// ikut tersimpan atau dijalankan di browser peserta.

export class WebSlideImportError extends Error {}

const LAYOUTS = ['cover', 'thank_you', 'split', 'grid', 'list', 'table', 'accordion', 'legacy']
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

// Poin teks per slide untuk outline (langkah 1 di modal instruktur).
function outlinePoints(s) {
  switch (s.layout) {
    case 'cover': case 'thank_you': return [s.description].filter(Boolean)
    case 'split': return [s.split_left?.heading && `${s.split_left.heading}: ${s.split_left.description}`, ...(s.split_right || [])].filter(Boolean)
    case 'grid': return (s.grid_items || []).map((g) => [g.title, g.desc].filter(Boolean).join(': '))
    case 'list': return (s.list_items || []).map((l) => l.text)
    case 'table': return (s.table_data?.rows || []).map((r) => r.join(' — '))
    case 'accordion': return (s.accordion_items || []).map((a) => [a.header, a.content].filter(Boolean).join(': '))
    default: return s.content || []
  }
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
  const slideEls = Array.from(doc.querySelectorAll('.slide'))
    .filter((el) => /^slide\d+$/.test(el.getAttribute('id') || ''))

  if (slideEls.length === 0) {
    throw new WebSlideImportError('File ini tidak memakai kerangka WebSlide SYSTRACT. Gunakan file dari "Unduh File HTML" sebagai dasar.')
  }

  const slides = slideEls.map(parseSlide)
  const docTitle = clean(doc.querySelector('title')?.textContent)
  const cover = slides.find((s) => s.layout === 'cover')
  const title = cover?.title || docTitle.replace(/^WebSlide\s*-\s*/i, '') || 'Materi'

  // Slide penutup selalu ditambahkan otomatis oleh pemutar; jangan disimpan ganda.
  const isi = slides.filter((s) => s.layout !== 'thank_you')
  isi.forEach((s, i) => { s.slide_no = i + 1 })

  return {
    webslide: { title, slides: isi },
    outline: {
      title,
      slides: isi.map((s) => ({
        slide_no: s.slide_no,
        title: s.title || `Slide ${s.slide_no}`,
        content: outlinePoints(s),
        ...(s.image_url ? { image_url: s.image_url } : {}),
      })),
    },
  }
}
