const RESOLUTION_PATTERNS: Array<[RegExp, string]> = [
  [/2160p|\b4k\b/i, '4K'],
  [/1440p/i, '1440p'],
  [/1080p/i, '1080p'],
  [/720p/i, '720p'],
  [/480p/i, '480p']
]

export function extractResolution(text: string): string | null {
  for (const [pattern, label] of RESOLUTION_PATTERNS) {
    if (pattern.test(text)) return label
  }
  return null
}

// Best-effort — release titles have no fixed schema, this just catches the
// common conventions (dotted/bracketed 3-letter codes, Cyrillic script).
const LANGUAGE_CODE_MAP: Record<string, string> = {
  eng: 'English',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  spa: 'Spanish',
  cze: 'Czech',
  hun: 'Hungarian',
  pol: 'Polish',
  hin: 'Hindi',
  jpn: 'Japanese',
  rus: 'Russian',
  ukr: 'Ukrainian',
  kor: 'Korean',
  chi: 'Chinese',
  ara: 'Arabic',
  por: 'Portuguese',
  dut: 'Dutch',
  nld: 'Dutch',
  gre: 'Greek',
  tur: 'Turkish',
  heb: 'Hebrew',
  swe: 'Swedish'
}

export function extractLanguages(text: string): string[] {
  const found = new Set<string>()

  for (const code of text.match(/\b[A-Za-z]{3}\b/g) ?? []) {
    const name = LANGUAGE_CODE_MAP[code.toLowerCase()]
    if (name) found.add(name)
  }
  if (/[Ѐ-ӿ]/.test(text)) found.add('Russian')

  return [...found]
}
