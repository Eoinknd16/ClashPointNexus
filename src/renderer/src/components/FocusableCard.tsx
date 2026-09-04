import { useState } from 'react'
import { motion } from 'framer-motion'

export interface CardItem {
  id: string
  title: string
  subtitle?: string
  appId?: number
  imageUrl?: string
}

interface FocusableCardProps {
  item: CardItem
  focused: boolean
  size?: 'default' | 'large'
  /** Ignored when size="large", which always uses a chunkier landscape ratio for home tiles. */
  aspect?: 'landscape' | 'portrait'
  /** Mouse support — selecting a card by click acts the same as focus+confirm. */
  onClick?: () => void
}

// Always fills its CSS Grid track (w-full) rather than a fixed pixel size —
// a fixed size overflows its cell (and overlaps neighbors) whenever the
// container is narrower than columns * size, e.g. a smaller window or an
// extra tile added to a fixed-count row.
const ASPECT_CLASSES = {
  landscape: 'aspect-[2/1]',
  portrait: 'aspect-[2/3]',
  large: 'aspect-[3/2]'
}

const TITLE_SIZE_CLASSES = {
  default: 'text-lg',
  large: 'text-2xl'
}

export function FocusableCard({
  item,
  focused,
  size = 'default',
  aspect = 'landscape',
  onClick
}: FocusableCardProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(item.imageUrl) && !imageFailed
  const aspectClass = size === 'large' ? ASPECT_CLASSES.large : ASPECT_CLASSES[aspect]

  return (
    <motion.div
      onClick={onClick}
      animate={{ scale: focused ? 1.08 : 1, y: focused ? -6 : 0 }}
      whileTap={{ scale: focused ? 1.03 : 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`relative flex w-full ${aspectClass} shrink-0 flex-col justify-end overflow-hidden rounded-2xl ring-1 transition-shadow duration-200 ${
        onClick ? 'cursor-pointer' : ''
      } ${focused ? 'shadow-focus ring-white/10' : 'ring-white/5'} ${
        showImage ? 'bg-surface' : focused ? 'bg-surface-hi' : 'bg-surface'
      }`}
    >
      {showImage && (
        <>
          <img
            src={item.imageUrl}
            onError={() => setImageFailed(true)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        </>
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
