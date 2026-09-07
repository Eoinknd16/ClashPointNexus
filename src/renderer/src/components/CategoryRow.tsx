import { useEffect, useRef, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
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
// special-casing needed in FocusableCard itself. The base 260px/180px track
// widths are scaled by --card-scale (theme's Card Size setting, see
// shared/themeStyle.ts) rather than resized on FocusableCard itself, which
// would fight framer-motion's own transform on that same element.
const ROW_CLASSES = {
  landscape: 'grid auto-cols-[calc(260px*var(--card-scale))] grid-flow-col overflow-x-hidden',
  portrait: 'grid auto-cols-[calc(180px*var(--card-scale))] grid-flow-col overflow-x-hidden'
}

// Two separate things have to be accounted for here, not just one:
// - Padding: overflow-x-hidden forces the vertical axis to clip too (per
//   spec, an axis set to non-visible forces the other to "auto") — without
//   room reserved on every side, a focused card's growth gets cut off by
//   this container's own edges.
// - Gap: transform: scale() doesn't reserve extra layout space, so a focused
//   card grows past its own column and can overlap the *next* card — the gap
//   has to be wide enough to absorb that growth (plus the glow) before it
//   reaches the next card.
//
// Both used to be flat numbers (px-4/py-5, --space-grid-gap alone) tuned to
// look right at default Card Size + default Animation Style — which is
// exactly why cranking either setting up (a "Large" card, a "Bouncy" focus
// spring) kept silently reopening this same clipping bug on one screen after
// another. A focused card's real growth is `trackSize * cardScale *
// (motionScaleFocus - 1) / 2` per side, plus the motion preset's own lift,
// plus a flat allowance for shadow-focus's crisp ring/inner glow (see
// colorMath.ts — the ring itself is fixed, only its faint outer 48px halo
// isn't fully covered here, which is unnoticeable once it's faded that far
// out) — computing it directly from the same --card-scale/--motion-scale-
// focus/--motion-lift vars those settings actually write means this is
// always exactly enough, for any combination the user picks, forever.
// Gap is wrapped in max() so it never shrinks below the Spacing setting's
// own --space-grid-gap value, only grows past it when growth demands it.
const ROW_LAYOUT: Record<'landscape' | 'portrait', CSSProperties> = {
  landscape: {
    paddingInline: 'calc(260px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + 14px)',
    paddingBlock:
      'calc(130px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + var(--motion-lift) * 1px + 14px)',
    gap: 'max(var(--space-grid-gap), calc(260px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + 14px))'
  },
  portrait: {
    paddingInline: 'calc(180px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + 14px)',
    paddingBlock:
      'calc(270px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + var(--motion-lift) * 1px + 14px)',
    gap: 'max(var(--space-grid-gap), calc(180px * var(--card-scale) * (var(--motion-scale-focus) - 1) / 2 + 14px))'
  }
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
      <div className={ROW_CLASSES[aspect]} style={ROW_LAYOUT[aspect]}>
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
            className={`scroll-m-8 flex w-full ${ASPECT_CLASSES[aspect]} shrink-0 cursor-pointer items-center justify-center rounded-card border-2 border-dashed transition-colors ${
              focused && focusedIndex === items.length
                ? 'shadow-focus border-accent text-accent'
                : 'border-white/10 text-muted'
            }`}
          >
            <span className="flex items-center gap-1 text-sm font-semibold">
              See All <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        )}
      </div>
    </motion.section>
  )
}
