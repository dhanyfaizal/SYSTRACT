#!/usr/bin/env bash
# Backup database SYSTRACT: pg_dump (format custom) lalu dienkripsi AES-256 dengan kata sandi.
#
#   SUPABASE_DB_URL     string koneksi Postgres (Supabase: "Session pooler", karena runner GitHub tanpa IPv6)
#   BACKUP_PASSPHRASE   kata sandi enkripsi (simpan juga di tempat aman; tanpa ini backup tak bisa dibuka)
#   KELUARAN            folder hasil (bawaan: ./backup)
#
# Hasil: KELUARAN/systract-<waktu UTC>.dump.gpg dan .sha256-nya.
# Isi: skema public & arsip (struktur + data), serta data auth.users dan metadata storage.
# BUKAN isi: berkas di Supabase Storage (foto profil, lampiran) — backup terpisah bila perlu.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL belum diisi}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE belum diisi}"
KELUARAN="${KELUARAN:-backup}"
mkdir -p "$KELUARAN"
nama="systract-$(date -u +%Y%m%d-%H%M%S)"
mentah="$(mktemp)"
trap 'rm -f "$mentah"' EXIT

pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=arsip --schema=auth --schema=storage \
  --file="$mentah"

# Periksa dump bisa dibaca sebelum dienkripsi.
jumlah=$(pg_restore --list "$mentah" | grep -c "TABLE DATA" || true)
if [ "$jumlah" -lt 5 ]; then
  echo "Dump mencurigakan: hanya $jumlah tabel berisi data" >&2
  exit 1
fi

gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "$KELUARAN/$nama.dump.gpg" "$mentah" 3<<<"$BACKUP_PASSPHRASE"
(cd "$KELUARAN" && sha256sum "$nama.dump.gpg" > "$nama.dump.gpg.sha256")

echo "Backup selesai: $KELUARAN/$nama.dump.gpg ($jumlah tabel berisi data, $(du -h "$KELUARAN/$nama.dump.gpg" | cut -f1))"
