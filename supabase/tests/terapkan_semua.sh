#!/usr/bin/env bash
# Membangun database dari nol dan menerapkan semua migrasi — dipakai CI dan bisa dijalankan lokal.
#   PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE dibaca psql dari lingkungan.
# Gagal (exit ≠ 0) bila ada migrasi yang error, atau tidak aman dijalankan dua kali.
set -euo pipefail
cd "$(dirname "$0")/.."

psql -v ON_ERROR_STOP=1 -q -f tests/stub_supabase.sql

# SQL lama: dijalankan apa adanya (sudah ada di produksi). Error "already exists" di
# 014_exam_attempts.sql diketahui dan diabaikan; error lain tetap dilaporkan.
for f in legacy/*.sql; do
  out=$(psql -q -f "$f" 2>&1 | grep ERROR || true)
  if [ -n "$out" ] && ! { [ "$(basename "$f")" = "014_exam_attempts.sql" ] && echo "$out" | grep -q "already exists"; }; then
    echo "::error file=supabase/$f::$out"; exit 1
  fi
done

for putaran in 1 2; do
  for f in migrations/*.sql; do
    echo "putaran $putaran: $f"
    psql -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
  done
done

echo "Uji perilaku:"
psql -v ON_ERROR_STOP=1 -q -f tests/uji_progres_materi.sql

echo "Audit:"
psql -v ON_ERROR_STOP=1 -At -f scripts/audit_produksi.sql | cut -d'|' -f1
echo "Semua migrasi berhasil diterapkan dua kali."
