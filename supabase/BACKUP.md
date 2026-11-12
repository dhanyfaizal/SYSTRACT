# Backup & pemulihan database

Backup harian berjalan di GitHub Actions (`.github/workflows/backup-db.yml`), pukul 02.00 WIB,
memakai `supabase/scripts/backup.sh`. Hasilnya **terenkripsi** (AES-256) dan disimpan sebagai
artefak workflow selama **30 hari**.

## Isi backup

| Ikut | Tidak ikut |
|---|---|
| Skema `public` dan `arsip` (struktur + data): kursus, materi, nilai, sertifikat, progres, dll. | Berkas di Supabase Storage (foto profil, lampiran unggahan) |
| Data `auth` (akun pengguna) dan metadata `storage` | Pengaturan proyek Supabase (Auth provider, URL, kunci API) |

> Paket Supabase Pro juga punya backup harian bawaan (Dashboard → Database → Backups).
> Backup ini tetap berguna sebagai salinan di luar Supabase.

## Menyalakan (sekali saja)

1. **String koneksi.** Supabase Dashboard → **Connect** → *Session pooler* → salin URI
   (`postgresql://postgres.<ref>:<kata-sandi-db>@aws-…pooler.supabase.com:5432/postgres`).
   Pakai *Session pooler*, bukan *Direct connection*: runner GitHub tidak mendukung IPv6.
2. **Kata sandi backup.** Buat kata sandi panjang (mis. 32 karakter acak) dan **simpan di pengelola
   kata sandi**. Tanpa kata sandi ini backup tidak bisa dibuka.
3. GitHub → repositori → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = URI langkah 1
   - `BACKUP_PASSPHRASE` = kata sandi langkah 2
4. **Uji sekarang:** tab **Actions → Backup database → Run workflow**. Setelah hijau, artefak
   `backup-db-<nomor>` muncul di halaman run tersebut.

## Memulihkan

Butuh `gpg` dan klien Postgres 17 (`pg_restore`, `psql`).

```bash
# 1. Unduh artefak dari halaman run, ekstrak, lalu periksa keutuhan
sha256sum -c systract-YYYYMMDD-HHMMSS.dump.gpg.sha256

# 2. Buka enkripsi (diminta kata sandi backup)
gpg --output systract.dump --decrypt systract-YYYYMMDD-HHMMSS.dump.gpg

# 3. Lihat isinya tanpa memulihkan
pg_restore --list systract.dump | less
```

**Memulihkan satu tabel** yang terhapus atau rusak (aman, tidak menyentuh tabel lain), mis. `materials`:

```bash
pg_restore --data-only --table=materials --file=materials.sql systract.dump
# periksa materials.sql, lalu jalankan di SQL Editor Supabase (kosongkan/sesuaikan baris yang bentrok dulu)
```

**Memulihkan penuh ke proyek Supabase baru** (bencana besar):

Urutannya penting: akun dulu, karena `profiles` merujuk ke `auth.users`.

```bash
# a. Akun pengguna (data saja; tabel auth sudah disiapkan Supabase)
pg_restore --data-only --schema=auth --disable-triggers --dbname="$URL_PROYEK_BARU" systract.dump
# b. Struktur & data aplikasi
pg_restore --no-owner --no-privileges --schema=public --schema=arsip --dbname="$URL_PROYEK_BARU" systract.dump
```

Lalu atur ulang Auth provider (Google), URL situs, dan variabel lingkungan Vercel ke proyek baru,
dan unggah ulang berkas Storage bila ada salinannya.

## Uji pemulihan berkala

Setiap 3 bulan: unduh backup terbaru, buka enkripsinya, dan pulihkan ke database lokal
(`pg_restore --dbname=postgres://…localhost…`). Backup yang tidak pernah diuji belum tentu bisa dipakai.
