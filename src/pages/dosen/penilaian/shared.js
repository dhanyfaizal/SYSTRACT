/* ── helpers ─────────────────────────────────────────────── */
export const MODE_LABEL = { ujian:'Ujian', tryout:'Try Out', quiz:'Quiz' }

export const MODE_COLOR = { ujian:'var(--indigo-600)', tryout:'#0891b2', quiz:'#7c3aed' }

export const TYPE_LABEL = { uts:'UTS', uas:'UAS', kuis:'Kuis' }



/* ─────────────────────────────────────────────────────────── */
/*  TAB: REKAP NILAI (matriks + bobot nilai akhir)            */
/* ─────────────────────────────────────────────────────────── */

export function gradeColor(v) {
  if (v === null || v === undefined) return 'var(--gray-300)'
  if (v >= 80) return '#16a34a'
  if (v >= 75) return '#22c55e'
  if (v >= 70) return '#3b82f6'
  if (v >= 65) return '#6366f1'
  if (v >= 60) return '#ca8a04'
  if (v >= 55) return '#f97316'
  if (v >= 45) return '#dc2626'
  return '#991b1b'
}

export function gradeLetter(v) {
  if (v === null || v === undefined) return '–'
  if (v >= 80) return 'A'
  if (v >= 75) return 'AB'
  if (v >= 70) return 'B'
  if (v >= 65) return 'BC'
  if (v >= 60) return 'C'
  if (v >= 55) return 'CD'
  if (v >= 45) return 'D'
  return 'E'
}
