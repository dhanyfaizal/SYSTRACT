/**
 * AvatarEditor — Edit & equip avatar items dari inventory.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, ArrowLeft, Palette, RotateCcw, Check, Loader2, ShoppingBag, Sparkles
} from 'lucide-react'
import { useAuth }   from '@/contexts/AuthContext'
import { supabase }  from '@/lib/supabase'
import AvatarPreview from '@/components/AvatarPreview'
import toast         from 'react-hot-toast'

const CATEGORIES = [
  { key: 'background', label: 'Background',          icon: '🖼️', slot: 'equipped_background' },
  { key: 'face',       label: 'Non-Animated Avatar', icon: '👤', slot: 'equipped_face'       },
  { key: 'hair',       label: 'Animated Avatar',     icon: '✨', slot: 'equipped_hair'       },
]

const SKIN_COLORS = [
  '#FFDBB4', '#F5C6A0', '#E8A87C', '#D4915A',
  '#C68642', '#A0704A', '#8D5524', '#6B3A1F',
  '#FFE0BD', '#FFCBA4',
]

const RARITY_BORDER = {
  common:    '#E2E8F0',
  rare:      '#93C5FD',
  epic:      '#A78BFA',
  legendary: '#FCD34D',
}

export default function AvatarEditor() {
  const { user, profile, refreshProfile }  = useAuth()
  const navigate   = useNavigate()

  const [items,     setItems]     = useState([])      // all shop items
  const [inventory, setInventory] = useState([])      // user's inventory item_ids
  const [config,    setConfig]    = useState(null)     // current avatar config
  const [tab,       setTab]       = useState('face')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const fileInputRef = useRef()
  const [uploadingCustom, setUploadingCustom] = useState(false)

  async function handleCustomUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Determine expected type based on active tab
    const isGifExpected = tab === 'hair' // animated
    if (isGifExpected && file.type !== 'image/gif') {
      toast.error('Kategori Animated Avatar hanya menerima file GIF')
      return
    }
    if (!isGifExpected && file.type === 'image/gif') {
      toast.error('Gunakan kategori Animated Avatar untuk mengunggah file GIF')
      return
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Hanya file PNG, JPG, WebP, atau GIF yang diperbolehkan')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 10MB')
      return
    }

    setUploadingCustom(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `avatars/${user.id}_custom_${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

      // Update profiles avatar_url
      const { error: saveErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
      if (saveErr) throw saveErr

      // Reset equipped slots in client config state
      setConfig(prev => ({
        ...prev,
        equipped_face: null,
        equipped_hair: null,
        equipped_hat: null,
        equipped_shirt: null,
        equipped_accessory: null,
      }))

      // Save user_avatar_config to DB to clear slots
      const payload = {
        user_id:             user.id,
        equipped_hair:       null,
        equipped_hat:        null,
        equipped_shirt:      null,
        equipped_accessory:  null,
        equipped_background: config.equipped_background  || null,
        equipped_face:       null,
        skin_color:          config.skin_color            || '#FFDBB4',
        updated_at:          new Date().toISOString(),
      }
      await supabase.from('user_avatar_config').upsert(payload, { onConflict: 'user_id' })

      toast.success('✨ Custom Avatar berhasil diunggah!')
      if (refreshProfile) refreshProfile()
    } catch (err) {
      toast.error('Gagal mengupload avatar: ' + err.message)
    } finally {
      setUploadingCustom(false)
      e.target.value = ''
    }
  }

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    setLoading(true)
    const [itemsRes, invRes, cfgRes] = await Promise.all([
      supabase.from('shop_items').select('*').eq('is_active', true).order('category').order('sort_order'),
      supabase.from('user_inventory').select('item_id').eq('user_id', user.id),
      supabase.from('user_avatar_config').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    setItems(itemsRes.data || [])
    setInventory((invRes.data || []).map(i => i.item_id))
    setConfig(cfgRes.data || {
      user_id: user.id,
      equipped_hair: null, equipped_hat: null, equipped_shirt: null,
      equipped_accessory: null, equipped_background: null, equipped_face: null,
      skin_color: '#FFDBB4',
    })
    setLoading(false)
  }

  // Item lookup map
  const itemMap = useMemo(() => {
    const m = new Map()
    items.forEach(i => m.set(i.id, i))
    return m
  }, [items])

  // Items owned in current tab
  const ownedInTab = useMemo(() => {
    const invSet = new Set(inventory)
    return items.filter(i => i.category === tab && invSet.has(i.id))
  }, [items, inventory, tab])

  function equipItem(item) {
    const cat = CATEGORIES.find(c => c.key === item.category)
    if (!cat) return
    setConfig(prev => {
      const next = { ...prev, [cat.slot]: item.id }
      if (item.category === 'face') {
        next.equipped_hair = null
      } else if (item.category === 'hair') {
        next.equipped_face = null
      }
      return next
    })
  }

  function unequipSlot(slot) {
    setConfig(prev => ({ ...prev, [slot]: null }))
  }

  function resetAll() {
    setConfig(prev => ({
      ...prev,
      equipped_hair: null, equipped_hat: null, equipped_shirt: null,
      equipped_accessory: null, equipped_background: null, equipped_face: null,
    }))
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      user_id:             user.id,
      equipped_hair:       config.equipped_hair       || null,
      equipped_hat:        null,
      equipped_shirt:      null,
      equipped_accessory:  null,
      equipped_background: config.equipped_background  || null,
      equipped_face:       config.equipped_face        || null,
      skin_color:          config.skin_color            || '#FFDBB4',
      updated_at:          new Date().toISOString(),
    }
    const { error } = await supabase.from('user_avatar_config').upsert(payload, { onConflict: 'user_id' })
    if (error) toast.error('Gagal menyimpan: ' + error.message)
    else toast.success('✨ Avatar disimpan!')
    setSaving(false)
  }

  if (loading) return <div className="spinner" style={{ margin: '80px auto' }} />

  const activeSlot = CATEGORIES.find(c => c.key === tab)?.slot
  const equippedItemId = config?.[activeSlot]

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={20} color="#7C3AED" /> Avatar Editor
            </h1>
            <p className="page-subtitle">Pasang item dari inventory ke avatar kamu</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/toko-avatar')} style={{ gap: 5 }}>
            <ShoppingBag size={13} /> Toko
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 5 }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} /> : <Save size={13} />}
            Simpan Avatar
          </button>
        </div>
      </div>

      {/* Main Grid: Preview + Items */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>

        {/* ── Left: Preview ───────────────────────────── */}
        <div>
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Big avatar */}
            <div style={{
              width: 200, height: 200,
              borderRadius: '16px',
              border: '4px solid var(--indigo-200)',
              boxShadow: '0 8px 32px rgba(99,102,241,.2)',
              overflow: 'hidden',
              background: config?.skin_color || '#FFDBB4',
              position: 'relative',
            }}>
              <AvatarPreview config={config} items={itemMap} size={200}
                fallback={{ name: profile?.full_name, avatar_url: profile?.avatar_url }}
                style={{ borderRadius: '12px' }} />
            </div>

            {/* Skin Color */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Palette size={14} color="var(--gray-500)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-600)' }}>Warna Kulit</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SKIN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setConfig(prev => ({ ...prev, skin_color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: c,
                      border: config?.skin_color === c ? '3px solid var(--indigo-500)' : '2px solid var(--gray-200)',
                      cursor: 'pointer', transition: 'transform .1s',
                      boxShadow: config?.skin_color === c ? '0 0 0 2px var(--indigo-100)' : 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Reset */}
            <button className="btn btn-ghost btn-sm" onClick={resetAll} style={{ gap: 5, color: 'var(--danger)' }}>
              <RotateCcw size={13} /> Reset Semua
            </button>
          </div>
        </div>

        {/* ── Right: Inventory ────────────────────────── */}
        <div>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => {
              const isActive = tab === c.key
              const equippedInSlot = config?.[c.slot]
              return (
                <button
                  key={c.key}
                  onClick={() => setTab(c.key)}
                  style={{
                    padding: '8px 16px', borderRadius: 10,
                    border: '2px solid',
                    borderColor: isActive ? 'var(--indigo-500)' : 'var(--gray-200)',
                    background: isActive ? 'var(--indigo-50)' : '#fff',
                    color: isActive ? 'var(--indigo-700)' : 'var(--gray-600)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all .15s',
                    position: 'relative',
                  }}
                >
                  <span>{c.icon}</span> {c.label}
                  {equippedInSlot && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#10B981',
                      position: 'absolute', top: -2, right: -2,
                      border: '2px solid #fff',
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Items grid */}
          {ownedInTab.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>
                Belum punya item {CATEGORIES.find(c => c.key === tab)?.label}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/toko-avatar')} style={{ gap: 5, marginTop: 8 }}>
                <ShoppingBag size={13} /> Beli di Toko
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 12,
            }}>
              {/* Unequip option */}
              <button
                onClick={() => unequipSlot(activeSlot)}
                style={{
                  height: 140, borderRadius: 14,
                  border: `2px dashed ${!equippedItemId ? 'var(--indigo-400)' : 'var(--gray-200)'}`,
                  background: !equippedItemId ? 'var(--indigo-50)' : '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  cursor: 'pointer', transition: 'all .15s',
                  fontSize: 11, fontWeight: 600, color: 'var(--gray-500)',
                }}
              >
                <span style={{ fontSize: 24 }}>🚫</span>
                Tidak pakai
                {!equippedItemId && <Check size={14} color="var(--indigo-600)" />}
              </button>

              {ownedInTab.map(item => {
                const isEquipped = equippedItemId === item.id
                const rarityBorder = RARITY_BORDER[item.rarity] || RARITY_BORDER.common

                return (
                  <button
                    key={item.id}
                    onClick={() => equipItem(item)}
                    style={{
                      height: 140, borderRadius: 14,
                      border: `2px solid ${isEquipped ? 'var(--indigo-500)' : rarityBorder}`,
                      background: isEquipped ? 'var(--indigo-50)' : '#fff',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                      cursor: 'pointer', transition: 'all .15s',
                      position: 'relative', padding: 8,
                      boxShadow: isEquipped ? '0 0 0 3px var(--indigo-100)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isEquipped) e.currentTarget.style.borderColor = 'var(--indigo-300)' }}
                    onMouseLeave={e => { if (!isEquipped) e.currentTarget.style.borderColor = rarityBorder }}
                  >
                    {isEquipped && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--indigo-600)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={12} />
                      </div>
                    )}
                    <img src={item.image_url} alt={item.name}
                      style={{ maxHeight: 64, maxWidth: 64, objectFit: 'contain' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-700)', textAlign: 'center', lineHeight: 1.2 }}>
                      {item.name}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invisible file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={tab === 'face' ? 'image/png,image/jpeg,image/webp' : 'image/gif'}
        style={{ display: 'none' }}
        onChange={handleCustomUpload}
      />

      {/* Responsive override */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: 340px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
