/**
 * AISYS (Akal Imitasi STIKOM Yos Sudarso) — layanan AI SYSTRACT.
 * Semua panggilan AI melalui fungsi server /api/ai; kunci API dan pilihan model hanya ada di server.
 * Browser tidak tahu (dan tidak menampilkan) nama model maupun penyedia aslinya.
 */
import { supabase } from '@/lib/supabase'
import { kelompokkanSlide, gabungSpa } from '@/lib/kelompokSpa'

const LOG = '[AISYS]';

/** Kabar progres saat AISYS mulai berpikir; halaman memakainya untuk memulai animasi langkah. */
export const PROGRES_MENUNGGU = "AISYS sedang memikirkan materi & merumuskan konten (proses ini memakan waktu)...";

// Kunci API AI tidak disimpan di browser. Semua panggilan lewat fungsi server
// /api/ai (lihat api/ai.js) yang memegang kunci dan memeriksa sesi login Supabase.
async function aiHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesi login berakhir. Silakan masuk kembali.");
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// Inti pemanggilan AISYS (server sudah mencoba ulang/menyederhanakan permintaan bila perlu).
export async function callAi(prompt, isJson = true, onProgress = null, system = '') {
  try {
    if (onProgress) onProgress("Menghubungi AISYS...");
    console.log(`${LOG} Mengirim permintaan...`);
    if (onProgress) onProgress(PROGRES_MENUNGGU);

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: await aiHeaders(),
      body: JSON.stringify({
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt }
        ],
        response_format: isJson ? { type: "json_object" } : undefined,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      if (onProgress) onProgress("Membaca data respon...");
      const data = await response.json();
      if (data?.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      const resultText = data.choices?.[0]?.message?.content;
      if (!resultText) throw new Error("Respons AISYS kosong.");
      const cleanText = resultText.replace(/```json\n?|```/g, '').trim();
      return isJson ? JSON.parse(cleanText) : cleanText;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let buffer = "";

    if (onProgress) onProgress("Terhubung. Menerima jawaban AISYS...");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine.startsWith("data: ")) continue;
        const dataStr = cleanedLine.slice(6).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const dataObj = JSON.parse(dataStr);
          accumulatedText += dataObj.choices?.[0]?.delta?.content || "";
          if (onProgress) onProgress({ type: 'chunk', text: accumulatedText });
        } catch {
          // Abaikan parsing error parsial pada stream
        }
      }
    }

    if (onProgress) onProgress("Mendekode & memvalidasi struktur JSON...");
    const cleanText = accumulatedText.replace(/```json\n?|```/g, '').trim();
    if (!cleanText) throw new Error("Respons AISYS kosong.");
    if (onProgress) onProgress("Memverifikasi kelayakan format materi...");
    return isJson ? JSON.parse(cleanText) : cleanText;
  } catch (err) {
    console.warn(`${LOG} Permintaan gagal:`, err);
    throw new Error(`AISYS gagal merespons: ${err?.message || 'Koneksi gagal.'}`);
  }
}

// 1. Generate CPMK berdasarkan CPL dan deskripsi mata kuliah
export async function generateCpmk(courseName, courseDesc, cplList, onProgress = null) {
  const prompt = `
    Anda adalah pakar kurikulum Outcome-Based Education (OBE). Berdasarkan data mata kuliah berikut:
    Nama Mata Kuliah: "${courseName}"
    Deskripsi Mata Kuliah: "${courseDesc || 'Mata kuliah umum/keahlian prodi.'}"
    Daftar CPL (Capaian Pembelajaran Lulusan) yang didukung: ${JSON.stringify(cplList || [])}

    Hasilkan daftar CPMK (Capaian Pembelajaran Mata Kuliah) yang terperinci, terukur, dan OBE-compliant.
    Format output wajib berupa JSON OBJECT dengan properti 'cpmk' yang berisi array objek CPMK:
    {
      "cpmk": [
        {
          "kode": "CPMK-1",
          "deskripsi": "Mahasiswa mampu menganalisis...",
          "cpl_ref": ["CPL-4", "CPL-5"]
        }
      ]
    }
    
    ATURAN PENTING:
    - Gunakan Bahasa Indonesia formal akademik dengan kata kerja operasional Taksonomi Bloom (C3-C6 seperti menganalisis, mendesain, membuat).
    - Properti "cpl_ref" wajib berisi array string kode CPL (misalnya ["CPL-4", "CPL-5"]) yang relevan dengan CPMK tersebut.
    - HANYA gunakan kode CPL yang ada di dalam daftar CPL yang didukung di atas (contoh: jika input hanya memiliki CPL-4, CPL-5, CPL-6, CPL-12, maka "cpl_ref" hanya boleh berisi kode-kode tersebut. Jangan pernah menuliskan "CPL-1", "CPL-2", dll jika tidak ada di daftar input di atas).
    - Hasilkan minimal 3 dan maksimal 6 CPMK yang komprehensif.
  `;

  const res = await callAi(prompt, true, onProgress);
  if (Array.isArray(res)) return res;
  return res?.cpmk || [];
}

