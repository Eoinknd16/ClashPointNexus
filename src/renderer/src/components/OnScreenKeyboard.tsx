import { useEffect, useRef } from 'react'
import { KEY_ROWS } from './onScreenKeyboardLayout'

interface OnScreenKeyboardProps {
  label: string
  value: string
  masked?: boolean
  shift: boolean
  focusedRow: number
  focusedCol: number
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  onKeyPress: (key: string) => void
}

const KEY_GLYPHS: Record<string, string> = {
  SPACE: '␣',
  BACKSPACE: '⌫',
  SHIFT: '⇧',
  CLEAR: 'Clear',
  DONE: 'Done'
}

export function OnScreenKeyboard({
  label,
  value,
  masked,
  shift,
  focusedRow,
  focusedCol,
  onChange,
  onSubmit,
  onCancel,
  onKeyPress
}: OnScreenKeyboardProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Autofocus so a real keyboard/paste works immediately, no click required —
  // controller users ignore this and drive the grid below via d-pad instead.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="flex w-[720px] flex-col gap-6 rounded-2xl bg-surface p-8">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <input
            ref={inputRef}
            type={masked ? 'password' : 'text'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
            className="min-h-[2.5rem] w-full break-all rounded-lg bg-bg px-4 py-2 text-xl outline-none ring-accent focus:ring-2"
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          {KEY_ROWS.map((row, r) => (
            <div key={r} className="flex gap-2">
              {row.map((key, c) => {
                const focused = r === focusedRow && c === focusedCol
                const isWide = key.length > 1
                const glyph = KEY_GLYPHS[key] ?? (shift ? key.toUpperCase() : key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onKeyPress(key)}
                    className={`flex h-12 items-center justify-center rounded-lg text-base font-medium ${
                      isWide ? 'px-4' : 'w-10'
                    } ${focused ? 'bg-accent text-white' : 'bg-surface-hi text-white'}`}
                  >
                    {glyph}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
