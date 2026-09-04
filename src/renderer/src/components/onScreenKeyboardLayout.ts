export const KEY_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@', '-', '_'],
  ['SPACE', 'BACKSPACE', 'SHIFT', 'CLEAR', 'DONE']
]

export function clampKeyboardFocus(row: number, col: number): { row: number; col: number } {
  const clampedRow = Math.max(0, Math.min(KEY_ROWS.length - 1, row))
  const clampedCol = Math.max(0, Math.min(KEY_ROWS[clampedRow].length - 1, col))
  return { row: clampedRow, col: clampedCol }
}

export interface KeyPressResult {
  value: string
  shift: boolean
  done: boolean
}

export function applyKey(key: string, value: string, shift: boolean): KeyPressResult {
  switch (key) {
    case 'SPACE':
      return { value: value + ' ', shift, done: false }
    case 'BACKSPACE':
      return { value: value.slice(0, -1), shift, done: false }
    case 'SHIFT':
      return { value, shift: !shift, done: false }
    case 'CLEAR':
      return { value: '', shift, done: false }
    case 'DONE':
      return { value, shift, done: true }
    default:
      return { value: value + (shift ? key.toUpperCase() : key), shift, done: false }
  }
}