// 2. Generate 16 Pertemuan mingguan berdasarkan CPMK dan deskripsi mata kuliah
export async function generateWeeklyPlan(courseName, courseDesc, cpmkList, sks = 3, onProgress = null) {
  const targetWaktu = (Number(sks) || 3) * 50;
  const prompt = `
    Anda adalah perancang instruksional akademik untuk STIKOM Yos Sudarso. Berdasarkan data mata kuliah:
    Nama Mata Kuliah: "${courseName}"
    Deskripsi: "${courseDesc || 'Mata kuliah akademik.'}"
    Daftar CPMK: ${JSON.stringify(cpmkList)}

    Hasilkan draf rencana pembelajaran semester (RPS) lengkap untuk tepat 16 pertemuan.
    
    ATURAN KONTEN PERTEMUAN:
    - Pertemuan 8 WAJIB berupa UTS (is_uts: true, kemampuan_akhir: "Ujian Tengah Semester (UTS)", bahan_kajian: "Evaluasi materi pertemuan 1-7", metode: "Ujian Tertulis / Project", waktu: ${targetWaktu}, pengalaman_belajar: "Mengerjakan soal ujian", kriteria_penilaian: "Ketepatan jawaban", bobot: 0, is_uts: true, is_uas: false)
    - Pertemuan 16 WAJIB berupa UAS (is_uas: true, kemampuan_akhir: "Ujian Akhir Semester (UAS)", bahan_kajian: "Evaluasi materi pertemuan 9-15", metode: "Ujian Tertulis / Project", waktu: ${targetWaktu}, pengalaman_belajar: "Mengerjakan soal ujian akhir atau presentasi project", kriteria_penilaian: "Ketepatan dan kualitas project", bobot: 0, is_uts: false, is_uas: true)
    - Pertemuan lainnya (1-7, dan 9-15) harus dirancang secara runut dan logis guna mencapai CPMK yang ada secara bertahap.
    
    Format output harus berupa JSON OBJECT dengan properti 'weekly_plan' yang berisi array tepat 16 objek dengan struktur:
    {
      "weekly_plan": [
        {
          "no": 1,
          "kemampuan_akhir": "Deskripsi kemampuan akhir mahasiswa minggu ini...",
          "bahan_kajian": "Materi atau topik bahasan...",
          "metode": "Ceramah, Diskusi kelompok",
          "waktu": ${targetWaktu},
          "pengalaman_belajar": "Mahasiswa mendiskusikan studi kasus...",
          "kriteria_penilaian": "Ketepatan penjelasan dan kedalaman argumen...",
          "bobot": 5,
          "is_uts": false,
          "is_uas": false
        },
        ...
      ]
    }
    
    ATURAN FORMATTING & BOBOT:
    - Gunakan Bahasa Indonesia yang baik dan benar.
    - Bobot untuk setiap pertemuan di luar UTS (minggu 8) dan UAS (minggu 16) sebaiknya berkisar antara 5 s.d. 8 (total bobot seluruh minggu non-evaluasi disarankan berjumlah 80%, karena sisa 20% dialokasikan secara dinamis).
    - Hasilkan draf lengkap tanpa memotong respons.
  `;

  const res = await callAi(prompt, true, onProgress);
  if (Array.isArray(res)) return res;
  return res?.weekly_plan || [];
}

// 3. Review SPMI kelayakan RPS
export async function reviewSpmi(rpsData, onProgress = null) {
  const prompt = `
    Anda adalah auditor Sistem Penjaminan Mutu Internal (SPMI) perguruan tinggi STIKOM Yos Sudarso.
    Tugas Anda adalah mengevaluasi dokumen Rencana Pembelajaran Semester (RPS) berikut untuk menilai keselarasan instruksional (constructive alignment):
    
    - Mata Kuliah: ${rpsData.name || 'Mata Kuliah'}
    - Deskripsi: ${rpsData.description || 'Tidak ada deskripsi.'}
    - CPMK: ${JSON.stringify(rpsData.cpmk || [])}
    - Rencana Pembelajaran (16 Pertemuan): ${JSON.stringify(rpsData.pertemuan || [])}
    - Penilaian: ${JSON.stringify(rpsData.penilaian || {})}
    - Referensi: ${JSON.stringify(rpsData.referensi || [])}

    Lakukan analisis mendalam terhadap:
    1. Apakah CPMK sudah selaras dengan CPL yang diacu.
    2. Apakah materi pada 16 pertemuan mencakup seluruh CPMK secara adekuat.
    3. Apakah metode evaluasi (Penilaian) relevan untuk mengukur CPMK.
    4. Kelayakan referensi yang dicantumkan.

    Tentukan status kelayakan dengan ketentuan berikut:
    - "GREEN" jika RPS memiliki keselarasan instruksional yang sangat baik dan memenuhi standar mutu.
    - "YELLOW" jika ada kekurangan minor (seperti bobot penilaian kurang seimbang, materi kurang detail, atau referensi terlalu tua).
    - "RED" jika ada kesalahan fatal (seperti CPMK tidak nyambung dengan materi, tidak ada asesmen yang relevan, atau pertemuan tidak lengkap).

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "status": "GREEN" | "YELLOW" | "RED",
      "score": 0 - 100,
      "summary": "Ringkasan audit penjaminan mutu secara umum...",
      "recommendations": [
        "Rekomendasi perbaikan 1...",
        "Rekomendasi perbaikan 2..."
      ]
    }
    
    Gunakan Bahasa Indonesia yang ramah namun kritis dan berstandar akademik tinggi.
  `;

  return callAi(prompt, true, onProgress);
}

