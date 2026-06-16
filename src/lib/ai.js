/**
 * SIRA-SYS — AI Service Integration (Sumopod API)
 * Terkoneksi dengan API Key & URL dari Project WebSlide sebagai default,
 * dengan dukungan BYOK (Bring Your Own Key) via localStorage.
 */

// Model fallback list untuk mengatasi quota exhaustion atau rate limit (HTTP 429)
const MODELS = [
  "deepseek-v4-flash"
];

// Mendapatkan konfigurasi API (dari localStorage jika ada, fallback ke env, atau default WebSlide)
export function getAiConfig() {
  const localKey = localStorage.getItem('sirasys_ai_key');
  const localUrl = localStorage.getItem('sirasys_ai_url');

  const apiKey = localKey || import.meta.env.VITE_SUMOPOD_API_KEY || 'sk-Ib5Rb4Y0zmh46OZgUVvN5g';
  const apiUrl = localUrl || import.meta.env.VITE_SUMOPOD_API_URL || 'https://ai.sumopod.com/v1';

  return {
    apiKey,
    apiUrl,
    isCustom: !!(localKey || localUrl)
  };
}

// Menyimpan konfigurasi API ke localStorage
export function saveAiConfig(key, url) {
  if (key) localStorage.setItem('sirasys_ai_key', key.trim());
  else localStorage.removeItem('sirasys_ai_key');

  if (url) localStorage.setItem('sirasys_ai_url', url.trim());
  else localStorage.removeItem('sirasys_ai_url');
}

// Mereset konfigurasi AI ke default
export function resetAiConfig() {
  localStorage.removeItem('sirasys_ai_key');
  localStorage.removeItem('sirasys_ai_url');
}

// Inti pemanggilan API dengan fallback otomatis
export async function callAi(prompt, isJson = true, onProgress = null) {
  const { apiKey, apiUrl } = getAiConfig();
  let quotaError = null;
  let lastError = null;

  if (onProgress) {
    onProgress("Menghubungi Gateway API Server...");
  }

  for (const model of MODELS) {
    try {
      if (onProgress) {
        if (model !== MODELS[0]) {
          onProgress("Model utama sibuk, beralih ke model cadangan...");
        } else {
          onProgress("Mengirim data materi & rujukan RPS ke server...");
        }
      }
      console.log(`[SIRASYS AI] Mencoba model ${model}...`);
      
      if (onProgress) {
        onProgress("AI sedang memikirkan materi & merumuskan konten (proses ini memakan waktu)...");
      }

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
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
        if (onProgress) {
          onProgress("Membaca data respon...");
        }
        const data = await response.json();
        if (data?.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }
        const resultText = data.choices?.[0]?.message?.content;
        if (!resultText) throw new Error("Respons AI kosong.");
        const cleanText = resultText.replace(/```json\n?|```/g, '').trim();
        return isJson ? JSON.parse(cleanText) : cleanText;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      if (onProgress) {
        onProgress("Koneksi berhasil! Mulai mengunduh stream data dari AI...");
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine) continue;
          if (cleanedLine.startsWith("data: ")) {
            const dataStr = cleanedLine.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const dataObj = JSON.parse(dataStr);
              const content = dataObj.choices?.[0]?.delta?.content || "";
              accumulatedText += content;

              if (onProgress) {
                onProgress({
                  type: 'chunk',
                  text: accumulatedText
                });
              }
            } catch (e) {
              // Abaikan parsing error parsial pada stream
            }
          }
        }
      }

      if (onProgress) {
        onProgress("Mendekode & memvalidasi struktur JSON...");
      }

      const cleanText = accumulatedText.replace(/```json\n?|```/g, '').trim();
      if (!cleanText) throw new Error("Respons stream AI kosong.");

      if (onProgress) {
        onProgress("Memverifikasi kelayakan format materi...");
      }

      return isJson ? JSON.parse(cleanText) : cleanText;
    } catch (err) {
      lastError = err;
      const errMsg = String(err.message || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('exhausted')) {
        quotaError = err;
      }
      console.warn(`[SIRASYS AI Fallback] Kegagalan pada model ${model}:`, err);
    }
  }

  const finalError = quotaError || lastError;
  const finalMessage = finalError?.message || (typeof finalError === 'string' ? finalError : 'Koneksi gagal.');
  throw new Error(`Semua model AI gagal merespon: ${finalMessage}`);
}

