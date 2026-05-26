/**
 * AvatarShop — Toko Item Avatar (Mahasiswa)
 * Mahasiswa menukar koin (Total XP - Belanja) untuk membeli item avatar.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingBag, Coins, Search, Filter, Check, Lock,
  Sparkles, Star, Crown, Gem, ChevronRight, X, Loader2
} from 'lucide-react'
import { useAuth }   from '@/contexts/AuthContext'
import { supabase }  from '@/lib/supabase'
import AvatarPreview from '@/components/AvatarPreview'
import toast         from 'react-hot-toast'

/* ── Category config ──────────────────────────────────── */
const CATEGORIES = [
  { key: 'all',        label: 'Semua',     icon: '🛍️' },
  { key: 'hair',       label: 'Rambut',    icon: '💇' },
  { key: 'hat',        label: 'Topi',      icon: '🎩' },
  { key: 'shirt',      label: 'Baju',      icon: '👕' },
  { key: 'accessory',  label: 'Aksesoris', icon: '🕶️' },
  { key: 'background', label: 'Background',icon: '🖼️' },
  { key: 'face',       label: 'Wajah',     icon: '😊' },
]

const RARITY_CFG = {
  common:    { label: 'Common',    color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', glow: 'none' },
  rare:      { label: 'Rare',      color: '#3B82F6', bg: '#EFF6FF', border: '#93C5FD', glow: '0 0 12px rgba(59,130,246,.25)' },
  epic:      { label: 'Epic',      color: '#7C3AED', bg: '#F5F3FF', border: '#A78BFA', glow: '0 0 16px rgba(124,58,237,.3)' },
  legendary: { label: 'Legendary', color: '#F59E0B', bg: '#FFFBEB', border: '#FCD34D', glow: '0 0 20px rgba(245,158,11,.35)' },
}

export default function AvatarShop() {
  const { user }   = useAuth()
  const navigate    = useNavigate()

  const [items,      setItems]      = useState([])
  const [inventory,  setInventory]  = useState(new Set())  // item_ids owned
  const [balance,    setBalance]    = useState(0)
  const [totalXp,    setTotalXp]    = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [category,   setCategory]   = useState('all')
  const [search,     setSearch]     = useState('')
  const [buyModal,   setBuyModal]   = useState(null)   // item to buy
  const [buying,     setBuying]     = useState(false)
  const [avatarCfg,  setAvatarCfg]  = useState(null)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    setLoading(true)
    const [itemsRes, invRes, xpRes, cfgRes] = await Promise.all([
      supabase.from('shop_items').select('*').eq('is_active', true).order('category').order('sort_order'),
      supabase.from('user_inventory').select('item_id, points_spent').eq('user_id', user.id),
      supabase.from('points_log').select('points').eq('user_id', user.id),
      supabase.from('user_avatar_config').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    setItems(itemsRes.data || [])
    const inv = invRes.data || []
    setInventory(new Set(inv.map(i => i.item_id)))
    const txp = (xpRes.data || []).reduce((s, r) => s + (r.points || 0), 0)
    const spent = inv.reduce((s, r) => s + (r.points_spent || 0), 0)
    setTotalXp(txp)
    setBalance(txp - spent)
    setAvatarCfg(cfgRes.data)
    setLoading(false)
  }

  // Build item lookup map for AvatarPreview
  const itemMap = useMemo(() => {
    const m = new Map()
    items.forEach(i => m.set(i.id, i))
    return m
  }, [items])

  const filtered = items.filter(i => {
    if (category !== 'all' && i.category !== category) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleBuy() {
    if (!buyModal) return
    setBuying(true)
    const { data, error } = await supabase.rpc('purchase_item', { p_item_id: buyModal.id })
    if (error) {
      toast.error('Gagal membeli: ' + error.message)
    } else if (data?.ok) {
      toast.success(`🎉 ${data.item} berhasil dibeli!`)
      setBalance(data.balance)
      setInventory(prev => new Set([...prev, buyModal.id]))
    } else {
      toast.error(data?.error || 'Gagal membeli item')
    }
    setBuying(false)
    setBuyModal(null)
  }

  return (
    <div>
      {/* ── Page Header ────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={22} color="#7C3AED" /> Toko Avatar
          </h1>
          <p className="page-subtitle">Tukar koin XP kamu untuk item avatar keren</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Balance badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 99,
            background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
            border: '2px solid #FCD34D',
            boxShadow: '0 2px 12px rgba(245,158,11,.2)',
          }}>
            <Coins size={18} color="#D97706" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#92400E' }}>{loading ? '…' : balance}</div>
              <div style={{ fontSize: 9, color: '#B45309', fontWeight: 600, letterSpacing: '.3px' }}>KOIN TERSEDIA</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/avatar-editor')} style={{ gap: 6 }}>
            <Sparkles size={13} /> Edit Avatar <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* ── Mini Avatar Preview ─────────────────────────────── */}
      {avatarCfg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px', marginBottom: 20, borderRadius: 14,
          background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
          border: '1px solid #C7D2FE',
        }}>
          <AvatarPreview config={avatarCfg} items={itemMap} size={52}
            fallback={{ name: user?.user_metadata?.full_name, avatar_url: user?.user_metadata?.avatar_url }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>Avatar Kamu</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
              {inventory.size} item dimiliki · Total XP: {totalXp}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/avatar-editor')} style={{ marginLeft: 'auto' }}>
            Edit <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* ── Category Tabs + Search ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: '6px 14px', borderRadius: 99, border: '1px solid',
                borderColor: category === c.key ? 'var(--indigo-500)' : 'var(--gray-200)',
                background: category === c.key ? 'var(--indigo-50)' : '#fff',
                color: category === c.key ? 'var(--indigo-700)' : 'var(--gray-600)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all .15s',
              }}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            className="input"
            placeholder="Cari item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 12 }}
          />
        </div>
      </div>

      {/* ── Items Grid ─────────────────────────────────────── */}
      {loading ? (
        <div className="spinner" style={{ margin: '60px auto' }} />
      ) : filtered.length === 0 ? (
        <div className="empty-state card" style={{ padding: 60 }}>
          <ShoppingBag size={32} color="var(--gray-200)" />
          <p className="empty-state-text">Tidak ada item ditemukan</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(item => {
            const owned    = inventory.has(item.id)
            const rarity   = RARITY_CFG[item.rarity] || RARITY_CFG.common
            const canBuy   = !owned && balance >= item.price

            return (
              <div
                key={item.id}
                className="avatar-shop-card"
                style={{
                  background: '#fff',
                  border: `2px solid ${owned ? '#10B981' : rarity.border}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  transition: 'transform .15s, box-shadow .15s',
                  boxShadow: owned ? '0 0 12px rgba(16,185,129,.15)' : rarity.glow,
                  cursor: owned ? 'default' : 'pointer',
                  position: 'relative',
                }}
                onClick={() => !owned && setBuyModal(item)}
                onMouseEnter={e => { if (!owned) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = rarity.glow.replace(/\.\d+\)/, '.5)') || 'var(--shadow-md)' }}}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = owned ? '0 0 12px rgba(16,185,129,.15)' : rarity.glow }}
              >
                {/* Rarity ribbon */}
                {item.rarity !== 'common' && (
                  <div style={{
                    position: 'absolute', top: 10, right: -28,
                    background: rarity.color, color: '#fff',
                    fontSize: 9, fontWeight: 700, padding: '2px 30px',
                    transform: 'rotate(45deg)',
                    letterSpacing: '.5px',
                    zIndex: 2,
                  }}>
                    {rarity.label.toUpperCase()}
                  </div>
                )}

                {/* Item image */}
                <div style={{
                  height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: rarity.bg,
                  padding: 16,
                }}>
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{ maxHeight: 88, maxWidth: 88, objectFit: 'contain', filter: owned ? 'none' : 'drop-shadow(0 2px 6px rgba(0,0,0,.1))' }}
                  />
                </div>

                {/* Info */}
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 2 }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 8, lineHeight: 1.3 }}>
                    {item.description}
                  </div>

                  {/* Price / Status */}
                  {owned ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      background: '#D1FAE5', color: '#065F46',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      <Check size={14} /> Dimiliki
                    </div>
                  ) : item.price === 0 ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      background: '#EEF2FF', color: 'var(--indigo-700)',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      <Sparkles size={13} /> Gratis!
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 14, fontWeight: 800,
                        color: canBuy ? '#D97706' : '#DC2626',
                      }}>
                        <Coins size={14} /> {item.price}
                      </div>
                      {!canBuy && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#DC2626' }}>
                          <Lock size={10} /> Kurang {item.price - balance}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Buy Confirmation Modal ─────────────────────────── */}
      {buyModal && (
        <div className="modal-overlay" onClick={() => !buying && setBuyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Beli Item?</span>
              <button onClick={() => setBuyModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="var(--gray-400)" />
              </button>
            </div>
            <div className="modal-body" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div style={{
                width: 120, height: 120, borderRadius: 16,
                background: (RARITY_CFG[buyModal.rarity] || RARITY_CFG.common).bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${(RARITY_CFG[buyModal.rarity] || RARITY_CFG.common).border}`,
              }}>
                <img src={buyModal.image_url} alt="" style={{ maxHeight: 80, maxWidth: 80, objectFit: 'contain' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{buyModal.name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{buyModal.description}</div>

              <div style={{
                display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8,
                padding: '12px 20px', borderRadius: 12, background: 'var(--gray-50)',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706' }}>{buyModal.price}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>Harga</div>
                </div>
                <div style={{ width: 1, background: 'var(--gray-200)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: balance >= buyModal.price ? '#10B981' : '#DC2626' }}>
                    {balance}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>Saldo Koin</div>
                </div>
                <div style={{ width: 1, background: 'var(--gray-200)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-700)' }}>
                    {balance - buyModal.price}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>Sisa</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setBuyModal(null)} disabled={buying}>Batal</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleBuy}
                disabled={buying || balance < buyModal.price}
                style={{ gap: 6 }}
              >
                {buying ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Coins size={13} />}
                {buyModal.price === 0 ? 'Ambil Gratis!' : `Beli (${buyModal.price} Koin)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .avatar-shop-card { animation: slideUp .25s ease both; }
      `}</style>
    </div>
  )
}