// 4. Rekomendasikan CPL yang relevan dari kurikulum program studi berdasarkan Nama Mata Kuliah
export async function generateCplForCourse(courseName, curriculumCpls = [], onProgress = null) {
  const defaultCpl = [
    { kode: "CPL-1", deskripsi: "Mampu menunjukkan sikap bertakwa kepada Tuhan Yang Maha Esa dan bangga sebagai warga negara." },
    { kode: "CPL-2", deskripsi: "Menguasai konsep teoritis bidang keilmuan secara umum dan mendalam sesuai prodi." },
    { kode: "CPL-3", deskripsi: "Mampu memecahkan masalah iptek menggunakan metode ilmiah secara kritis." },
    { kode: "CPL-4", deskripsi: "Mampu merancang, mengimplementasikan, dan menguji solusi teknologi informasi." },
    { kode: "CPL-5", deskripsi: "Menguasai prinsip dan teknik komunikasi lisan serta tertulis dalam lingkungan profesional." }
  ];
  const listToUse = curriculumCpls.length > 0 ? curriculumCpls : defaultCpl;

  const prompt = `
    Anda adalah pakar kurikulum Outcome-Based Education (OBE). Tugas Anda adalah memilih/merekomendasikan CPL (Capaian Pembelajaran Lulusan) mana saja yang relevan dari daftar CPL program studi yang tersedia untuk mata kuliah berikut:
    
    Nama Mata Kuliah: "${courseName}"

    Daftar CPL Program Studi:
    ${JSON.stringify(listToUse)}

    Hasilkan daftar CPL terpilih dalam bentuk JSON OBJECT dengan properti 'cpl' yang berisi array string format "KODE: DESKRIPSI" (misalnya ["CPL-1: Mampu...", "CPL-3: Mampu..."]):
    {
      "cpl": [
        "KODE: DESKRIPSI",
        "KODE: DESKRIPSI"
      ]
    }

    ATURAN PENTING:
    - Hanya pilih CPL dari daftar CPL Program Studi di atas yang benar-benar relevan dengan pembelajaran mata kuliah "${courseName}".
    - Kembalikan minimal 2 dan maksimal 4 CPL yang paling relevan.
    - Hasilkan JSON OBJECT murni tanpa ada penjelasan tambahan di luar JSON.
  `;

  const res = await callAi(prompt, true, onProgress);
  if (Array.isArray(res)) return res;
  return res?.cpl || [];
}

// 5. Generate Deskripsi Mata Kuliah berdasarkan Nama Mata Kuliah
export async function generateCourseDescription(courseName, topics = '', onProgress = null) {
  let actualTopics = topics;
  let actualOnProgress = onProgress;
  if (typeof topics === 'function') {
    actualOnProgress = topics;
    actualTopics = '';
  }

  const prompt = `
    Anda adalah perancang kurikulum pendidikan tinggi. Berdasarkan nama mata kuliah berikut:
    Nama Mata Kuliah: "${courseName}"
    ${actualTopics ? `Topik/Fokus Materi Pengembangan: "${actualTopics}"` : ''}

    Hasilkan deskripsi mata kuliah yang komprehensif, menarik, dan berstandar akademik tinggi (minimal 100 kata).
    Deskripsi harus menggambarkan fokus utama pembelajaran, relevansi industri/keilmuan, topik-topik kunci yang dicakup, serta kompetensi akhir yang akan dikembangkan oleh mahasiswa setelah menyelesaikan mata kuliah ini.
    ${actualTopics ? `Pastikan deskripsi ini secara spesifik mencakup dan mengembangkan topik/fokus materi pengembangan yang diberikan di atas.` : ''}

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "deskripsi": "Isi deskripsi mata kuliah di sini..."
    }

    Gunakan Bahasa Indonesia formal akademik yang profesional dan inspiratif.
    Hasilkan JSON murni tanpa ada penjelasan tambahan di luar JSON.
  `;

  return callAi(prompt, true, actualOnProgress);
}

// 6. Generate Referensi Pustaka berdasarkan Nama Mata Kuliah dan CPMK
export async function generateReferences(courseName, cpmkList, onProgress = null) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 3;
  const prompt = `
    Anda adalah pakar akademis dan pustakawan universitas. Berdasarkan data mata kuliah berikut:
    Nama Mata Kuliah: "${courseName}"
    CPMK (Capaian Pembelajaran Mata Kuliah): ${JSON.stringify(cpmkList || [])}

    Hasilkan rekomendasi referensi pustaka yang sangat relevan dan mutakhir yang terdiri dari:
    1. 3 Buku Teks (Textbook) terbit dalam 3 tahun terakhir (${startYear}-${currentYear}).
    2. 3 Artikel Jurnal Ilmiah Open Access (Akses Terbuka) terbit dalam 3 tahun terakhir (${startYear}-${currentYear}).

    Setiap referensi harus memiliki:
    - Sitasi akademik standar (APA Style).
    - Tautan/URL nyata dan valid ke dokumen referensi tersebut (misal URL direct open-access journal link, DOI URL, Google Books URL, ResearchGate, atau situs penerbit resmi terpercaya).

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "referensi": [
        {
          "teks": "APA Style citation for Textbook 1...",
          "url": "https://..."
        },
        {
          "teks": "APA Style citation for Textbook 2...",
          "url": "https://..."
        },
        {
          "teks": "APA Style citation for Textbook 3...",
          "url": "https://..."
        },
        {
          "teks": "APA Style citation for Open Access Journal Article 1...",
          "url": "https://..."
        },
        {
          "teks": "APA Style citation for Open Access Journal Article 2...",
          "url": "https://..."
        },
        {
          "teks": "APA Style citation for Open Access Journal Article 3...",
          "url": "https://..."
        }
      ]
    }

    Hasilkan tepat 6 referensi (3 buku teks 3 tahun terakhir dan 3 jurnal open access).
    Hanya kembalikan JSON object murni tanpa ada penjelasan tambahan di luar JSON.
  `;

  const res = await callAi(prompt, true, onProgress);
  if (Array.isArray(res)) return res;
  return res?.referensi || [];
}

