import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ASPECT_CLASSES, FocusableCard, type CardItem } from './FocusableCard'

interface CategoryRowProps {
  label: string
  items: CardItem[]
  focused: boolean
  focusedIndex: number
  aspect?: 'landscape' | 'portrait'
  onSelect: (index: number) => void
  /** When provided, appends a trailing "See all" tile at index items.length. */
  onSeeMore?: () => void
}

// Fixed-width columns (via grid-auto-flow: column) let the row scroll
// horizontally while each FocusableCard still just fills its own column —
// the same w-full-fills-its-track pattern used everywhere else, so no
// special-casing needed in FocusableCard itself.
//
// Two separate things have to be accounted for here, not just one:
// - Padding: overflow-x-hidden forces the vertical axis to clip too (per
//   spec, an axis set to non-visible forces the other to "auto") — without
//   room reserved on every side, a focused card's growth gets cut off by
//   this container's own edges.
// - Gap: transform: scale() doesn't reserve extra layout space, so a focused
//   card grows past its own column and can overlap the *next* card — the gap
//   has to be wide enough to absorb that growth (plus the glow) on its own.
const ROW_CLASSES = {
  landscape: 'grid auto-cols-[260px] grid-flow-col gap-8 overflow-x-hidden px-4 py-5',
  portrait: 'grid auto-cols-[180px] grid-flow-col gap-8 overflow-x-hidden px-4 py-5'
}

export function CategoryRow({
  label,
  items,
  focused,
  focusedIndex,
  aspect = 'landscape',
  onSelect,
  onSeeMore
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
          <div key={item.id} ref={(el) => (cardRefs.current[i] = el)} className="scroll-m-8">
            <FocusableCard
              item={item}
              aspect={aspect}
              focused={focused && focusedIndex === i}
              onClick={() => onSelect(i)}
            />
          </div>
        ))}
        {onSeeMore && items.length > 0 && (
          <div
            ref={(el) => (cardRefs.current[items.length] = el)}
            onClick={onSeeMore}
            className={`scroll-m-8 flex w-full ${ASPECT_CLASSES[aspect]} shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
              focused && focusedIndex === items.length
                ? 'shadow-focus border-accent text-accent'
                : 'border-white/10 text-muted'
            }`}
          >
            <span className="text-sm font-semibold">See All →</span>
          </div>
        )}
      </div>
    </motion.section>
  )
}
