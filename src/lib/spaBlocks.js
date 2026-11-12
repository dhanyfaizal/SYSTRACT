// Renderer blok SPA bergaya Pitch Deck (WebSlide) — satu sumber untuk:
//   - pemutar peserta (WebSlidePlayer, lewat dangerouslySetInnerHTML)
//   - ekspor HTML ("Buka di tab baru" / "Unduh File HTML", lewat webslideTemplate)
//   - impor HTML (webslideImport membaca kembali atribut data-f / data-k / data-v)
//
// Tampilan dokumen yang bisa digulir dan responsif (bukan kanvas 16:9), dengan palet,
// tipografi, dan bentuk kartu dari Pitch Deck. Quiz dan akordion tidak memerlukan JavaScript
// (radio + CSS :has, dan <details>), sehingga tetap berfungsi di file HTML hasil ekspor.
//
// Semua teks harus sudah melewati prepareDeck() (penyaring safeHtml) sebelum dirender.

import { sanitizeSlideData, escapeHtml } from './safeHtml.js'

export const SPA_LAYOUTS = [
  'cover', 'statement', 'list', 'grid', 'split', 'steps', 'stats', 'table',
  'accordion', 'discussion', 'quiz', 'media', 'thank_you', 'legacy',
]

export const SPA_LAYOUT_LABELS = {
  cover: 'Sampul', statement: 'Pernyataan', list: 'Daftar poin', grid: 'Kartu konsep',
  split: 'Dua kolom', steps: 'Langkah', stats: 'Angka kunci', table: 'Tabel perbandingan',
  accordion: 'Akordion', discussion: 'Diskusi', quiz: 'Latihan (quiz)', media: 'Gambar/Video',
  thank_you: 'Penutup', legacy: 'Daftar poin',
}

export const SPA_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'

const arr = (v, max = 12) => (Array.isArray(v) ? v.slice(0, max) : [])
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''
const attr = (v) => escapeHtml(v ?? '')

/** Salinan data yang sudah disaring dan dinormalkan, siap dirender sebagai HTML. */
export function prepareDeck(slideData, Parser) {
  const data = sanitizeSlideData(slideData || {}, Parser) || {}
  const slides = arr(data.slides, 200).map((s, i) => {
    const slide = { ...s }
    if (!SPA_LAYOUTS.includes(slide.layout)) slide.layout = i === 0 && !slide.layout ? 'cover' : 'legacy'
    return slide
  })
  return { ...data, slides }
}

/* ---------------------------------- Media ---------------------------------- */

export function youtubeId(url = '') {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// Asal halaman untuk YouTube IFrame API (wajib agar pemutar bisa dikendalikan dari halaman).
const asalHalaman = () => {
  const o = typeof window !== 'undefined' ? window.location?.origin : ''
  return o && /^https?:/.test(o) ? `&origin=${encodeURIComponent(o)}` : ''
}

/**
 * @param {{ soal?: object[], idx?: number }} [vi]  video interaktif: soal yang menjeda video
 */
function figure(url, path = 'image_url', caption = '', capPath = '', vi = null) {
  if (!has(url)) return ''
  const id = youtubeId(url)
  const interaktif = vi && Array.isArray(vi.soal) && vi.soal.length > 0
  // data-vi menandai media yang dipasangi soal oleh pemutar peserta (src/lib/videoInteraktif.js).
  const tanda = interaktif ? ` data-vi="${vi.idx}"` : ''
  let inner
  if (id) {
    const param = interaktif ? `rel=0&enablejsapi=1&fs=0&disablekb=1&playsinline=1${asalHalaman()}` : 'rel=0'
    inner = `<div class="sx-video"><iframe${tanda} src="https://www.youtube.com/embed/${id}?${param}" title="Video materi" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture${interaktif ? '' : '; fullscreen'}"${interaktif ? '' : ' allowfullscreen'}></iframe></div>`
  } else if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) {
    inner = `<video${tanda} class="sx-video-file" src="${attr(url)}" controls preload="metadata"${interaktif ? ' controlslist="nodownload noplaybackrate" disablepictureinpicture' : ''}></video>`
  } else {
    inner = `<img class="sx-img" src="${attr(url)}" alt="" loading="lazy" />`
  }
  const cap = capPath ? `<figcaption data-f="${capPath}">${caption || ''}</figcaption>` : ''
  // Soal ikut disimpan (JSON) agar file HTML hasil ekspor bisa diimpor kembali utuh.
  const dataSoal = interaktif ? `<span hidden data-k="soal_video" data-t="j" data-v="${attr(JSON.stringify(vi.soal))}"></span>` : ''
  return `<figure class="sx-fig" data-k="${path}" data-v="${attr(url)}">${inner}${cap}${dataSoal}</figure>`
}