// Aturan penulisan materi yang berlaku untuk outline, regenerate slide, dan SPA.
// Dikirim sebagai pesan sistem agar tidak bercampur dengan data kursus.
const ATURAN_MATERI = `
Anda adalah penulis materi kursus daring (MOOC) berbahasa Indonesia untuk peserta yang belajar mandiri.

Aturan isi (wajib):
1. Tulis langsung sebagai materi untuk peserta. Jangan pernah menyebut "slide", "presentasi", "RPS", "outline", "dosen", "perkuliahan ini", "mahasiswa diharapkan", instruksi yang Anda terima, atau keterbatasan data yang diberikan.
2. Jangan mengarang skema penilaian, tugas, jadwal, maupun isi pertemuan lain.
3. Fakta dan angka: definisi, rumus, konversi satuan, dan nilai yang ditetapkan standar boleh dipakai. Nama standar dan lembaga yang menjadi bagian materi (misalnya ASHRAE, Uptime Institute, TIA-942, ISO) boleh dan sebaiknya disebut. Persentase, biaya, besar penghematan, atau hasil studi hanya boleh bila angkanya dikenal luas dan stabil; bila ragu, tulis secara kualitatif (misalnya "dapat menurunkan konsumsi energi secara nyata"). Jangan mengutip angka dari studi, survei, atau laporan tertentu kecuali sumbernya ada di daftar pustaka.
4. Rujukan: hanya boleh menyebut sumber dari daftar pustaka yang diberikan. Bila daftar pustaka kosong, jangan mencantumkan rujukan apa pun.
5. Kalimat ringkas dan jelas dalam Bahasa Indonesia baku. Istilah asing yang lazim boleh dipakai, dengan penjelasan singkat saat pertama kali muncul.
6. Sebuah konsep boleh dibahas lagi di bagian lain dari SUDUT BARU (sejarah, klasifikasi, cara kerja, perbandingan, penerapan, aspek operasional), tetapi definisi, daftar istilah, kalimat perbandingan, dan contoh yang sama tidak boleh ditulis ulang; cukup dirujuk singkat. Jelaskan setiap istilah sebelum dipakai di bagian lain.
7. Setiap kalimat harus akurat secara teknis. Jangan menggabungkan dua teknologi atau konsep yang berbeda seolah-olah sejenis, dan jangan membuat pernyataan yang bertentangan dengan bagian lain. Sebut nama perusahaan, lembaga, atau produk sebagai contoh hanya bila Anda yakin perannya tepat; bila ragu, gunakan contoh umum (misalnya "operator telekomunikasi nasional").
8. Keluarkan JSON murni tanpa teks lain.
`;

function daftarPustaka(references = []) {
  const list = (references || [])
    .map(r => (typeof r === 'object' && r !== null) ? (r.teks || '').trim() : String(r || '').trim())
    .filter(Boolean);
  return list.length ? list.map(r => '- ' + r).join('\n') : '(kosong — jangan mencantumkan rujukan)';
}

// 7. Generate Materi Slide untuk Pertemuan (Format Outline Sederhana)
/**
 * @param {object} [konteks]
 * @param {string[]} [konteks.pertemuanLain]  judul pertemuan lain, agar materinya tidak diambil alih
 */
