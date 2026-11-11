# Hasil audit database produksi — 2026-11-11

Sumber: `supabase/scripts/audit_produksi.sql` dijalankan di Supabase produksi (Postgres 17.11).
Data: 48 profil (1 admin, 2 dosen, 45 mahasiswa), 40 enrollment (37 approved, 3 pending), ±64 materi.

Legenda: 🔴 kritis (bisa dipakai sekarang oleh mahasiswa mana pun lewat API Supabase) ·
🟠 tinggi · 🟡 sedang · ⚪ kebersihan.

## 🔴 Kritis

| # | Masalah | Bukti (policy / kode) | Dampak |
|---|---|---|---|
| K1 | Pengguna bisa mengubah `role` miliknya sendiri | `profiles` · "Users can update own profile": `USING (auth.uid() = id)`, tanpa `WITH CHECK`, tanpa pembatasan kolom | Mahasiswa menjadikan dirinya `admin` dengan satu panggilan `update({role:'admin'})` |
| K2 | Kunci jawaban terbaca mahasiswa | `questions` · "Enrolled students see questions" memberi akses ke `correct_answer`; [UjianDetail.jsx:156](../../src/pages/mahasiswa/UjianDetail.jsx) memang memuatnya ke browser | Jawaban benar terlihat di DevTools |
| K3 | Nilai ujian dihitung & ditulis oleh browser | `exam_answers` · "Students update own answers" (selama `submitted_at IS NULL`) tidak membatasi kolom `score`; skor dihitung di [UjianDetail.jsx:233-243](../../src/pages/mahasiswa/UjianDetail.jsx) | Mahasiswa mengirim `score: 100` sendiri |
| K4 | Poin bisa dibuat bebas | `points_log` · "System inserts points" `WITH CHECK (auth.uid() IS NOT NULL)` (untuk `user_id` siapa pun) + "points_log_service_insert"; kode memasukkan poin dari browser ([CourseDetail.jsx:534](../../src/pages/mahasiswa/CourseDetail.jsx), [ForumDetail.jsx:92](../../src/pages/shared/ForumDetail.jsx)) | Leaderboard & toko avatar tidak bisa dipercaya |
| K5 | Pendaftaran mandiri langsung `approved` | `enrollments` · "Students self enroll" `WITH CHECK (student_id = auth.uid())`, `status` bebas | Melewati persetujuan dosen, langsung akses materi/ujian |
| K6 | Tabel lama `users` memberi jalan ke peran `super_admin` | `users` · "Allow update/insert for owners and admins" `ALL USING (auth.uid() = id)` → siapa pun bisa INSERT dirinya dengan `role='super_admin'`, lalu menulis `modules`, `sections`, `content_items`, `final_exams`, `portfolio_submissions` | Tabel tidak dipakai kode, tapi terbuka di API |

## 🟠 Tinggi

| # | Masalah | Bukti | Dampak |
|---|---|---|---|
| T1 | Presensi bisa dipalsukan | `attendance_sessions` · mahasiswa enrolled boleh SELECT termasuk kolom `code`; `attendances` · "att_student_insert" hanya cek `student_id`, tidak cek kode/waktu/sesi | Mahasiswa mencatat "hadir" tanpa datang |
| T2 | View melewati RLS | `attendance_summary`, `course_leaderboard`, `leaderboard` tanpa `security_invoker` | Rekap presensi & NIM semua mahasiswa terbaca siapa pun yang login |
| T3 | Semua dosen mengelola enrollment semua kursus | `enrollments` · "Admin/Dosen manage enrollments" hanya cek peran, bukan `courses.dosen_id` | Dosen A memvalidasi sertifikat / menghapus peserta kursus dosen B |
| T4 | Mahasiswa bisa menghapus nilai akhirnya dan melihat nilai belum terbit | `final_grades` · "dosen_final_grades" `ALL USING (... OR student_id = auth.uid())` — DELETE hanya memakai USING; tidak ada cek `published` | Baris nilai akhir hilang; nilai bocor sebelum diumumkan |
| T5 | Barang toko gratis | `user_inventory` · "inventory_own_insert" `WITH CHECK (user_id = auth.uid())` | Melewati `purchase_item`, ambil item tanpa poin |
| T6 | Fungsi SECURITY DEFINER tanpa `search_path`, dan `award_points_safe(p_user_id, ...)` kemungkinan bisa dipanggil lewat RPC | daftar `security_definer_tanpa_search_path` | Risiko pembajakan `search_path`; bila EXECUTE terbuka, poin diberikan ke siapa pun |
| T7 | Lencana bisa diberikan siapa pun | `user_badges` · "System awards badges" `WITH CHECK (auth.uid() IS NOT NULL)` | Tabel belum dipakai, tapi terbuka |

