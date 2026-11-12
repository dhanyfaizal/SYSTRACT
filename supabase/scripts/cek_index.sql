-- ============================================================
-- Jalankan di Supabase SQL Editor untuk cek index yang ada
-- ============================================================
SELECT 
  t.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
JOIN pg_tables t ON i.tablename = t.tablename
WHERE i.schemaname = 'public'
  AND t.schemaname = 'public'
ORDER BY t.tablename, i.indexname;