// Uji koneksi kunci API tertentu
export async function testConnection(key, url) {
  const testUrl = url || 'https://ai.sumopod.com/v1';
  const testKey = key;
  
  if (!testKey) throw new Error("API Key tidak boleh kosong.");

  // Gunakan model flash yang cepat untuk pengujian
  const response = await fetch(`${testUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testKey}`
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [{ role: 'user', content: "Katakan 'OK' jika terhubung." }],
      max_tokens: 10
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  return true;
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
export async function generateCourseDescription(courseName, onProgress = null) {
  const prompt = `
    Anda adalah perancang kurikulum pendidikan tinggi. Berdasarkan nama mata kuliah berikut:
    Nama Mata Kuliah: "${courseName}"

    Hasilkan deskripsi mata kuliah yang komprehensif, menarik, dan berstandar akademik tinggi (minimal 100 kata).
    Deskripsi harus menggambarkan fokus utama pembelajaran, relevansi industri/keilmuan, topik-topik kunci yang dicakup, serta kompetensi akhir yang akan dikembangkan oleh mahasiswa setelah menyelesaikan mata kuliah ini.

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "deskripsi": "Isi deskripsi mata kuliah di sini..."
    }

    Gunakan Bahasa Indonesia formal akademik yang profesional dan inspiratif.
    Hasilkan JSON murni tanpa ada penjelasan tambahan di luar JSON.
  `;

  return callAi(prompt, true, onProgress);
}

// 6. Generate Referensi Pustaka berdasarkan Nama Mata Kuliah dan CPMK
export async function generateReferences(courseName, cpmkList, onProgress = null) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 3;
  const prompt = `
    Anda adalah pakar akademis dan pustakawan universitas. Berdasarkan data mata kuliah berikut:
    Nama Mata Kuliah: "${courseName}"
    CPMK (Capaian Pembelajaran Mata Kuliah): ${JSON.stringify(cpmkList || [])}

    Hasilkan rekomendasi referensi pustaka yang sangat relevan dan mutakhir dalam rentang waktu 3 tahun terakhir (${startYear}-${currentYear}).
    Rekomendasi harus terdiri dari 2 kategori utama:
    1. Buku Teks (Textbook) 3 Tahun Terakhir (${startYear}-${currentYear})
    2. Artikel Ilmiah / Jurnal Ilmiah 3 Tahun Terakhir (${startYear}-${currentYear})

    Pastikan referensi yang diberikan:
    - Sangat relevan dengan materi pembelajaran untuk mencapai CPMK di atas.
    - Ditulis dalam format sitasi akademik standar (APA Style).
    - Memiliki tahun terbit antara ${startYear} dan ${currentYear} (inklusif).

    Format output harus berupa JSON OBJECT dengan properti 'referensi' yang berisi array string daftar referensi langsung:
    {
      "referensi": [
        "Nama Penulis. (Tahun). Judul Buku. Penerbit.",
        "Nama Penulis. (Tahun). Judul Artikel. Nama Jurnal, Volume(Isi), Halaman."
      ]
    }
    
    Hasilkan minimal 4 dan maksimal 6 referensi gabungan yang paling representatif dan berkualitas.
    Hanya kembalikan JSON object murni tanpa ada penjelasan tambahan di luar JSON.
  `;

  const res = await callAi(prompt, true, onProgress);
  if (Array.isArray(res)) return res;
  return res?.referensi || [];
}

// 7. Generate Materi Slide untuk Pertemuan (Format Outline Sederhana)
export async function generateSlideContent(courseName, meetingNo, topic, capability, references = [], onProgress = null) {
  const prompt = `
    Anda adalah pakar akademis dan desainer instruksional senior. Tugas Anda adalah menyusun rancangan materi ajar dalam bentuk outline slide presentasi terstruktur untuk perkuliahan berikut:
    Mata Kuliah: "${courseName}"
    Pertemuan Ke: ${meetingNo}
    Topik / Bahan Kajian: "${topic || '—'}"
    Kemampuan Akhir Mahasiswa: "${capability || '—'}"
    Referensi Pustaka Utama RPS: ${JSON.stringify(references)}

    Hasilkan outline slide presentasi yang sangat komprehensif, mendalam, dan kaya materi dengan ketentuan berikut:
    1. Jumlah Slide: MINIMAL 15 SLIDE (slide 1 s.d. slide 15+).
    2. Integrasi Referensi: Hubungkan penjelasan materi dengan referensi pustaka utama RPS di atas yang relevan (cantumkan kutipan/rujukan buku atau artikel ilmiah tersebut pada slide yang relevan).
    3. Kedalaman Konten: Berikan penjelasan yang mendalam dan bermakna pada setiap slide. Di dalam poin-poin materi, berikan CONTOH konkret, PENERAPAN praktis di industri/studi kasus nyata, PERBANDINGAN teori/konsep/metode, dan penjelasan pelengkap lainnya yang dapat mengembangkan wawasan materi ini secara maksimal. Poin penjelasan harus berupa kalimat informatif yang kaya konten (bukan frasa pendek atau ringkasan seadanya).

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "title": "Judul Utama Presentasi",
      "slides": [
        {
          "slide_no": 1,
          "title": "Judul Slide 1 (contoh: Pendahuluan & Rujukan)",
          "content": [
            "Poin penjelasan mendalam tentang konsep dasar...",
            "Rujukan pustaka dan perannya dalam bab ini...",
            "Contoh kasus nyata..."
          ]
        },
        ...
      ]
    }

    ATURAN:
    - Gunakan Bahasa Indonesia formal akademik.
    - Jangan berikan penjelasan tambahan apapun di luar JSON murni.
  `;

  return callAi(prompt, true, onProgress);
}

// 8. Generate WebSlide Layouts
export async function generateWebSlideData(courseName, prodiName, meetingNo, outlineData, onProgress = null) {
  const prompt = `
    Anda adalah pakar akademis dan desainer instruksional senior. Tugas Anda adalah menerjemahkan outline materi perkuliahan berikut menjadi presentasi WebSlide terstruktur dan interaktif dengan tata letak (layout) dinamis:
    Mata Kuliah: "${courseName}"
    Program Studi: "${prodiName}"
    Pertemuan Ke: ${meetingNo}
    
    Data Outline Materi (JSON):
    ${JSON.stringify(outlineData)}

    Berdasarkan data outline sederhana di atas, buatlah presentasi WebSlide lengkap (12 sampai 15 slide). Untuk setiap slide dari outline, analisis materinya secara mendalam dan tentukan tipe tata letak (layout) yang paling sesuai, variatif, dan profesional agar presentasi interaktif dan tidak monoton.

    ATURAN LAYOUT YANG HARUS DIPILIH:
    Setiap objek slide dapat memuat properti opsional "reference": "Nama Penulis & Tahun (contoh: Williams & Park, 2023)" apabila slide tersebut memuat kutipan/rujukan teoretis.

    1. "cover": Hanya untuk Slide 1 (Cover utama perkuliahan).
       {
         "slide_no": 1,
         "layout": "cover",
         "title": "Judul Cover",
         "subtitle": "Subjudul cover",
         "description": "Deskripsi singkat isi perkuliahan hari ini"
       }
    2. "split": Layout 2 kolom (kiri & kanan). Cth: konsep/masalah di kiri, poin detail di kanan.
       {
         "slide_no": X,
         "layout": "split",
         "title": "Judul Slide",
         "reference": "...",
         "split_left": {
           "heading": "Judul kolom kiri (cth: Masalah/Definisi)",
           "description": "Penjelasan teoritis mendalam atau kutipan besar di kolom kiri..."
         },
         "split_right": [
           "Poin detail 1...",
           "Poin detail 2...",
           "Poin detail 3..."
         ]
       }
    3. "grid": Layout grid kartu (2, 3, atau 4 kartu). Cocok untuk menguraikan beberapa kategori, pilar, atau komponen utama.
       {
         "slide_no": X,
         "layout": "grid",
         "title": "Judul Slide",
         "reference": "...",
         "grid_items": [
           { "title": "Nama Kategori 1", "desc": "Deskripsi...", "icon": "fa-solid fa-lightbulb" },
           { "title": "Nama Kategori 2", "desc": "Deskripsi...", "icon": "fa-solid fa-code" }
         ]
       }
       Gunakan FontAwesome class yang relevan untuk "icon" (cth: fa-solid fa-gears, fa-solid fa-shield-halved, fa-solid fa-database, fa-solid fa-book, dll.).
    4. "list": Layout daftar kartu berurutan. Masing-masing item dibungkus dengan kartu beraksen tepi kiri berwarna.
       {
         "slide_no": X,
         "layout": "list",
         "title": "Judul Slide",
         "reference": "...",
         "list_items": [
           { "text": "Pernyataan/langkah/poin penting 1...", "color": "red" },
           { "text": "Pernyataan/langkah/poin penting 2...", "color": "amber" }
         ]
       }
       Properti "color" wajib bernilai salah satu dari "red", "amber", "green", atau "blue".
    5. "table": Layout tabel perbandingan. Sangat baik jika membandingkan dua teknologi, konsep, atau kelebihan & kekurangan.
       {
         "slide_no": X,
         "layout": "table",
         "title": "Judul Slide",
         "reference": "...",
         "table_data": {
           "headers": ["Aspek Perbandingan", "Konsep A", "Konsep B"],
           "rows": [
             ["Definisi", "Penjelasan A...", "Penjelasan B..."],
             ["Kelebihan", "Kelebihan A...", "Kelebihan B..."]
           ]
         }
       }
    6. "accordion": Layout akordion interaktif (Tanya Jawab / Diskusi Kelas / Sub-Materi).
       Dapat digunakan secara bebas di slide-slide tengah untuk memaparkan sub-konsep secara interaktif.
       Catatan khusus: Slide kedua dari terakhir (Slide N-1) WAJIB berupa layout "accordion" dengan topik "Diskusi Kelas & Tanya Jawab" yang memicu interaksi aktif mahasiswa sebelum kuliah berakhir.
       {
         "slide_no": X,
         "layout": "accordion",
         "title": "Diskusi Kelas & Tanya Jawab",
         "reference": "...",
         "accordion_items": [
           { "header": "Pertanyaan pemantik / Judul sub-konsep 1?", "content": "Pembahasan substantif / jawaban ilmiah yang komprehensif atas pertanyaan tersebut..." },
           { "header": "Pertanyaan pemantik / Judul sub-konsep 2?", "content": "Analisis kasus / penjelasan mendalam..." }
         ]
       }

    Format output harus berupa JSON OBJECT murni dengan struktur:
    {
      "title": "Judul Utama Presentasi",
      "slides": [
        // Daftar slide di sini sesuai skema di atas
      ]
    }

    Aturan:
    - Gunakan Bahasa Indonesia formal akademik yang kaya konten dan berwawasan ilmiah tinggi.
    - HINDARI memberikan meta-instruksi, arahan presentasi, atau instruksi lisan bagi presenter/dosen (seperti "Ajak mahasiswa...", "Jelaskan...", "Tekankan...", "Tunjukkan contoh...", dll.). Konten harus langsung berupa penjelasan materi, pembahasan teoritis, jawaban konkret, atau data ilmiah yang ditujukan untuk audiens/mahasiswa.
    - GLOSARIUM: Apabila sebuah slide memuat istilah asing, istilah ilmiah/teknis khusus yang mungkin tidak umum bagi mahasiswa (misalnya visual clutter, whitespace, grid system, hierarchy, dll.), wajib menyisipkan satu slide berikutnya yang secara khusus menjelaskan/mendefinisikan arti istilah tersebut menggunakan layout yang sesuai (seperti split, list, atau accordion).
    - FORMATTING: Gunakan tag HTML <strong> untuk mencetak tebal kata kunci atau poin-poin inti dari penjelasan agar memudahkan audiens menangkap poin penting dengan cepat. Gunakan tag HTML <em> untuk mencetak miring istilah asing, istilah teknis, atau istilah tidak umum.
    - Jangan berikan penjelasan tambahan apapun di luar JSON murni.
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
