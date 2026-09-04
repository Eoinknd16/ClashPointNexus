import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { FocusableCard, type CardItem } from './FocusableCard'

interface CategoryRowProps {
  label: string
  items: CardItem[]
  focused: boolean
  focusedIndex: number
  aspect?: 'landscape' | 'portrait'
  onSelect: (index: number) => void
}

// Fixed-width columns (via grid-auto-flow: column) let the row scroll
// horizontally while each FocusableCard still just fills its own column —
// the same w-full-fills-its-track pattern used everywhere else, so no
// special-casing needed in FocusableCard itself.
//
// Generous padding here is load-bearing, not cosmetic: a focused card scales
// up via transform (see FocusableCard), and overflow-x-hidden forces the
// vertical axis to clip too (per spec, an axis set to non-visible forces the
// other to "auto") — without room reserved on every side, that growth gets
// cut off by this container's own edges.
const ROW_CLASSES = {
  landscape: 'grid auto-cols-[260px] grid-flow-col gap-5 overflow-x-hidden px-3 py-4',
  portrait: 'grid auto-cols-[180px] grid-flow-col gap-5 overflow-x-hidden px-3 py-4'
}

export function CategoryRow({
  label,
  items,
  focused,
  focusedIndex,
  aspect = 'landscape',
  onSelect
}: CategoryRowProps): JSX.Element {
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (!focused) return
    cardRefs.current[focusedIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    })
  }, [focused, focusedIndex])

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2 px-1">
        <span
          className={`h-4 w-1 rounded-full transition-colors duration-300 ${
            focused ? 'bg-accent' : 'bg-white/10'
          }`}
        />
        <h2
          className={`text-lg font-semibold tracking-tight transition-colors duration-300 ${
            focused ? 'text-white' : 'text-muted'
          }`}
        >
          {label}
        </h2>
      </div>
      <div className={ROW_CLASSES[aspect]}>
        {items.length === 0 && <span className="text-sm text-muted">Nothing here yet</span>}
        {items.map((item, i) => (
          <div key={item.id} ref={(el) => (cardRefs.current[i] = el)}>
            <FocusableCard
              item={item}
              aspect={aspect}
              focused={focused && focusedIndex === i}
              onClick={() => onSelect(i)}
            />
          </div>
        ))}
      </div>
    </motion.section>
  )
}