export async function generateSlideContent(courseName, meetingNo, topic, capability, references = [], onProgress = null, konteks = {}) {
  const lain = (konteks.pertemuanLain || []).filter(Boolean);

  const prompt = `
Susun materi untuk satu pertemuan kursus berikut.

Kursus: "${courseName}"
Pertemuan: ${meetingNo}
Topik pertemuan ini: "${topic || '—'}"
Kemampuan akhir: "${capability || '—'}"

Topik pertemuan lain (JANGAN dibahas di sini; boleh disinggung paling banyak satu kalimat bila memang perlu):
${lain.length ? lain.map(t => '- ' + t).join('\n') : '- (tidak ada data)'}

Daftar pustaka:
${daftarPustaka(references)}

Catatan: bila kemampuan akhir tidak sejalan dengan topik pertemuan ini, utamakan TOPIK pertemuan ini dan jangan membahas materi milik pertemuan lain.

Struktur:
1. Pecah topik dan kemampuan akhir pertemuan ini menjadi 4–6 sub-topik (tulis di "sub_topik"). Hanya sub-topik milik pertemuan ini.
2. Bagian 1 adalah pengantar yang menyapa peserta secara langsung (misalnya "Anda akan mempelajari …"): apa yang akan dipelajari dan mengapa penting (3–4 poin). Jangan memulai dengan "Bagian ini …". Jangan membuat bagian "peta pembelajaran", indikator penilaian, atau aktivitas kelas.
3. Bagian inti: setiap sub-topik dibahas dalam 4–6 bagian berurutan, masing-masing dari sudut yang berbeda, misalnya: pengertian dan konsep dasar; komponen atau cara kerja; jenis atau klasifikasi; perbandingan (cocok untuk tabel); penerapan atau contoh nyata (konteks Indonesia bila relevan); kelebihan, keterbatasan, atau tantangan. Pilih sudut yang memang relevan; jangan membuat bagian pengisi.
4. Setiap bagian inti berisi 4–5 poin. Setiap poin satu kalimat informatif, paling banyak sekitar 35 kata (bukan frasa pendek). Bila topiknya memuat besaran atau rumus, sertakan minimal satu contoh perhitungan langkah demi langkah.
5. Setelah bagian inti, satu bagian "Studi Kasus" yang memadukan beberapa sub-topik dalam satu skenario nyata (konteks, pilihan, pertimbangan, keputusan yang disarankan).
6. Jumlah total 26–34 bagian (termasuk pengantar, studi kasus, dan tiga bagian penutup), mengikuti banyaknya sub-topik.
7. Tiga bagian terakhir berurutan:
   a. "Diskusi": 2–3 pertanyaan pemantik reflektif yang mengajak peserta menerapkan atau menimbang materi. Tulis setiap poin dengan format: "Pertanyaan: … Petunjuk: …" (petunjuk berupa arah berpikir, bukan jawaban).
   b. "Ringkasan": 4–6 poin inti, kira-kira satu poin per sub-topik.
   c. "Latihan" berisi 5 soal untuk menguji pemahaman, tersebar ke sub-topik yang berbeda. Setiap soal hanya boleh menguji materi yang sudah dijelaskan di bagian sebelumnya; bila ada contoh perhitungan, sertakan satu soal hitungan serupa. Tulis setiap poin dengan format: "Soal: … Jawaban: …".

Format JSON:
{
  "title": "Judul materi pertemuan ini",
  "sub_topik": ["Sub-topik 1", "Sub-topik 2"],
  "slides": [
    { "slide_no": 1, "title": "Judul bagian", "content": ["Poin 1", "Poin 2", "Poin 3", "Poin 4"] }
  ]
}
`;

  return callAi(prompt, true, onProgress, ATURAN_MATERI);
}

// 7.b. Generate/Regenerate Ulang Single Slide
export async function generateSingleSlide(courseName, meetingNo, topic, slideNo, slideTitle, currentContent = [], onProgress = null) {
  const prompt = `
    Anda adalah pakar akademis dan desainer instruksional senior. Tugas Anda adalah merumuskan ulang (regenerate) konten untuk SATU slide presentasi tertentu dalam rangkaian materi perkuliahan berikut:
    Mata Kuliah: "${courseName}"
    Pertemuan Ke: ${meetingNo}
    Topik Utama: "${topic || '—'}"
    
    Slide yang harus Anda formulasikan ulang:
    Slide No: ${slideNo}
    Judul Slide Saat Ini: "${slideTitle}"
    Konten Saat Ini (sebagai referensi): ${JSON.stringify(currentContent)}

    Hasilkan isi bagian yang baru, ringkas, dan jelas dengan ketentuan berikut:
    1. Fokus pada satu konsep sesuai judul bagian ini.
    2. Berikan CONTOH konkret, PENERAPAN praktis di industri/studi kasus nyata, atau PERBANDINGAN konsep/metode/teori yang relevan.
    3. Hasilkan 3–4 poin. Setiap poin satu kalimat, paling banyak sekitar 30 kata. Jangan mengulang isi bagian lain.
    
    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "slide_no": ${slideNo},
      "title": "Judul Slide Baru (boleh diimprovisasi)",
      "content": [
        "Poin penjelasan baru ke-1...",
        "Poin penjelasan baru ke-2...",
        "Poin penjelasan baru ke-3..."
      ]
    }

  `;

  return callAi(prompt, true, onProgress, ATURAN_MATERI);
}