## 🟡 Sedang

| # | Masalah | Bukti | Dampak |
|---|---|---|---|
| S1 | Pengajuan sertifikat tidak pernah berhasil | Tidak ada policy UPDATE `enrollments` untuk mahasiswa; data: **0 enrollment berstatus sertifikat `pending`** dari 40 | Fitur sertifikat macet; dosen tidak pernah menerima pengajuan |
| S2 | Bucket `avatars` tidak ada | `bucket_hilang: ["avatars"]` | Unggah foto profil di [ProfilePage.jsx:70](../../src/pages/shared/ProfilePage.jsx) selalu gagal |
| S3 | Tabel `forum_posts` tidak ada | `tabel_hilang` | Query di [dosen/Dashboard.jsx:107](../../src/pages/dosen/Dashboard.jsx) error |
| S4 | Gambar pengumuman bisa dihapus/ditimpa siapa pun | storage `announcement-images` · INSERT/UPDATE/DELETE untuk semua `authenticated` | Mahasiswa menghapus gambar pengumuman |
| S5 | Forum lintas kursus | `forums` INSERT hanya cek `author_id`; `forum_replies` SELECT `true`, INSERT tanpa cek enrollment | Posting & baca balasan forum kursus yang tidak diikuti |
| S6 | Enrollment `pending` sudah melihat ujian & pengumuman kursus | `exams` · "Published exams visible to enrolled" dan `announcements`/`attendance_sessions` tanpa cek `status = 'approved'` | Akses sebelum disetujui |
| S7 | Nilai tugas bisa diisi mahasiswa | `submissions` · "Students update own submissions" tidak membatasi kolom `grade`/`feedback` | Nilai palsu sebelum dosen menilai |

## ⚪ Kebersihan

- 12 tabel sisa sistem lain, tidak dipakai kode: `users`, `institutions`, `classes`, `modules`, `sections`,
  `content_items`, `final_exams`, `exam_attempts`, `formative_logs`, `learning_paths`,
  `portfolio_submissions`, `user_progress`. Ditambah `badges`, `user_badges`, `certificates` yang belum dipakai.
  `badges`, `classes`, `institutions`, `learning_paths` RLS aktif tanpa policy (aman, tapi mati).
  Jumlah barisnya belum diketahui (statistik belum dianalisis) — hitung dulu sebelum dihapus.
- Policy ganda di `exams` ("Enrolled users see exams" + "Published exams visible to enrolled") dan `points_log`.
- Bucket `avatar-items` ada di produksi tapi tidak tercatat di file SQL repo.
- Semua kolom yang diharapkan kode sudah ada — migrasi kolom (RPS, sertifikat, mode ujian, dll.) sudah dijalankan.

## Urutan perbaikan (Fase 1)

1. K1, K6 — kunci `profiles.role` (trigger tolak perubahan `role` oleh non-admin) dan tutup/hapus tabel `users` lama.
2. K2, K3 — pindahkan penilaian ujian ke RPC server (`submit_exam`), sembunyikan `correct_answer` dari mahasiswa.
3. K4, T5, T6, T7 — hapus policy INSERT `points_log`/`user_inventory`/`user_badges` untuk klien; poin hanya lewat fungsi server; set `search_path`, `REVOKE EXECUTE` dari `anon`/`authenticated` untuk `award_points_safe`.
4. K5, S1, T3 — RPC `enroll_course` & `request_certificate`; batasi dosen ke kursusnya sendiri.
5. T1 — RPC `check_in(code)`; sembunyikan kolom `code` dari mahasiswa.
6. T2, T4, S4–S7 — view `security_invoker`, perbaiki policy `final_grades`, storage, forum, submissions.
7. S2, S3 — buat bucket `avatars`, ganti/buat `forum_posts`.
