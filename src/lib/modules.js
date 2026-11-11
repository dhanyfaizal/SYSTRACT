// Pengelompokan pertemuan menjadi modul — satu sumber untuk halaman peserta,
// instruktur, pratinjau kursus, dan transkrip sertifikat.
//
// Pembagiannya tetap berdasarkan nomor pertemuan (belum bisa diatur per kursus).
//   title : nama modul tanpa nomor (dipakai di transkrip)
//   name  : nama tampilan, mis. "Modul 1 · Fondasi & Konsep Dasar"
//   range : keterangan pertemuan, mis. "Pertemuan 1–4"

const DEF = [
  { id: 1, no: 1,    title: 'Fondasi & Konsep Dasar',             weeks: [1, 2, 3, 4] },
  { id: 2, no: 2,    title: 'Penerapan & Analisis Praktis',       weeks: [5, 6, 7] },
  { id: 3, no: null, title: 'Evaluasi Tengah',                    weeks: [8] },
  { id: 4, no: 3,    title: 'Pengembangan Sistem & Desain Lanjut', weeks: [9, 10, 11, 12] },
  { id: 5, no: 4,    title: 'Integrasi & Pengujian Akhir',        weeks: [13, 14, 15] },
  { id: 6, no: null, title: 'Evaluasi Akhir',                     weeks: [16] },
]

function range(weeks) {
  if (!weeks.length) return ''
  const a = Math.min(...weeks)
  const b = Math.max(...weeks)
  return a === b ? `Pertemuan ${a}` : `Pertemuan ${a}–${b}`
}

export const MODULES = DEF.map((m) => ({
  ...m,
  name: m.no ? `Modul ${m.no} · ${m.title}` : m.title,
  range: range(m.weeks),
}))

export function groupMaterialsIntoModules(items, weekKey = 'week_number') {
  const bins = MODULES.map((m) => ({ ...m, items: [] }))
  const generalBin = { id: 0, no: null, title: 'Pengantar', name: 'Pengantar', range: '', weeks: [0], items: [] }
  const extraBin = { id: 99, no: null, title: 'Materi Tambahan', name: 'Materi Tambahan', range: '', weeks: [], items: [] }

  items.forEach((m) => {
    const w = m[weekKey] || 0
    if (w === 0) {
      generalBin.items.push(m)
      return
    }
    const target = bins.find((b) => b.weeks.includes(w))
    if (target) target.items.push(m)
    else extraBin.items.push(m)
  })

  return [generalBin, ...bins, extraBin].filter((b) => b.items.length > 0)
}
