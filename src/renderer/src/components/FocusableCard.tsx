import { useState } from 'react'
import { motion } from 'framer-motion'

export interface CardItem {
  id: string
  title: string
  subtitle?: string
  appId?: number
  imageUrl?: string
  /** Tried in order, after imageUrl, before giving up to the icon fallback —
   * e.g. Steam has several differently-named CDN assets per app, and not
   * every one of them exists for every appId. */
  imageFallbacks?: string[]
  /** Shown as a large watermark when there's no working image — home tiles
   * use this instead of real artwork (which doesn't exist for "Games"/
   * "Settings"/etc.), and it's also the last resort for any card whose
   * poster/box-art never loads, so nothing ever renders as a blank tile. */
  icon?: string
  /** Tailwind gradient-direction class (e.g. "bg-gradient-to-br"), varied per
   * tile so a row of icon cards doesn't look identical — always blended with
   * the theme's own accent color, never a hardcoded one, so it still matches
   * whatever custom theme the user has picked. */
  gradientDirection?: string
  favorite?: boolean
  /** Two explicit CSS colors for the icon-fallback background, overriding the
   * theme accent entirely — Home's app tiles use this so each one gets its
   * own distinct identity color instead of every tile looking like the same
   * theme-tinted gradient. Everything else (Games/TV/Apps grids) leaves this
   * unset and keeps deriving from the active theme as before. */
  iconColors?: [string, string]
}

interface FocusableCardProps {
  item: CardItem
  focused: boolean
  size?: 'default' | 'large'
  /** Ignored when size="large", which always uses a chunkier landscape ratio for home tiles. */
  aspect?: 'landscape' | 'portrait'
  /** Mouse support — selecting a card by click acts the same as focus+confirm. */
  onClick?: () => void
  /** Small "open this" affordance in the corner — Home's app tiles only. */
  showChevron?: boolean
}

// Always fills its CSS Grid track (w-full) rather than a fixed pixel size —
// a fixed size overflows its cell (and overlaps neighbors) whenever the
// container is narrower than columns * size, e.g. a smaller window or an
// extra tile added to a fixed-count row.
export const ASPECT_CLASSES = {
  landscape: 'aspect-[2/1]',
  portrait: 'aspect-[2/3]',
  large: 'aspect-[3/2]'
}

const TITLE_SIZE_CLASSES = {
  default: 'text-lg',
  large: 'text-2xl'
}

/** Same image-cascade + icon-fallback as FocusableCard, without the focus/
 * motion behavior — for static preview boxes (detail panels) that show one
 * item's art but aren't themselves a focusable grid card. */
export function CardArt({ item, className }: { item: CardItem; className?: string }): JSX.Element {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const candidates = item.imageUrl ? [item.imageUrl, ...(item.imageFallbacks ?? [])] : []
  const currentUrl = candidates[candidateIndex]
  const showImage = Boolean(currentUrl)
  const showIcon = !showImage && Boolean(item.icon)

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {showImage && (
        <img
          src={currentUrl}
          onError={() => setCandidateIndex((i) => i + 1)}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      {showIcon && (
        <div
          className={`flex h-full w-full items-center justify-center ${
            item.iconColors ? '' : `${item.gradientDirection ?? 'bg-gradient-to-br'} from-accent/25 via-surface to-surface`
          }`}
          style={
            item.iconColors
              ? { background: `linear-gradient(135deg, ${item.iconColors[0]}, ${item.iconColors[1]})` }
              : undefined
          }
        >
          <span className="text-6xl opacity-40">{item.icon}</span>
        </div>
      )}
    </div>
  )
}

export function FocusableCard({
  item,
  focused,
  size = 'default',
  aspect = 'landscape',
  onClick,
  showChevron = false
}: FocusableCardProps): JSX.Element {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const candidates = item.imageUrl ? [item.imageUrl, ...(item.imageFallbacks ?? [])] : []
  const currentUrl = candidates[candidateIndex]
  const showImage = Boolean(currentUrl)
  const showIcon = !showImage && Boolean(item.icon)
  const aspectClass = size === 'large' ? ASPECT_CLASSES.large : ASPECT_CLASSES[aspect]

  return (
    <motion.div
      onClick={onClick}
      animate={{ scale: focused ? 1.05 : 1, y: focused ? -6 : 0 }}
      whileTap={{ scale: focused ? 1.02 : 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`relative flex w-full ${aspectClass} shrink-0 flex-col justify-end overflow-hidden rounded-2xl ring-1 transition-shadow duration-200 ${
        onClick ? 'cursor-pointer' : ''
      } ${
        focused ? 'z-20 shadow-focus ring-white/10' : 'z-0 ring-white/5'
      } ${showImage || showIcon ? 'bg-surface' : focused ? 'bg-surface-hi' : 'bg-surface'}`}
    >
      {showImage && (
        <>
          <img
            src={currentUrl}
            onError={() => setCandidateIndex((i) => i + 1)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        </>
      )}
      {showIcon && (
        <div
          className={`absolute inset-0 transition-opacity ${
            item.iconColors ? '' : `${item.gradientDirection ?? 'bg-gradient-to-br'} from-accent/25 via-surface to-surface`
          } ${focused ? 'opacity-100' : 'opacity-80'}`}
          style={
            item.iconColors
              ? { background: `linear-gradient(135deg, ${item.iconColors[0]}, ${item.iconColors[1]})` }
              : undefined
          }
        >
          <span className="absolute -bottom-4 -right-4 text-[6rem] leading-none opacity-25">
            {item.icon}
          </span>
        </div>
      )}
      {item.favorite && (
        <span className="absolute right-3 top-3 z-10 text-lg leading-none drop-shadow">⭐</span>
      )}
      {showChevron && (
        <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-sm text-white/80 backdrop-blur-sm">
          ›
        </span>
      )}
      <div className="relative p-4">
        <span className={`block font-semibold leading-tight ${TITLE_SIZE_CLASSES[size]}`}>
          {item.title}
        </span>
        {item.subtitle && <span className="block text-sm text-muted">{item.subtitle}</span>}
      </div>
    </motion.div>
  )
}