/* ---------------------------------- Ikon ---------------------------------- */

const ICON_CHECK = '<svg class="sx-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_CROSS = '<svg class="sx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
const ICON_DASH = '<svg class="sx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'

function markFor(cell) {
  const v = String(cell || '').replace(/<[^>]+>/g, '').trim().toLowerCase()
  if (['ya', 'yes', '✓', 'v', 'ada', 'benar'].includes(v)) return `<span class="sx-mark is-yes">${ICON_CHECK}</span>`
  if (['tidak', 'no', '✗', 'x', 'tidak ada', 'salah'].includes(v)) return `<span class="sx-mark is-no">${ICON_CROSS}</span>`
  if (['sebagian', 'partial', 'terbatas', '–', '-'].includes(v)) return `<span class="sx-mark is-part">${ICON_DASH}</span>`
  return ''
}

/* ---------------------------------- Bagian ---------------------------------- */

function head(slide, n, defaultEyebrow) {
  const eyebrow = has(slide.eyebrow)
    ? `<p class="sx-eyebrow" data-f="eyebrow">${slide.eyebrow}</p>`
    : `<p class="sx-eyebrow">${defaultEyebrow || `Bagian ${n}`}</p>`
  const sub = has(slide.subtitle) ? `<p class="sx-sub" data-f="subtitle">${slide.subtitle}</p>` : ''
  return `<header class="sx-head">${eyebrow}<h2 class="sx-title" data-f="title">${slide.title || ''}</h2>${sub}</header>`
}

const checklist = (items, base, textKey) => `<ul class="sx-check">${items.map((it, i) => {
  const text = textKey ? it?.[textKey] : it
  const path = textKey ? `${base}.${i}.${textKey}` : `${base}.${i}`
  const color = textKey && it?.color ? ` data-k="${base}.${i}.color" data-v="${attr(it.color)}"` : ''
  return `<li${color}>${ICON_CHECK}<span data-f="${path}">${text || ''}</span></li>`
}).join('')}</ul>`

