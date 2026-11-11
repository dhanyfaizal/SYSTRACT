/**
 * Ekspor WebSlide ke satu file HTML mandiri ("Buka di tab baru" / "Unduh File HTML").
 *
 * Isi tiap bagian dirender oleh src/lib/spaBlocks.js — renderer yang sama dengan pemutar
 * peserta — sehingga file HTML tampil sama persis dengan SPA di aplikasi, dan bisa
 * diimpor kembali lewat "Impor HTML" (src/lib/webslideImport.js).
 *
 * File ini tidak memuat JavaScript: quiz dan akordion bekerja dengan HTML/CSS saja.
 */
import { sanitizeInline, escapeHtml } from './safeHtml.js'
import { prepareDeck, renderSections, SPA_CSS, SPA_FONT_HREF } from './spaBlocks.js'

const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()

export function generateWebSlideHtml(courseName, prodiName, meetingNo, slideData) {
  const deck = prepareDeck(slideData)
  const course = sanitizeInline(courseName)
  const prodi = sanitizeInline(prodiName)
  const meeting = escapeHtml(meetingNo)
  const title = deck.title || `Materi Pertemuan ${meeting}`
  const sections = renderSections(deck, { meetingNo, courseName })

  const toc = deck.slides
    .map((s, i) => `<li><a href="#sx-sec-${i}">${escapeHtml(plain(s.title) || `Bagian ${i + 1}`)}</a></li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SYSTRACT WebSlide">
<title>${escapeHtml(plain(title))} - ${escapeHtml(plain(course))} - Pertemuan ${meeting}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${SPA_FONT_HREF}">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
html,body{margin:0;background:#F6F7F3}
.sx-doc{max-width:1080px;margin:0 auto;padding:clamp(14px,3vw,40px)}
.sx-doc-head{display:flex;flex-direction:column;gap:4px;margin:0 0 18px}
.sx-doc-head small{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#047857}
.sx-doc-head strong{font-size:18px;color:#181C24}
.sx-toc{background:#fff;border:1px solid #DDE3DE;border-radius:14px;margin:0 0 20px;padding:0 18px}
.sx-toc summary{cursor:pointer;padding:14px 0;font-weight:700;color:#181C24}
.sx-toc ol{margin:0 0 14px;padding-left:22px;columns:2;column-gap:28px}
.sx-toc a{color:#3F5049;text-decoration:none;line-height:1.9}.sx-toc a:hover{color:#047857;text-decoration:underline}
.sx-doc-foot{margin:28px 0 8px;font-size:12px;color:#6B7A74;text-align:center}
@media (max-width:760px){.sx-toc ol{columns:1}}
${SPA_CSS}
</style>
</head>
<body>
<div class="sx sx-doc">
  <header class="sx-doc-head">
    <small>${course}${prodi ? ` · ${prodi}` : ''} · Pertemuan ${meeting}</small>
    <strong data-f="deck.title">${title}</strong>
  </header>
  <details class="sx-toc"><summary>Daftar isi (${deck.slides.length} bagian)</summary><ol>${toc}</ol></details>
  <main>
${sections.join('\n')}
  </main>
  <p class="sx-doc-foot">Dibuat dengan SYSTRACT · STIKOM Yos Sudarso</p>
</div>
</body>
</html>`
}
