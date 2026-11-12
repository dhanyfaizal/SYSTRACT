// Pemantauan error di browser (Sentry), hanya aktif bila VITE_SENTRY_DSN diisi.
//
// - Pustaka Sentry dimuat terpisah (dynamic import), jadi tidak menambah ukuran halaman bila tidak dipakai.
// - Privasi: tanpa data pribadi (email, nama, IP, isi formulir). Yang dikirim hanya pesan error,
//   jejak kode, halaman (tanpa query string), versi rilis, dan ID pengguna (UUID) untuk menghitung
//   berapa orang yang terdampak.
// - Error sebelum Sentry siap diantrekan lalu dikirim setelah termuat.

const DSN = import.meta.env.VITE_SENTRY_DSN
let sentry = null
const antrean = []

/** URL tanpa query string & hash (bisa memuat token atau data lain). */
export function bersihkanUrl(url) {
  return String(url || '').split(/[?#]/)[0]
}

/** Buang data pribadi dari event sebelum dikirim. */
export function bersihkanEvent(event) {
  if (!event) return event
  if (event.request) {
    event.request.url = bersihkanUrl(event.request.url)
    delete event.request.cookies
    delete event.request.headers
    delete event.request.query_string
    delete event.request.data
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: b.category === 'console' ? undefined : b.message,
      data: b.data?.url ? { ...b.data, url: bersihkanUrl(b.data.url) } : b.data,
    }))
  }
  return event
}

export function mulaiPantauGalat() {
  if (!DSN || typeof window === 'undefined') return
  import('@sentry/react').then((S) => {
    S.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_RILIS || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // Error dari ekstensi browser / skrip pihak ketiga bukan masalah aplikasi.
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
      ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', 'Non-Error promise rejection captured'],
      beforeSend: bersihkanEvent,
      beforeBreadcrumb: (b) => (b.category === 'ui.input' ? null : b),
    })
    sentry = S
    antrean.splice(0).forEach(([err, konteks]) => kirim(err, konteks))
  }).catch(() => { /* gagal memuat Sentry: aplikasi tetap jalan */ })
}

function kirim(err, konteks) {
  sentry.withScope((scope) => {
    if (konteks) scope.setExtras(konteks)
    sentry.captureException(err)
  })
}

/** Laporkan error yang sudah ditangani (mis. dari ErrorBoundary). Aman dipanggil kapan saja. */
export function laporGalat(err, konteks) {
  if (!DSN) return
  if (sentry) kirim(err, konteks)
  else if (antrean.length < 20) antrean.push([err, konteks])
}

/** Tandai pengguna (ID saja) agar error bisa dikelompokkan per orang; null saat keluar. */
export function aturPenggunaGalat(id) {
  if (!DSN) return
  const atur = () => sentry?.setUser(id ? { id } : null)
  if (sentry) atur()
  else import('@sentry/react').then(() => setTimeout(atur, 0)).catch(() => {})
}