const BODY = {
  statement(s) {
    const facts = arr(s.facts, 3)
    return `${has(s.body) ? `<p class="sx-lead" data-f="body">${s.body}</p>` : ''}${facts.length ? `<div class="sx-facts">${facts.map((f, i) => `<div class="sx-fact"><span class="sx-fact-v" data-f="facts.${i}.value">${f?.value || ''}</span><span class="sx-fact-l" data-f="facts.${i}.label">${f?.label || ''}</span></div>`).join('')}</div>` : ''}`
  },
  list: (s) => checklist(arr(s.list_items), 'list_items', 'text'),
  legacy: (s) => checklist(arr(s.content), 'content'),
  grid(s) {
    return `<div class="sx-cards">${arr(s.grid_items, 6).map((g, i) => `<div class="sx-card">${g?.icon ? `<i class="${attr(g.icon)} sx-card-ic" data-k="grid_items.${i}.icon" data-v="${attr(g.icon)}" aria-hidden="true"></i>` : ''}<h3 data-f="grid_items.${i}.title">${g?.title || ''}</h3><p data-f="grid_items.${i}.desc">${g?.desc || ''}</p></div>`).join('')}</div>`
  },
  split(s) {
    const l = s.split_left || {}
    return `<div class="sx-split"><div class="sx-card sx-accent"><h3 data-f="split_left.heading">${l.heading || ''}</h3><p data-f="split_left.description">${l.description || ''}</p></div>${checklist(arr(s.split_right), 'split_right')}</div>`
  },
  steps(s) {
    return `<ol class="sx-steps">${arr(s.steps, 6).map((st, i) => `<li class="sx-card"><span class="sx-step-n">${i + 1}</span><h3 data-f="steps.${i}.title">${st?.title || ''}</h3><p data-f="steps.${i}.body">${st?.body || ''}</p></li>`).join('')}</ol>`
  },
  stats(s) {
    return `<div class="sx-cards sx-stats">${arr(s.stats, 4).map((st, i) => `<div class="sx-card"><span class="sx-stat-v" data-f="stats.${i}.value">${st?.value || ''}</span><span class="sx-stat-l" data-f="stats.${i}.label">${st?.label || ''}</span>${has(st?.note) ? `<span class="sx-stat-n" data-f="stats.${i}.note">${st.note}</span>` : ''}</div>`).join('')}</div>`
  },
  table(s) {
    const t = s.table_data || {}
    const headers = arr(t.headers, 6)
    const rows = arr(t.rows, 12)
    return `<div class="sx-table-wrap"><table class="sx-table"><thead><tr>${headers.map((h, i) => `<th data-f="table_data.headers.${i}">${h || ''}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr>${arr(r, 6).map((c, ci) => `<td>${markFor(c)}<span data-f="table_data.rows.${ri}.${ci}">${c || ''}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  },
  accordion(s) {
    return `<div class="sx-acc-list">${arr(s.accordion_items).map((a, i) => `<details class="sx-acc"><summary><span data-f="accordion_items.${i}.header">${a?.header || ''}</span></summary><div class="sx-acc-body"><p data-f="accordion_items.${i}.content">${a?.content || ''}</p></div></details>`).join('')}</div>`
  },
  discussion(s) {
    return `<p class="sx-note">Renungkan setiap pertanyaan sebelum melanjutkan. Buka untuk melihat petunjuk berpikir.</p><div class="sx-acc-list">${arr(s.discussion_items).map((d, i) => `<details class="sx-acc sx-disc"><summary><span class="sx-q-badge">${i + 1}</span><span data-f="discussion_items.${i}.question">${d?.question || ''}</span></summary><div class="sx-acc-body"><p class="sx-hint-l">Petunjuk berpikir</p><p data-f="discussion_items.${i}.hint">${d?.hint || ''}</p></div></details>`).join('')}</div>`
  },
  quiz(s, n) {
    const letters = 'ABCDEF'
    return `<p class="sx-note">Latihan mandiri: pilih jawaban untuk melihat pembahasan. Tidak memengaruhi nilai.</p><div class="sx-quiz">${arr(s.quiz_items).map((q, qi) => {
      const opts = arr(q?.options, 6)
      const ans = Number.isInteger(q?.answer) && q.answer >= 0 && q.answer < opts.length ? q.answer : 0
      return `<div class="sx-q" data-k="quiz_items.${qi}.answer" data-v="${ans}" data-t="n"><p class="sx-q-text"><span class="sx-q-badge">${qi + 1}</span><span data-f="quiz_items.${qi}.question">${q?.question || ''}</span></p><div class="sx-opts">${opts.map((o, oi) => `<label class="sx-opt${oi === ans ? ' is-correct' : ''}"><input type="radio" name="sxq-${n}-${qi}" /><span class="sx-opt-l">${letters[oi]}</span><span data-f="quiz_items.${qi}.options.${oi}">${o || ''}</span></label>`).join('')}</div><div class="sx-fb"><p class="sx-fb-ok">Benar.</p><p class="sx-fb-no">Belum tepat. Jawaban yang benar ditandai hijau.</p>${has(q?.explanation) ? `<p data-f="quiz_items.${qi}.explanation">${q.explanation}</p>` : ''}</div></div>`
    }).join('')}</div>`
  },
}

// Layout yang menampilkan gambar/video di samping teks (layar lebar) atau di bawahnya (ponsel).
const SIDE_MEDIA = new Set(['statement', 'list', 'legacy', 'split', 'steps', 'stats', 'grid'])

/**
 * @param {object} slide  satu bagian dari prepareDeck()
 * @param {number} idx    indeks 0-based
 * @param {{meetingNo?: string|number, courseName?: string}} ctx
 */
export function renderSection(slide, idx, ctx = {}) {
  const n = idx + 1
  const layout = slide.layout
  const open = `<section class="sx-sec sx-l-${layout}" id="sx-sec-${idx}" data-layout="${layout}">`
  const ref = has(slide.reference) ? `<p class="sx-ref">Rujukan: <span data-f="reference">${slide.reference}</span></p>` : ''

  if (layout === 'cover') {
    return `${open}<div class="sx-cover-in"><p class="sx-eyebrow">Pertemuan ${attr(ctx.meetingNo ?? '')}</p><span class="sx-bar"></span><h1 class="sx-cover-title" data-f="title">${slide.title || ''}</h1>${has(slide.subtitle) ? `<p class="sx-cover-sub" data-f="subtitle">${slide.subtitle}</p>` : ''}${has(slide.description) ? `<p class="sx-cover-desc" data-f="description">${slide.description}</p>` : ''}</div>${figure(slide.image_url)}</section>`
  }
  if (layout === 'thank_you') {
    return `${open}<h2 class="sx-title" data-f="title">${slide.title || 'Penutup'}</h2>${has(slide.description) ? `<p class="sx-lead" data-f="description">${slide.description}</p>` : ''}</section>`
  }
  if (layout === 'media') {
    const vi = Array.isArray(slide.soal_video) && slide.soal_video.length ? { soal: slide.soal_video, idx } : null
    return `${open}${head(slide, n, vi ? 'Video interaktif' : undefined)}${figure(slide.image_url, 'image_url', slide.caption, 'caption', vi)}${has(slide.description) ? `<p class="sx-lead" data-f="description">${slide.description}</p>` : ''}${ref}</section>`
  }

  const eyebrow = layout === 'quiz' ? 'Latihan' : layout === 'discussion' ? 'Pertanyaan pemantik' : null
  const body = (BODY[layout] || BODY.legacy)(slide, n)
  const fig = figure(slide.image_url)
  const content = fig && SIDE_MEDIA.has(layout)
    ? `<div class="sx-with-media"><div class="sx-main">${body}</div>${fig}</div>`
    : `${body}${fig}`
  return `${open}${head(slide, n, eyebrow)}${content}${ref}</section>`
}

export function renderSections(deck, ctx) {
  return deck.slides.map((s, i) => renderSection(s, i, ctx))
}

/* ---------------------------------- Gaya ---------------------------------- */
// Palet dari Pitch Deck WebSlide (pitchTheme.js): ink, forest, mint, paper, line, amber.
export const SPA_CSS = `
.sx{--ink:#181C24;--forest:#047857;--mint:#52C463;--paper:#F6F7F3;--white:#fff;--line:#DDE3DE;--text:#1B2A25;--soft:#3F5049;--muted:#6B7A74;--amber:#E0A526;--rose:#B42318;--onDark:#E8EEEA;--onDarkSoft:#B9C6BF;
  font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:var(--text);background:var(--paper);line-height:1.6;font-size:16px}
.sx *,.sx *::before,.sx *::after{box-sizing:border-box}
.sx strong,.sx b{color:var(--ink);font-weight:700}
.sx-sec{background:var(--white);border:1px solid var(--line);border-radius:18px;padding:clamp(20px,4vw,40px);margin:0 0 20px;scroll-margin-top:12px}
.sx-head{display:flex;flex-direction:column;gap:6px;margin-bottom:20px}
.sx-eyebrow{margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--forest)}
.sx-title{margin:0;font-size:clamp(22px,2.6vw,30px);font-weight:700;line-height:1.2;letter-spacing:-.01em;color:var(--ink)}
.sx-sub{margin:0;font-size:17px;color:var(--soft)}
.sx-lead{margin:0;font-size:clamp(17px,1.8vw,20px);line-height:1.6;color:var(--soft);max-width:62ch}
.sx-note{margin:0 0 14px;font-size:14px;color:var(--muted)}
.sx-ref{margin:20px 0 0;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.sx-ic{width:22px;height:22px;flex:none;color:var(--forest)}
/* Sampul & penutup */
.sx-l-cover{background:var(--ink);border-color:var(--ink);color:var(--onDark);display:grid;gap:28px;padding:clamp(28px,6vw,64px)}
.sx-l-cover .sx-eyebrow{color:var(--mint)}
.sx-bar{display:block;width:64px;height:6px;border-radius:3px;background:var(--mint);margin:14px 0 18px}
.sx-cover-title{margin:0;font-size:clamp(28px,4.6vw,52px);font-weight:800;line-height:1.08;letter-spacing:-.02em;color:#fff}
.sx-cover-sub{margin:14px 0 0;font-size:clamp(17px,2vw,22px);color:var(--onDarkSoft)}
.sx-cover-desc{margin:14px 0 0;font-size:16px;color:var(--onDarkSoft);max-width:62ch}
.sx-l-cover strong,.sx-l-cover b{color:#fff}
.sx-l-thank_you{background:var(--forest);border-color:var(--forest)}
.sx-l-thank_you .sx-title{color:#fff;margin-bottom:10px}.sx-l-thank_you .sx-lead{color:#E3F5EC}
/* Pernyataan */
.sx-l-statement .sx-lead{font-size:clamp(19px,2.2vw,24px);color:var(--ink);font-weight:500}
.sx-facts{display:flex;flex-wrap:wrap;gap:24px;margin-top:22px}
.sx-fact{display:flex;flex-direction:column;padding-left:16px;border-left:5px solid var(--forest);max-width:260px}
.sx-fact-v{font-size:clamp(26px,3vw,36px);font-weight:800;color:var(--ink);line-height:1.1}
.sx-fact-l{font-size:14px;color:var(--soft)}
/* Daftar centang */
.sx-check{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.sx-check li{display:flex;gap:12px;align-items:flex-start;font-size:17px;line-height:1.55}
.sx-check li .sx-ic{margin-top:2px}
/* Kartu */
.sx-card{background:var(--white);border:1px solid var(--line);border-radius:16px;padding:20px}
.sx-card h3{margin:0 0 6px;font-size:18px;font-weight:700;color:var(--ink);line-height:1.3}
.sx-card p{margin:0;font-size:15px;color:var(--soft)}
.sx-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.sx-card-ic{display:block;font-size:22px;color:var(--forest);margin-bottom:10px}
.sx-accent{border-left:5px solid var(--forest);background:#F1FAF5}
.sx-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}
/* Langkah */
.sx-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.sx-step-n{display:block;font-size:40px;font-weight:800;line-height:1;color:var(--forest);margin-bottom:12px}
/* Angka kunci */
.sx-stats .sx-card{display:flex;flex-direction:column;gap:4px}
.sx-stat-v{font-size:clamp(28px,3.4vw,40px);font-weight:800;line-height:1.05;color:var(--forest)}
.sx-stat-l{font-size:16px;font-weight:700;color:var(--ink)}.sx-stat-n{font-size:14px;color:var(--soft)}
/* Tabel */
.sx-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px}
.sx-table{width:100%;border-collapse:collapse;font-size:15px;min-width:520px}
.sx-table th{background:var(--paper);text-align:left;padding:14px 16px;font-weight:800;color:var(--ink);border-bottom:1px solid var(--line)}
.sx-table th:first-child{color:var(--forest)}
.sx-table td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--text)}
.sx-table tr:last-child td{border-bottom:0}.sx-table td:first-child{font-weight:600;color:var(--ink)}
.sx-mark{display:inline-flex;vertical-align:-5px;margin-right:6px}.sx-mark.is-no .sx-ic{color:var(--muted)}.sx-mark.is-part .sx-ic{color:var(--amber)}
/* Akordion & diskusi */
.sx-acc-list{display:flex;flex-direction:column;gap:12px}
.sx-acc{border:1px solid var(--line);border-radius:14px;background:var(--white)}
.sx-acc summary{cursor:pointer;list-style:none;display:flex;gap:12px;align-items:center;padding:16px 18px;font-weight:700;color:var(--ink);font-size:16px}
.sx-acc summary::-webkit-details-marker{display:none}
.sx-acc summary::after{content:'';margin-left:auto;flex:none;width:9px;height:9px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);transition:transform .15s}
.sx-acc[open] summary::after{transform:rotate(-135deg)}
.sx-acc[open]{border-color:var(--forest)}
.sx-acc-body{padding:0 18px 16px}.sx-acc-body p{margin:0 0 6px;color:var(--soft)}
.sx-hint-l{font-size:12px!important;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--forest)!important}
.sx-disc summary{font-weight:600}
.sx-q-badge{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#E6F4EC;color:var(--forest);font-size:13px;font-weight:800}
/* Quiz (tanpa JS) */
.sx-quiz{display:flex;flex-direction:column;gap:22px}
.sx-q{border:1px solid var(--line);border-radius:16px;padding:18px}
.sx-q-text{display:flex;gap:12px;align-items:flex-start;margin:0 0 14px;font-weight:700;color:var(--ink);font-size:16px}
.sx-opts{display:flex;flex-direction:column;gap:10px}
.sx-opt{display:flex;gap:12px;align-items:center;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;cursor:pointer;background:var(--white);font-size:15px;transition:border-color .12s,background .12s}
.sx-opt:hover{border-color:var(--forest)}
.sx-opt input{position:absolute;opacity:0;pointer-events:none}
.sx-opt:has(input:focus-visible){outline:2px solid var(--forest);outline-offset:2px}
.sx-opt-l{flex:none;width:28px;height:28px;border-radius:8px;border:1.5px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--muted)}
.sx-q:has(input:checked) .sx-opt{pointer-events:none}
.sx-q:has(input:checked) .sx-opt.is-correct{border-color:var(--forest);background:#E6F4EC}
.sx-q:has(input:checked) .sx-opt.is-correct .sx-opt-l{background:var(--forest);border-color:var(--forest);color:#fff}
.sx-opt:not(.is-correct):has(input:checked){border-color:var(--rose);background:#FDECEA}
.sx-opt:not(.is-correct):has(input:checked) .sx-opt-l{background:var(--rose);border-color:var(--rose);color:#fff}
.sx-fb{display:none;margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--paper)}
.sx-fb p{margin:0 0 4px;color:var(--soft);font-size:15px}
.sx-q:has(input:checked) .sx-fb{display:block}
.sx-fb-ok,.sx-fb-no{display:none;font-weight:700}
.sx-q:has(.is-correct input:checked) .sx-fb-ok{display:block;color:var(--forest)}
.sx-q:has(.sx-opt:not(.is-correct) input:checked) .sx-fb-no{display:block;color:var(--rose)}
/* Media */
.sx-fig{margin:20px 0 0}
.sx-img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid var(--line);cursor:zoom-in;background:var(--paper)}
.sx-video{position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}
.sx-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.sx-video-file{display:block;width:100%;border-radius:14px;background:#000}
.sx-fig figcaption{margin-top:8px;font-size:14px;color:var(--muted)}
.sx-with-media{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px;align-items:start}
.sx-with-media .sx-fig{margin:0}
.sx-l-cover .sx-fig{margin:0}
.sx-l-cover .sx-img{border-color:var(--lineDark,#2E3743)}
@media (min-width:900px){.sx-l-cover:has(.sx-fig){grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:center}}
.sx-vi-status{margin:12px 0 0;padding:10px 14px;border-radius:12px;background:#FFF7E6;border:1px solid #F5DFA8;color:#7A5200;font-size:14px;font-weight:600}
.sx-vi-status.is-done{background:#ECFDF3;border-color:#B7E4C7;color:var(--forest)}
.sx-vi-panel{margin:12px 0 0;padding:18px;border:2px solid var(--forest);border-radius:16px;background:#F1FAF5}
.sx-vi-eyebrow{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--forest)}
.sx-vi-q{margin:0 0 14px;font-size:17px;font-weight:700;color:var(--ink);line-height:1.45}
.sx-vi-opts{display:flex;flex-direction:column;gap:10px}
.sx-vi-opt{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;background:var(--white);font:inherit;font-size:15px;color:var(--text);cursor:pointer}
.sx-vi-opt:hover:not(:disabled){border-color:var(--forest)}
.sx-vi-opt:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.sx-vi-opt:disabled{cursor:default}
.sx-vi-opt.is-correct{border-color:var(--forest);background:#E6F4EC}.sx-vi-opt.is-correct .sx-opt-l{background:var(--forest);border-color:var(--forest);color:#fff}
.sx-vi-opt.is-wrong{border-color:var(--rose);background:#FDECEA}.sx-vi-opt.is-wrong .sx-opt-l{background:var(--rose);border-color:var(--rose);color:#fff}
.sx-vi-fb:not(:empty){margin-top:14px}
.sx-vi-fb p{margin:0 0 6px;color:var(--soft);font-size:15px}
.sx-vi-ok{color:var(--forest)!important;font-weight:700}.sx-vi-no{color:var(--rose)!important;font-weight:700}
.sx-vi-btn{margin-top:6px;padding:10px 16px;border:0;border-radius:10px;background:var(--forest);color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer}
.sx-vi-btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
@media (max-width:760px){.sx{font-size:15px}.sx-split,.sx-with-media{grid-template-columns:minmax(0,1fr)}.sx-sec{border-radius:14px}.sx-check li{font-size:16px}}
`
