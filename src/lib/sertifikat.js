// Sertifikat: alamat verifikasi, QR, dan ekspor PDF dari pratinjau di halaman kursus.
// Library berat (html-to-image, jspdf, qrcode) dimuat hanya saat dipakai.

export function urlVerifikasi(nomor, origin = globalThis.location?.origin || '') {
  return `${origin}/verifikasi/${encodeURIComponent(nomor)}`
}

/** Normalisasi nomor yang diketik/di-scan: huruf besar, tanpa spasi. */
export function rapikanNomor(teks) {
  return String(teks ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

export async function buatQrDataUrl(teks) {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toDataURL(teks, { margin: 1, width: 240, errorCorrectionLevel: 'M', color: { dark: '#1e293b', light: '#ffffff' } })
}

/**
 * Ubah setiap halaman pratinjau (.printable-certificate, .printable-transcript) di dalam
 * `container` menjadi satu halaman PDF lanskap selebar A4, lalu unduh.
 */
export async function unduhSertifikatPdf(container, namaFile) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  const halaman = Array.from(container.querySelectorAll('.printable-certificate, .printable-transcript'))
  if (!halaman.length) throw new Error('Pratinjau sertifikat tidak ditemukan')
  if (document.fonts?.ready) await document.fonts.ready

  let pdf = null
  for (const el of halaman) {
    const png = await toPng(el, {
      pixelRatio: 2, // 1123 px × 2 ≈ 190 dpi pada A4: tajam saat dicetak, file tetap ringan
      backgroundColor: '#ffffff',
      // logo eksternal yang gagal dimuat (CORS) diganti piksel transparan, PDF tetap jadi
      imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      // tampilan pratinjau (bayangan, sudut membulat) tidak ikut ke PDF
      style: { borderRadius: '0', boxShadow: 'none', border: 'none', margin: '0' },
    })
    const lebar = 297
    const tinggi = (lebar * el.offsetHeight) / el.offsetWidth
    if (!pdf) pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [lebar, tinggi], compress: true })
    else pdf.addPage([lebar, tinggi], 'landscape')
    pdf.addImage(png, 'PNG', 0, 0, lebar, tinggi, undefined, 'FAST')
  }
  pdf.setProperties({ title: namaFile.replace(/\.pdf$/i, ''), creator: 'SYSTRACT' })
  pdf.save(namaFile)
}