// Katalog layout SPA (gaya Pitch Deck) — harus sejalan dengan src/lib/spaBlocks.js.
const KATALOG_LAYOUT = `
Pilihan layout (pilih yang paling sesuai isi; variasikan agar tidak monoton):

1. "cover" — HANYA untuk slide 1.
   { "slide_no": 1, "layout": "cover", "title": "...", "subtitle": "...", "description": "..." }
2. "statement" — satu gagasan kunci, opsional 1–3 angka atau fakta pendukung.
   { "slide_no": X, "layout": "statement", "title": "...", "body": "1–2 kalimat inti", "facts": [ { "value": "3,517 kW", "label": "setara 1 TR" } ] }
3. "list" — daftar poin bercentang.
   { "slide_no": X, "layout": "list", "title": "...", "list_items": [ { "text": "...", "color": "green" } ] }
   "color" salah satu dari "red", "amber", "green", "blue".
4. "grid" — kartu konsep, TEPAT 2 atau 4 kartu.
   { "slide_no": X, "layout": "grid", "title": "...", "grid_items": [ { "title": "...", "desc": "...", "icon": "fa-solid fa-snowflake" } ] }
   "icon" berupa kelas Font Awesome 6 gratis (fa-solid ...).
5. "split" — konsep/definisi di kiri, poin rinci di kanan.
   { "slide_no": X, "layout": "split", "title": "...", "split_left": { "heading": "...", "description": "..." }, "split_right": ["...", "..."] }
6. "steps" — proses atau prosedur berurutan, 3–6 langkah.
   { "slide_no": X, "layout": "steps", "title": "...", "steps": [ { "title": "...", "body": "..." } ] }
7. "stats" — 2–4 angka kunci (hanya angka baku: definisi, konversi, nilai standar, atau hasil contoh perhitungan).
   { "slide_no": X, "layout": "stats", "title": "...", "stats": [ { "value": "1,5", "label": "PUE contoh", "note": "150 kW ÷ 100 kW" } ] }
8. "table" — perbandingan. Sel boleh berisi "ya", "sebagian", atau "tidak" agar tampil sebagai ikon.
   { "slide_no": X, "layout": "table", "title": "...", "table_data": { "headers": ["Aspek", "A", "B"], "rows": [["...", "...", "..."]] } }
9. "accordion" — sub-konsep yang dibuka satu per satu.
   { "slide_no": X, "layout": "accordion", "title": "...", "accordion_items": [ { "header": "...", "content": "..." } ] }
10. "discussion" — WAJIB untuk slide outline berjudul "Diskusi": pertanyaan pemantik reflektif beserta petunjuk berpikir (bukan jawaban).
   { "slide_no": X, "layout": "discussion", "title": "Diskusi", "discussion_items": [ { "question": "...?", "hint": "..." } ] }
11. "quiz" — WAJIB untuk slide outline berjudul "Latihan": soal pilihan ganda untuk latihan mandiri.
   { "slide_no": X, "layout": "quiz", "title": "Latihan", "quiz_items": [ { "question": "...", "options": ["...", "...", "...", "...", "..."], "answer": 1, "explanation": "..." } ] }
   Setiap soal TEPAT 5 pilihan; "answer" adalah indeks pilihan benar (0–4); sebarkan posisi jawaban benar; pengecoh harus masuk akal; "explanation" menjelaskan mengapa jawaban itu benar. Soal diambil dari soal pada outline.
12. "media" — gambar atau video sebagai fokus. HANYA bila slide outline punya "image_url".
   { "slide_no": X, "layout": "media", "title": "...", "image_url": "(salin dari outline)", "caption": "...", "description": "..." }

Properti opsional untuk semua layout:
- "image_url": HANYA salin bila slide outline memilikinya; jangan pernah mengarang URL.
- "reference": hanya bila slide outline menyebut sumber secara eksplisit; jangan mengarang nama atau tahun.
- "media_hint": saran singkat gambar/diagram/video yang akan membantu bagian ini (mis. "Diagram tata letak hot aisle dan cold aisle"). Hanya untuk instruktur, tidak ditampilkan ke peserta. Isi hanya bila visual benar-benar membantu.
`;

// 8. Generate WebSlide Layouts
// Outline panjang dipecah per kelompok (paralel) agar jawaban AI tidak terpotong; hasilnya digabung urut.
export async function generateWebSlideData(courseName, prodiName, meetingNo, outlineData, onProgress = null) {
  const semua = outlineData?.slides || [];
  const kelompok = kelompokkanSlide(semua);
  if (kelompok.length <= 1) {
    return generateWebSlideKelompok({ courseName, prodiName, meetingNo, outlineData, onProgress });
  }

  const karakter = kelompok.map(() => 0);
  let selesai = 0;
  const lapor = () => onProgress?.(`AISYS membangun tata letak SPA: ${selesai}/${kelompok.length} kelompok selesai (${karakter.reduce((a, b) => a + b, 0).toLocaleString('id-ID')} karakter)...`);
  const daftarJudul = semua.map(s => `${s.slide_no}. ${s.title || ''}`).join('\n');

  const hasil = await Promise.all(kelompok.map((isi, i) =>
    generateWebSlideKelompok({
      courseName, prodiName, meetingNo,
      outlineData: { title: outlineData.title, slides: isi },
      konteks: { nomor: i + 1, total: kelompok.length, daftarJudul },
      onProgress: (e) => { if (e?.type === 'chunk') { karakter[i] = e.text.length; lapor(); } },
    }).then((r) => { selesai++; lapor(); return r; })
  ));

  const { slides, hilang } = gabungSpa(semua, hasil);
  if (hilang.length) console.warn(`[AISYS] ${hilang.length} bagian tidak dipetakan, diganti tampilan daftar:`, hilang);
  return { title: hasil.find(h => h?.title)?.title || outlineData.title, slides };
}

