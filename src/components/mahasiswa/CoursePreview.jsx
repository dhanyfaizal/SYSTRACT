import { useState } from 'react'
import { ArrowLeft, Loader2, CheckCircle2, Clock } from 'lucide-react'

// Pratinjau kursus untuk peserta yang belum terdaftar.
// Hanya menampilkan data yang benar-benar tersimpan; bagian tanpa data tidak dirender.

const DAFTAR_AWAL = 6 // jumlah pertemuan yang tampil sebelum "Tampilkan semua"

function susunSilabus(course, materials) {
  // Peserta yang belum terdaftar biasanya tidak bisa membaca tabel materi (RLS),
  // jadi silabus diambil dari rencana mingguan kursus bila materi kosong.
  const sumber = materials.length > 0
    ? materials.map((m) => ({ no: m.week_number || 0, title: m.title, desc: m.description }))
    : (course.weekly_plan || []).map((w) => ({ no: w.no || 0, title: w.bahan_kajian, desc: w.kemampuan_akhir }))
  return sumber.filter((s) => s.title).sort((a, b) => a.no - b.no)
}

function kalimatPertama(teks = '') {
  const m = teks.trim().match(/^.+?[.!?](\s|$)/)
  return (m ? m[0] : teks).trim()
}

export default function CoursePreview({ course, materials, enrollStatus, enrolling, onEnroll, onBack }) {
  const [descOpen, setDescOpen] = useState(false)
  const [semua, setSemua] = useState(false)

  const silabus = susunSilabus(course, materials)
  const jumlahPertemuan = new Set(silabus.map((s) => s.no)).size
  const tampil = semua ? silabus : silabus.slice(0, DAFTAR_AWAL)
  const cpmk = (course.cpmk || []).filter((c) => c?.deskripsi)
  const dosen = course.dosen
  // Kalimat pertama jadi ringkasan di atas; "Tentang kursus" memuat sisanya agar tidak berulang.
  const ringkas = kalimatPertama(course.description)
  const sisaDeskripsi = (course.description || '').trim().slice(ringkas.length).trim()
  const deskripsiPanjang = sisaDeskripsi.length > 320
  const menunggu = enrollStatus === 'pending'

  const fakta = [
    jumlahPertemuan > 0 && `${jumlahPertemuan} pertemuan`,
    cpmk.length > 0 && `${cpmk.length} capaian pembelajaran`,
    'Sertifikat kompetensi',
  ].filter(Boolean)

  return (
    <div className="pv">
      <button type="button" className="btn btn-ghost btn-sm pv-back" onClick={onBack}>
        <ArrowLeft size={15} /> Jelajahi kursus
      </button>

      <div className="pv-layout">
        <div className="pv-main">
          <header className="pv-hero">
            <span className="pv-eyebrow">
              {course.code}{dosen?.full_name ? ` · ${dosen.full_name}` : ''}
            </span>
            <h1 className="pv-title">{course.name}</h1>
            {ringkas && <p className="pv-lead">{ringkas}</p>}
            <p className="pv-facts">{fakta.join(' · ')}</p>
            {/* Di layar sempit kartu pendaftaran ada di paling bawah; beri tombol juga di atas. */}
            {!menunggu && (
              <button type="button" className="btn btn-primary pv-enroll-btn pv-hero-cta" onClick={onEnroll} disabled={enrolling}>
                {enrolling ? 'Mendaftar…' : 'Daftar kursus'}
              </button>
            )}
          </header>

          {sisaDeskripsi && (
            <section className="card pv-section" aria-labelledby="pv-tentang">
              <h2 id="pv-tentang" className="pv-h2">Tentang kursus</h2>
              <p className={`pv-desc${descOpen || !deskripsiPanjang ? '' : ' is-clamped'}`}>{sisaDeskripsi}</p>
              {deskripsiPanjang && (
                <button type="button" className="pv-more" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen}>
                  {descOpen ? 'Tampilkan lebih sedikit' : 'Selengkapnya'}
                </button>
              )}
            </section>
          )}

          {cpmk.length > 0 && (
            <section className="card pv-section" aria-labelledby="pv-cpmk">
              <h2 id="pv-cpmk" className="pv-h2">Yang akan Anda kuasai</h2>
              <ul className="pv-checks">
                {cpmk.map((c, i) => (
                  <li key={i}><CheckCircle2 size={16} aria-hidden="true" /> <span>{c.deskripsi}</span></li>
                ))}
              </ul>
            </section>
          )}

          <section className="card pv-section" aria-labelledby="pv-silabus">
            <div className="pv-section-head">
              <h2 id="pv-silabus" className="pv-h2">Silabus</h2>
              {jumlahPertemuan > 0 && <span className="pv-muted">{jumlahPertemuan} pertemuan</span>}
            </div>
            {silabus.length === 0 ? (
              <p className="pv-muted">Silabus belum disusun oleh instruktur.</p>
            ) : (
              <>
                <ol className="pv-syllabus">
                  {tampil.map((s, i) => (
                    <li key={i}>
                      <span className="pv-week">{s.no ? `Pertemuan ${s.no}` : 'Pengantar'}</span>
                      <div className="pv-week-body">
                        <span className="pv-week-title">{s.title}</span>
                        {s.desc && <span className="pv-week-desc">{s.desc}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
                {silabus.length > DAFTAR_AWAL && (
                  <button type="button" className="pv-more" onClick={() => setSemua((v) => !v)} aria-expanded={semua}>
                    {semua ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${silabus.length})`}
                  </button>
                )}
              </>
            )}
          </section>

          {dosen?.full_name && (
            <section className="card pv-section" aria-labelledby="pv-instruktur">
              <h2 id="pv-instruktur" className="pv-h2">Instruktur</h2>
              <div className="pv-person">
                <span className="avatar pv-avatar">
                  {dosen.avatar_url
                    ? <img src={dosen.avatar_url} alt="" />
                    : dosen.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <span className="pv-person-name">{dosen.full_name}</span>
              </div>
            </section>
          )}
        </div>

        <aside className="pv-side" aria-label="Pendaftaran">
          <div className="card pv-enroll">
            {menunggu ? (
              <>
                <button type="button" className="btn btn-secondary pv-enroll-btn" disabled>
                  <Clock size={15} /> Menunggu konfirmasi
                </button>
                <p className="pv-note">Pendaftaran Anda sudah terkirim. Instruktur akan mengonfirmasinya; setelah itu kursus terbuka di Kursus Saya.</p>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary pv-enroll-btn" onClick={onEnroll} disabled={enrolling}>
                  {enrolling ? <><Loader2 size={15} className="pv-spin" /> Mendaftar…</> : 'Daftar kursus'}
                </button>
                <p className="pv-note">Pendaftaran dikonfirmasi oleh instruktur sebelum kursus dapat diakses.</p>
              </>
            )}

            <div className="pv-divider" />

            <h2 className="pv-h3">Cara mendapat sertifikat</h2>
            <ol className="pv-steps">
              <li>Selesaikan semua materi</li>
              <li>Lulus ujian sesuai nilai minimal</li>
              <li>Kumpulkan semua tugas</li>
              <li>Instruktur memvalidasi sertifikat Anda</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
