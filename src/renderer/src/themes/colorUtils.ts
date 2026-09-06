// Thin re-export — the actual math moved to @shared/colorMath so the main
// process (theme-pack install, auto-extracting accent colors from a pack's
// own images) can use the same functions without importing renderer code.
export { deriveThemeVars, hslToRgbTriplet, rgbTripletToHsl, type Hsl } from '@shared/colorMath'