async function generateWebSlideKelompok({ courseName, prodiName, meetingNo, outlineData, konteks = null, onProgress = null }) {
  const keteranganKelompok = konteks ? `
Ini kelompok ${konteks.nomor} dari ${konteks.total} dari satu materi yang sama. Daftar judul seluruh materi (hanya sebagai konteks, JANGAN dipetakan):
${konteks.daftarJudul}
${konteks.nomor > 1 ? '- Kelompok ini bukan awal materi: jangan memakai layout "cover".\n' : ''}` : '';

  const prompt = `
Ubah outline materi berikut menjadi SPA (halaman materi interaktif) dengan layout yang sesuai untuk setiap slide.

Kursus: "${courseName}"
Program Studi: "${prodiName}"
Pertemuan: ${meetingNo}
${keteranganKelompok}
Outline (JSON):
${JSON.stringify(outlineData)}

Aturan pemetaan:
- Petakan SELURUH slide pada outline di atas. Jumlah slide dan nilai "slide_no" harus sama persis dengan outline: jangan menambah, mengurangi, menggabung, atau mengubah urutan.
- Pertahankan keringkasan teks outline; jangan memperpanjangnya. Isi boleh disusun ulang agar cocok dengan layout.
- Gunakan tag <strong> untuk kata kunci penting dan <em> untuk istilah asing. Jangan memakai tag HTML lain.
- Istilah asing cukup dijelaskan singkat di dalam slide yang sama.
${KATALOG_LAYOUT}
Format output (JSON):
{
  "title": "Judul materi",
  "slides": [ ... ]
}
`;

  return callAi(prompt, true, onProgress, ATURAN_MATERI);
}

// 8.b. Generate Single WebSlide Layout (Regenerate layout per slide)
export async function generateSingleWebSlideData(courseName, prodiName, meetingNo, slideNo, outlineSlide, onProgress = null) {
  const prompt = `
Ubah SATU slide outline berikut menjadi satu objek layout SPA.

Kursus: "${courseName}"
Program Studi: "${prodiName}"
Pertemuan: ${meetingNo}

Slide outline (JSON):
${JSON.stringify(outlineSlide)}

Aturan:
- Gunakan "slide_no": ${slideNo}.
- Pertahankan keringkasan teks; gunakan <strong> untuk kata kunci dan <em> untuk istilah asing, tanpa tag HTML lain.
${KATALOG_LAYOUT}
Format output: satu objek JSON sesuai salah satu layout di atas.
`;

  return callAi(prompt, true, onProgress, ATURAN_MATERI);
}

// 8.c. Soal di tengah video, dari transkrip yang ditempel dosen (bukan dari unduhan video).
export async function generateSoalVideo({ kursus, judul, transkrip, jumlah, durasi }, onProgress = null) {
  const prompt = `
Buat ${jumlah} soal pilihan ganda yang akan MENJEDA sebuah video materi pada detik tertentu, untuk memastikan peserta menyimak.

Kursus: "${kursus || '-'}"
Judul video: "${judul || '-'}"
Durasi video: ${durasi ? `${Math.round(durasi)} detik` : 'tidak diketahui (gunakan cap waktu transkrip)'}

Transkrip video (format "[menit:detik] ucapan"):
${transkrip}

Aturan:
- Setiap soal menguji SATU gagasan penting yang benar-benar diucapkan di video, bukan pengetahuan umum di luar video.
- "detik" = waktu tepat SETELAH gagasan itu selesai dijelaskan (ambil dari cap waktu segmen berikutnya), dalam detik bulat. Jangan menaruh soal sebelum jawabannya disebut di video.
- Sebar soal ke seluruh video secara merata; jarak antarsoal minimal 30 detik; urutkan menurut detik.
- Tepat 5 pilihan, satu jawaban benar; pengecoh masuk akal dan diambil dari konteks video; sebarkan posisi jawaban benar.
- "jawaban" adalah indeks pilihan benar (0–4).
- "penjelasan" 1 kalimat yang merujuk isi video (boleh menyebut menitnya).
- Bahasa Indonesia yang jelas dan singkat; pertanyaan maksimal 25 kata. Jangan menyebut "transkrip".

Format output: JSON murni
{ "soal": [ { "detik": 95, "pertanyaan": "...", "opsi": ["...", "...", "...", "...", "..."], "jawaban": 2, "penjelasan": "..." } ] }
`;

  return callAi(prompt, true, onProgress);
}

// 8.d. Saran pemetaan CPMK & estimasi menit belajar untuk semua aktivitas kursus (dosen menyunting sebelum simpan).
export async function generateSaranBebanCpmk({ kursus, sks, cpmk, aktivitas }, onProgress = null) {
  const prompt = `
Anda membantu instruktur memetakan aktivitas kursus daring ke CPMK dan memperkirakan waktu belajar peserta.

Kursus: "${kursus || '-'}"
Beban: ${sks ? `${sks} SKS (1 SKS = 45 jam belajar per semester, Permendikbudristek 53/2023)` : 'SKS belum diisi'}

CPMK:
${JSON.stringify(cpmk)}

Aktivitas (jenis: materi, forum, tugas, kuis, evaluasi):
${JSON.stringify(aktivitas)}

Aturan:
- "cpmk": 1–2 kode CPMK yang PALING didukung aktivitas itu, berdasarkan judul dan ringkasannya. Hanya pakai kode dari daftar CPMK di atas.
- Usahakan setiap CPMK didukung minimal satu aktivitas bila memang ada aktivitas yang relevan; jangan memaksakan pemetaan yang tidak masuk akal.
- Ujian/evaluasi yang mencakup banyak pertemuan boleh dipetakan ke CPMK pertemuan-pertemuan itu (maksimal 3).
- "menit": perkiraan REALISTIS waktu peserta rata-rata, termasuk belajar mandiri yang memang dituntut aktivitas itu (mis. tugas: memahami soal, mengerjakan, menulis laporan; forum: membaca dan menanggapi; evaluasi: durasi ujian + persiapan).
  - Jika aktivitas punya "menit_dari_isi", isi "menit" dengan angka itu.
  - Jangan membesar-besarkan angka demi mengejar target SKS; angka ini akan diperiksa asesor.
- "alasan": maksimal 15 kata, Bahasa Indonesia.
- Kembalikan SEMUA aktivitas, memakai "id" yang sama.

Format output: JSON murni
{ "aktivitas": [ { "id": "a1", "cpmk": ["CPMK-1"], "menit": 60, "alasan": "..." } ] }
`;

  return callAi(prompt, true, onProgress);
}

