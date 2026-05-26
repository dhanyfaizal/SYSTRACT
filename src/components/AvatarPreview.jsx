/**
 * AvatarPreview — Reusable layered avatar renderer.
 *
 * Props:
 *   config     – user_avatar_config row (with equipped_* fields)
 *   items      – Map<uuid, shop_item> (lookup for image_url)
 *   size       – pixel size (default 64)
 *   fallback   – { name, avatar_url } for fallback when no config
 *   className  – optional extra class
 *   onClick    – optional click handler
 */
import { useMemo } from 'react'

const LAYER_ORDER = ['background', 'shirt', 'face', 'hair', 'hat', 'accessory']
const SLOT_KEY    = {
  background: 'equipped_background',
  shirt:      'equipped_shirt',
  face:       'equipped_face',
  hair:       'equipped_hair',
  hat:        'equipped_hat',
  accessory:  'equipped_accessory',
}

export default function AvatarPreview({ config, items, size = 64, fallback, className, onClick, style: extraStyle }) {
  const layers = useMemo(() => {
    if (!config || !items) return []
    return LAYER_ORDER
      .map(layer => {
        const itemId = config[SLOT_KEY[layer]]
        if (!itemId) return null
        const item = items instanceof Map ? items.get(itemId) : items[itemId]
        if (!item) return null
        return { layer, url: item.image_url }
      })
      .filter(Boolean)
  }, [config, items])

  const hasAvatar = layers.length > 0
  const skinColor = config?.skin_color || '#FFDBB4'
  const initials  = fallback?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div
      className={`avatar-preview${className ? ' ' + className : ''}`}
      onClick={onClick}
      style={{
        width: size, height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        ...extraStyle,
      }}
    >
      {hasAvatar ? (
        <>
          {/* Skin base circle */}
          <div style={{
            position: 'absolute', inset: 0,
            background: skinColor,
            borderRadius: '50%',
          }} />
          {/* Layers */}
          {layers.map(({ layer, url }) => (
            <img
              key={layer}
              src={url}
              alt={layer}
              draggable={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none',
              }}
            />
          ))}
        </>
      ) : fallback?.avatar_url ? (
        <img
          src={fallback.avatar_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'var(--indigo-100, #E0E7FF)',
          color: 'var(--indigo-700, #4338CA)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.35, fontWeight: 700,
        }}>
          {initials}
        </div>
      )}
    </div>
  )
}
