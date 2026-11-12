import { describe, it, expect } from 'vitest'
import { bersihkanEvent, bersihkanUrl } from '@/lib/pantauGalat'

describe('pemantauan error: tanpa data pribadi', () => {
  it('URL tanpa query string dan hash', () => {
    expect(bersihkanUrl('https://systract.vercel.app/verifikasi/ABC?token=rahasia#x')).toBe('https://systract.vercel.app/verifikasi/ABC')
  })
  it('membuang cookie, header, isi request, dan data pengguna selain ID', () => {
    const e = bersihkanEvent({
      request: { url: 'https://a.id/p?email=x@y.id', cookies: 'sb=1', headers: { Authorization: 'Bearer t' }, data: '{"pw":1}', query_string: 'email=x' },
      user: { id: 'u-1', email: 'x@y.id', ip_address: '1.2.3.4' },
      breadcrumbs: [{ category: 'console', message: 'token abc' }, { category: 'fetch', data: { url: 'https://a.id/rest?select=*&id=eq.1' } }],
    })
    expect(e.request).toEqual({ url: 'https://a.id/p' })
    expect(e.user).toEqual({ id: 'u-1' })
    expect(e.breadcrumbs[0].message).toBeUndefined()
    expect(e.breadcrumbs[1].data.url).toBe('https://a.id/rest')
  })
})
