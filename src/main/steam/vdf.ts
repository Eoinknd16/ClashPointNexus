export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

/** Minimal parser for Valve's KeyValues/VDF text format used by Steam's local metadata files. */
export function parseVdf(text: string): VdfObject {
  let i = 0
  const len = text.length

  function skipWhitespaceAndComments(): void {
    for (;;) {
      while (i < len && /\s/.test(text[i])) i++
      if (text[i] === '/' && text[i + 1] === '/') {
        while (i < len && text[i] !== '\n') i++
        continue
      }
      break
    }
  }

  function readString(): string {
    i++ // opening quote
    let result = ''
    while (i < len && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < len) {
        result += text[i + 1]
        i += 2
      } else {
        result += text[i]
        i++
      }
    }
    i++ // closing quote
    return result
  }

  function parseObject(): VdfObject {
    const obj: VdfObject = {}
    for (;;) {
      skipWhitespaceAndComments()
      if (i >= len || text[i] === '}') {
        i++
        break
      }
      if (text[i] !== '"') {
        i++ // skip unexpected token rather than looping forever
        continue
      }
      const key = readString()
      skipWhitespaceAndComments()
      if (text[i] === '{') {
        i++
        obj[key] = parseObject()
      } else if (text[i] === '"') {
        obj[key] = readString()
      } else {
        obj[key] = ''
      }
    }
    return obj
  }

  return parseObject()
}