// 9. Generate Soal Ujian Essay untuk UTS/UAS
export async function generateEssayQuestions(courseName, examType, topic, capability, onProgress = null) {
  const prompt = `
    Anda adalah dosen senior dan pakar evaluasi akademik. Tugas Anda adalah membuat soal ujian dalam bentuk Essay (soal uraian) untuk evaluasi perkuliahan berikut:
    Mata Kuliah: "${courseName}"
    Jenis Evaluasi: "${examType}" (UTS / UAS)
    Topik Utama: "${topic || 'Evaluasi pembelajaran'}"
    Kemampuan Akhir / CPMK Terkait: "${capability || 'Mengukur pemahaman materi perkuliahan'}"

    Hasilkan daftar soal essay (minimal 3 soal, maksimal 5 soal) yang berkualitas tinggi, bertipe HOTS (Higher Order Thinking Skills), analitis, dan aplikatif.
    Setiap soal harus dilengkapi dengan bobot skor maksimal (total bobot seluruh soal harus 100) dan rubrik kriteria penilaian singkat untuk memudahkan koreksi.

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "title": "Soal Ujian Essay ${examType} - ${courseName}",
      "questions": [
        {
          "no": 1,
          "question": "Pertanyaan essay nomor 1 yang analitis...",
          "max_score": 25,
          "rubric": "Rubrik penilaian: Skor 25 jika mahasiswa menjelaskan konsep A, B, C dengan sangat lengkap dan memberikan contoh kasus nyata. Skor 10-20 jika penjelasan cukup lengkap tapi tidak ada contoh. Skor <10 jika jawaban tidak relevan."
        },
        ...
      ]
    }

    ATURAN:
    - Gunakan Bahasa Indonesia formal akademik yang jelas dan tidak ambigu.
    - Jumlah max_score dari seluruh soal wajib berjumlah tepat 100.
    - Jangan berikan penjelasan tambahan apapun di luar JSON murni.
  `;

  return callAi(prompt, true, onProgress);
}

// 10. Generate Soal Pilihan Ganda (MCQ) untuk UTS/UAS
export async function generateMcqQuestions(courseName, examType, topic, capability, onProgress = null) {
  const isUts = examType === 'UTS';
  const rangeText = isUts ? 'topik 1-7' : 'topik 9-15';
  
  const prompt = `
    Anda adalah dosen senior dan pakar evaluasi akademik MOOCs. Tugas Anda adalah membuat bank soal Pilihan Ganda (Multiple Choice Questions) untuk evaluasi berikut:
    Kursus: "${courseName}"
    Jenis Evaluasi: "${isUts ? 'Evaluasi Tengah Kursus' : 'Evaluasi Akhir Kursus'}"
    Materi Acuan: Soal wajib dirangkum secara merata dari materi pembelajaran ${rangeText}.
    Kemampuan Akhir: "${capability || 'Mengukur pemahaman materi'}"

    Hasilkan daftar soal pilihan ganda (TEPAT 25 SOAL) yang berkualitas tinggi, analitis, dan bervariasi tingkat kesulitannya.
    Setiap soal harus memiliki tepat 5 opsi jawaban (A, B, C, D, E) dan kunci jawaban yang benar serta penjelasan singkat.

    Format output wajib berupa JSON OBJECT murni dengan struktur:
    {
      "title": "Evaluasi ${isUts ? 'UTS' : 'UAS'} - ${courseName}",
      "questions": [
        {
          "id": "q_1",
          "type": "multiple_choice",
          "text": "Pertanyaan pilihan ganda nomor 1...",
          "options": [
            "Jawaban A",
            "Jawaban B",
            "Jawaban C",
            "Jawaban D",
            "Jawaban E"
          ],
          "answer": "A",
          "explanation": "Penjelasan mengapa jawaban A benar..."
        },
        ...
      ]
    }

    ATURAN:
    - Gunakan Bahasa Indonesia formal yang baik, jelas, dan tidak ambigu.
    - Opsi jawaban harus masuk akal (distractor yang baik).
    - Tentukan satu huruf kunci jawaban (A, B, C, D, atau E) pada properti "answer"; sebarkan posisi jawaban benar secara merata.
    - Hasilkan TEPAT 25 SOAL pilihan ganda (jangan kurang, jangan lebih).
    - Jangan berikan penjelasan tambahan apapun di luar JSON murni.
  `;

  return callAi(prompt, true, onProgress);
}

