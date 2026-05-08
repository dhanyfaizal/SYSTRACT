/**
 * printPresensi.js
 * Generate HTML cetak Jurnal Perkuliahan + Rekap Daftar Hadir
 * Dibuka di tab baru → print dialog otomatis tampil
 */

const STATUS_LABEL = { hadir:'H', izin:'I', sakit:'S', alpha:'A' }
const STATUS_COLOR  = { hadir:'#16a34a', izin:'#2563eb', sakit:'#d97706', alpha:'#dc2626' }

export async function printPresensi({ supabase, courseId, userId }) {
  // ── Fetch semua data sekaligus ──────────────────────────────────
  const [{ data: course }, { data: sessions }, { data: enrollments }] = await Promise.all([
    supabase.from('courses')
      .select('code, name, semester, credits, dosen:profiles!courses_dosen_id_fkey(full_name)')
      .eq('id', courseId).single(),
    supabase.from('attendance_sessions')
      .select('id, meeting_number, title, code, created_at, expires_at, is_active, attendances(student_id,status,checked_in_at)')
      .eq('course_id', courseId)
      .order('meeting_number', { ascending: true }),
    supabase.from('enrollments')
      .select('student:profiles(id, full_name, nim)')
      .eq('course_id', courseId),
  ])

  if (!course || !sessions?.length) {
    alert('Belum ada sesi absensi untuk dicetak.')
    return
  }

  const students = (enrollments || [])
    .map(e => e.student).filter(Boolean)
    .sort((a, b) => (a.nim || '').localeCompare(b.nim || ''))

  const totalStudents = students.length
  const printDate     = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })
  const dosenName     = course.dosen?.full_name || '—'

  // ── Helper: hitung status per sesi ─────────────────────────────
  function countStatus(sess) {
    const atts = sess.attendances || []
    const h = atts.filter(a => a.status === 'hadir').length
    const i = atts.filter(a => a.status === 'izin').length
    const s = atts.filter(a => a.status === 'sakit').length
    const a = atts.filter(a => a.status === 'alpha').length
    return { h, i, s, a, total: atts.length }
  }

  // ── Helper: status seorang mahasiswa di satu sesi ───────────────
  function getStatus(sess, studentId) {
    const att = (sess.attendances || []).find(a => a.student_id === studentId)
    return att?.status || null
  }

  // ── Build HTML ──────────────────────────────────────────────────
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm 20mm 15mm; margin: 0 auto; }
    .page-break { page-break-after: always; break-after: page; }

    /* Header */
    .header { border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 14px; }
    .header-inner { display: flex; align-items: center; gap: 16px; }
    .header-logo  { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
    .header-text  { text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .header .inst  { font-size: 11pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
    .header .title { font-size: 16pt; font-weight: bold; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: 2px; }
    .header .sub   { font-size: 11pt; }

    /* Info block */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 10.5pt; }
    .info-row  { display: flex; gap: 4px; }
    .info-label{ min-width: 130px; }

    /* Section title */
    .section-title { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase;
                     border: 1px solid #111; background: #e5e7eb; padding: 5px; margin-bottom: 0; letter-spacing: 1px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #555; padding: 5px 7px; vertical-align: middle; }
    th { background: #f1f5f9; font-weight: bold; text-align: center; }
    td.center { text-align: center; }
    td.right  { text-align: right; }

    /* Status colors in rekap */
    .st-H { color: #16a34a; font-weight: bold; }
    .st-I { color: #2563eb; font-weight: bold; }
    .st-S { color: #d97706; font-weight: bold; }
    .st-A { color: #dc2626; font-weight: bold; }
    .st-null { color: #999; }

    /* Footer */
    .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 10.5pt; }
    .ttd { text-align: center; }
    .ttd .space { height: 56px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 15mm 15mm 12mm; margin: 0; }
      .no-print { display: none !important; }
    }
  `

  // ── Jurnal Pembelajaran ─────────────────────────────────────────
  const jurnalRows = sessions.map((sess, idx) => {
    const { h, i, s, a } = countStatus(sess)
    const tgl = new Date(sess.created_at).toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
    const pct = totalStudents > 0 ? Math.round(h / totalStudents * 100) : 0
    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td class="center">${sess.meeting_number}</td>
        <td>${tgl}</td>
        <td>${sess.title}</td>
        <td class="center">${h}</td>
        <td class="center">${i}</td>
        <td class="center">${s}</td>
        <td class="center">${a}</td>
        <td class="center">${pct}%</td>
        <td style="width:80px">&nbsp;</td>
      </tr>`
  }).join('')

  // ── Rekap Daftar Hadir (matrix) ─────────────────────────────────
  const thPertemuan = sessions.map(sess =>
    `<th style="min-width:32px">P${sess.meeting_number}</th>`
  ).join('')

  const rekapRows = students.map((st, idx) => {
    let h = 0, i = 0, s = 0, a = 0
    const cells = sessions.map(sess => {
      const status = getStatus(sess, st.id)
      if (status === 'hadir') h++
      else if (status === 'izin') i++
      else if (status === 'sakit') s++
      else if (status === 'alpha') a++
      const lbl = status ? STATUS_LABEL[status] : '·'
      const cls = status ? `st-${STATUS_LABEL[status]}` : 'st-null'
      return `<td class="center ${cls}">${lbl}</td>`
    }).join('')
    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td class="center">${st.nim || '—'}</td>
        <td>${st.full_name}</td>
        ${cells}
        <td class="center st-H">${h}</td>
        <td class="center st-I">${i}</td>
        <td class="center st-S">${s}</td>
        <td class="center st-A">${a}</td>
        <td class="center">${sessions.length > 0 ? Math.round(h / sessions.length * 100) : 0}%</td>
      </tr>`
  }).join('')

  // ── Daftar Hadir per Pertemuan ──────────────────────────────────
  const daftarHadirPages = sessions.map((sess, si) => {
    const tgl = new Date(sess.created_at).toLocaleDateString('id-ID', { dateStyle: 'full' })
    const { h, i, s, a } = countStatus(sess)
    const attMap = Object.fromEntries((sess.attendances || []).map(at => [at.student_id, at]))
    const rows = students.map((st, idx) => {
      const att    = attMap[st.id]
      const status = att?.status || null
      const stLabel = status ? `<span style="color:${STATUS_COLOR[status]};font-weight:bold">${status.toUpperCase()}</span>` : '<span style="color:#999">—</span>'
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">${st.nim || '—'}</td>
          <td>${st.full_name}</td>
          <td class="center">${stLabel}</td>
        </tr>`
    }).join('')

    return `
      <div class="page${si < sessions.length - 1 ? ' page-break' : ''}">
        <div class="header">
          <div class="header-inner">
            <img class="header-logo" src="https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png" alt="STIKOM"/>
            <div class="header-text">
              <div class="inst">STIKOM Yos Sudarso Purwokerto</div>
              <div style="font-size:13pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px">Lampiran: Daftar Hadir per Pertemuan</div>
              <div class="sub">${course.code} — ${course.name} | ${course.semester}</div>
            </div>
          </div>
        </div>
        <div class="section-title">
          Daftar Hadir — Pertemuan ${sess.meeting_number}: ${sess.title}
        </div>
        <div style="font-size:10pt;margin:6px 0 10px;display:flex;gap:24px;">
          <span>Tanggal: <strong>${tgl}</strong></span>
          <span>Kode Sesi: <strong style="font-family:monospace">${sess.code}</strong></span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:36px">No</th>
              <th style="width:110px">NIM</th>
              <th>Nama Mahasiswa</th>
              <th style="width:70px">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:10pt;margin-top:10px;display:flex;gap:24px;">
          <span>Hadir: <strong style="color:#16a34a">${h}</strong></span>
          <span>Izin: <strong style="color:#2563eb">${i}</strong></span>
          <span>Sakit: <strong style="color:#d97706">${s}</strong></span>
          <span>Alpha: <strong style="color:#dc2626">${a}</strong></span>
          <span>Total terdaftar: <strong>${totalStudents}</strong></span>
        </div>
        <div class="footer">
          <div class="ttd">
            <div>Mengetahui,</div>
            <div>Ketua Program Studi</div>
            <div class="space"></div>
            <div>( _________________________ )</div>
          </div>
          <div class="ttd">
            <div>Dosen Pengampu,</div>
            <div>&nbsp;</div>
            <div class="space"></div>
            <div>( ${dosenName} )</div>
          </div>
        </div>
      </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Berita Acara Pembelajaran — ${course.code} ${course.name}</title>
  <style>${css}</style>
</head>
<body>

<!-- ════════════════ HALAMAN 1: JURNAL PEMBELAJARAN ════════════════ -->
<div class="page page-break">
  <div class="header">
    <div class="header-inner">
      <img class="header-logo" src="https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png" alt="STIKOM"/>
      <div class="header-text">
        <div class="inst">STIKOM Yos Sudarso Purwokerto</div>
        <div class="title">Berita Acara Pembelajaran</div>
        <div class="sub">Tahun Akademik ${course.semester?.replace(/^(Genap|Ganjil)\s*/i, '') || course.semester}</div>
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="info-label">Mata Kuliah</span><span>: ${course.code} — ${course.name}</span></div>
    <div class="info-row"><span class="info-label">Semester/SKS</span><span>: ${course.semester} / ${course.credits} SKS</span></div>
    <div class="info-row"><span class="info-label">Dosen Pengampu</span><span>: ${dosenName}</span></div>
    <div class="info-row"><span class="info-label">Jumlah Mahasiswa</span><span>: ${totalStudents} orang</span></div>
    <div class="info-row"><span class="info-label">Total Pertemuan</span><span>: ${sessions.length} pertemuan</span></div>
    <div class="info-row"><span class="info-label">Dicetak pada</span><span>: ${printDate}</span></div>
  </div>

  <div class="section-title">Jurnal Pembelajaran</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">No</th>
        <th style="width:50px">Ptmuan</th>
        <th style="width:100px">Tanggal</th>
        <th>Topik / Judul Pertemuan</th>
        <th style="width:44px">Hadir</th>
        <th style="width:36px">Izin</th>
        <th style="width:40px">Sakit</th>
        <th style="width:40px">Alpha</th>
        <th style="width:46px">% Hadir</th>
        <th style="width:80px">Paraf Dosen</th>
      </tr>
    </thead>
    <tbody>${jurnalRows}</tbody>
  </table>

  <div class="footer" style="margin-top:32px">
    <div class="ttd">
      <div>Mengetahui,</div>
      <div>Ketua Program Studi</div>
      <div class="space"></div>
      <div>( _________________________ )</div>
    </div>
    <div class="ttd">
      <div>Purwokerto, ${printDate}</div>
      <div>Dosen Pengampu,</div>
      <div class="space"></div>
      <div>( ${dosenName} )</div>
    </div>
  </div>
</div>

<!-- ════════════════ HALAMAN 2: REKAP DAFTAR HADIR ════════════════ -->
<div class="page page-break">
  <div class="header">
    <div class="header-inner">
      <img class="header-logo" src="https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png" alt="STIKOM"/>
      <div class="header-text">
        <div class="title">Rekap Daftar Hadir Mahasiswa</div>
        <div class="sub">${course.code} — ${course.name} | ${course.semester}</div>
      </div>
    </div>
  </div>

  <div class="section-title">Rekap Kehadiran</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:36px">No</th>
        <th rowspan="2" style="width:110px">NIM</th>
        <th rowspan="2">Nama Mahasiswa</th>
        ${thPertemuan}
        <th colspan="4" style="background:#f0fdf4">Rekap</th>
        <th rowspan="2" style="width:46px">%</th>
      </tr>
      <tr>
        <th colspan="${sessions.length}" style="display:none"></th>
        <th style="width:30px;color:#16a34a">H</th>
        <th style="width:30px;color:#2563eb">I</th>
        <th style="width:30px;color:#d97706">S</th>
        <th style="width:30px;color:#dc2626">A</th>
      </tr>
    </thead>
    <tbody>${rekapRows}</tbody>
  </table>

  <div style="font-size:9pt;margin-top:8px;color:#555">
    Keterangan: H = Hadir &nbsp; I = Izin &nbsp; S = Sakit &nbsp; A = Alpha &nbsp; · = Tidak ada data
  </div>

  <div class="footer">
    <div class="ttd">
      <div>Mengetahui,</div>
      <div>Ketua Program Studi</div>
      <div class="space"></div>
      <div>( _________________________ )</div>
    </div>
    <div class="ttd">
      <div>Purwokerto, ${printDate}</div>
      <div>Dosen Pengampu,</div>
      <div class="space"></div>
      <div>( ${dosenName} )</div>
    </div>
  </div>
</div>

<!-- ════════════════ LAMPIRAN: DAFTAR HADIR PER PERTEMUAN ══════════ -->
${daftarHadirPages}


<script>window.onload = () => { setTimeout(() => window.print(), 400) }</script>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
}
