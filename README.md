# SYSTRACT

Platform kursus daring (MOOC) untuk peserta, instruktur, dan admin: katalog kursus, materi bergaya
slide (SPA), tugas, kuis/ujian dengan bank soal, forum, presensi, penilaian & nilai akhir, validasi
sertifikat, pengumuman, serta asisten AI.

## Teknologi

- **Frontend:** React 19, Vite 8, React Router 7, lucide-react, react-hot-toast
- **Backend:** Supabase (Postgres + RLS, Auth Google OAuth, Storage)
- **File materi & tugas:** Google Drive (Picker API)
- **AI:** Vercel Function [`api/ai.js`](api/ai.js) ke penyedia kompatibel OpenAI (Sumopod); kunci hanya di server
- **Hosting:** Vercel

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env    # isi nilainya
npm run dev
```

| Variabel | Untuk | Keterangan |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser | Project Settings → API di Supabase |
| `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` | browser | Google Cloud Console (Drive Picker) |
| `SUMOPOD_API_KEY`, `SUMOPOD_API_URL` | server | Hanya di Vercel; **jangan** diberi awalan `VITE_` |
| — | server | Model AI dikunci di `api/ai.js` (`MODEL_DIIZINKAN`, saat ini hanya `deepseek-v4-flash`); `SUMOPOD_MODEL` tidak lagi dipakai |

Fitur AI (`/api/ai`) hanya berjalan di Vercel atau `vercel dev`, tidak di `npm run dev`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi ke `dist/` (halaman dimuat per kebutuhan) |
| `npm run lint` | ESLint (harus 0 error; peringatan boleh) |
| `npm test` | Tes unit Vitest (`src/__tests__/`) |

CI GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) menjalankan lint, tes, build,
dan menerapkan seluruh migrasi SQL ke Postgres kosong dua kali.

## Struktur

```
api/ai.js                 Gerbang AI di server (cek login Supabase, model cadangan)
src/router/               Routing per peran (lazy-load per halaman)
src/shell/, components/   Kerangka aplikasi, sidebar, header, komponen bersama
src/pages/{mahasiswa,dosen,admin,shared}/
src/lib/                  Supabase client, AI, Google Drive, sanitasi HTML, SPA/web slide
supabase/                 Database: legacy/, migrations/, scripts/, tests/ — lihat supabase/README.md
```

## Database & keamanan

Seluruh aturan akses ada di database (RLS Supabase), bukan di frontend — kunci anon bisa dilihat siapa pun.
Aksi sensitif (mulai/kumpul ujian, poin, presensi, pengajuan sertifikat) lewat RPC di server, dan kunci
jawaban/kode presensi tidak pernah dikirim ke peserta. Cara mengubah database dan riwayat migrasi:
[supabase/README.md](supabase/README.md). Hasil audit terakhir: [supabase/scripts/hasil_audit_2026-11-11.md](supabase/scripts/hasil_audit_2026-11-11.md).

## Peran

| Peran di database | Label di aplikasi |
|---|---|
| `mahasiswa` | Peserta |
| `dosen` | Instruktur |
| `admin` | Administrator |

Peran hanya bisa diubah admin (dijaga trigger database).
