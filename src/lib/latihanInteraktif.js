// Mini quiz ("Latihan") di SPA peserta: harus dijawab benar semua untuk menyelesaikan topik.
//
// HTML quiz dari spaBlocks.js bekerja tanpa JavaScript (untuk file ekspor) dan langsung menandai
// jawaban benar begitu peserta memilih. Di aplikasi, perilaku itu diganti di sini:
// - jawaban salah → pilihan itu ditandai merah dan dikunci, kunci jawaban TIDAK dibuka, coba lagi;
// - jawaban benar → ditandai hijau, penjelasan ditampilkan;
// - soal yang sudah benar tersimpan per peserta di perangkat.

import { bacaProgres, simpanProgres } from './videoInteraktif.js'

/**
 * @param {HTMLElement} section  <section data-layout="quiz">
 * @param {object[]} items       quiz_items dari data slide (sumber kunci jawaban)
 * @param {{ kunci?: string, onProgres?: (p: {terjawab: number, total: number}) => void }} opsi
 * @returns {() => void} pelepas
 */
export function pasangLatihan(section, items, { kunci, onProgres, onJawab } = {}) {
  const soalEl = Array.from(section.querySelectorAll('.sx-q'))
  const progres = bacaProgres(kunci)
  const pelepas = []

  const lapor = () => onProgres?.({ terjawab: progres.terjawab.size, total: soalEl.length })

  soalEl.forEach((q, qi) => {
    const dariData = items?.[qi]?.answer
    const kunciJawaban = Number.isInteger(dariData) ? dariData : Number(q.getAttribute('data-v')) || 0
    const opsi = Array.from(q.querySelectorAll('.sx-opt'))
    const fb = q.querySelector('.sx-fb')
    const pesan = document.createElement('p')
    pesan.className = 'sx-lat-msg'
    fb?.prepend(pesan)

    q.classList.add('sx-q-js')
    opsi.forEach((o) => o.classList.remove('is-correct')) // jangan tandai jawaban benar sebelum dijawab

    const tandaiBenar = (oi) => {
      opsi.forEach((o, i) => {
        o.classList.toggle('is-benar', i === oi)
        const inp = o.querySelector('input')
        if (inp) { inp.disabled = true; inp.checked = i === oi }
      })
      q.classList.add('is-selesai', 'is-tampil-fb')
      pesan.className = 'sx-lat-msg is-ok'
      pesan.textContent = 'Benar.'
    }

    if (progres.terjawab.has(qi)) tandaiBenar(kunciJawaban)

    opsi.forEach((o, oi) => {
      const inp = o.querySelector('input')
      if (!inp) return
      const pilih = () => {
        if (q.classList.contains('is-selesai')) return
        onJawab?.({ soal: qi, pilihan: oi, benar: oi === kunciJawaban })
        if (oi === kunciJawaban) {
          tandaiBenar(oi)
          progres.terjawab.add(qi)
          simpanProgres(kunci, progres)
          lapor()
        } else {
          o.classList.add('is-salah')
          inp.disabled = true
          q.classList.add('is-tampil-fb')
          pesan.className = 'sx-lat-msg is-no'
          pesan.textContent = 'Belum tepat. Baca kembali bagian sebelumnya, lalu pilih jawaban lain.'
        }
      }
      inp.addEventListener('change', pilih)
      pelepas.push(() => inp.removeEventListener('change', pilih))
    })
    pelepas.push(() => pesan.remove())
  })

  lapor()
  return () => pelepas.forEach((f) => f())
}
