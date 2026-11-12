import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/lib/withRetry'

describe('withRetry', () => {
  it('mengulang error jaringan lalu berhasil', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: 1, error: null })
    const r = await withRetry(fn, { baseDelay: 1 })
    expect(r.data).toBe(1)
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('tidak mengulang error RLS (42501)', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } })
    const r = await withRetry(fn, { baseDelay: 1 })
    expect(r.error.code).toBe('42501')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('melempar error setelah percobaan habis', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('putus'))
    await expect(withRetry(fn, { retries: 2, baseDelay: 1 })).rejects.toThrow('putus')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
