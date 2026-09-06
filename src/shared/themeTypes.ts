/** A theme is a bag of CSS custom property values applied to :root (see
 * applyTheme.ts), plus optional real imagery an installed theme pack can
 * supply — the Home screen's hero backdrop and each app tile fall back to a
 * CSS/SVG scene and flat colors when these are absent (the built-in themes
 * never set them), but use the real file:// image directly when present. */
export interface ThemeDefinition {
  id: string
  name: string
  vars: Record<string, string>
  /** file:// URL to an installed theme pack's hero background image. */
  heroImage?: string
  /** file:// URLs to an installed theme pack's per-tile images, keyed by the
   * Home screen's tile id ("games", "tv", "browse", "files", "apps",
   * "arcade", "settings") — any tile not present here keeps its default
   * flat color. */
  tileImages?: Record<string, string>
}

/** What a theme pack's theme.json may contain — image fields are plain
 * filenames relative to the pack's own folder (installThemeFromFolder
 * resolves + copies them into real file:// paths afterward), not the
 * resolved ThemeDefinition shape above. vars is entirely optional: omitting
 * it (or just --color-accent/--color-accent-2 within it) falls back to
 * sensible dark-UI defaults, with the two accent colors auto-extracted from
 * the pack's own hero/tile images when possible. name is optional too — a
 * pack installed via a File Manager folder falls back to that folder's own
 * name when omitted, and a pack scanned from the Themes drop folder always
 * uses its folder's name regardless (see scanThemesDropFolder), so a
 * minimal pack can be just images with an empty (or absent) theme.json. */
export interface ThemePackManifest {
  name?: string
  vars?: Record<string, string>
  heroImage?: string
  tileImages?: Record<string, string>
}

export interface ThemeInstallResult {
  success: boolean
  error: string | null
  theme: ThemeDefinition | null
}

/** Result of scanning the Themes drop folder (see themesDropRoot) — each
 * subfolder not already installed gets installed, named after the folder
 * itself; anything already installed is left untouched (never re-derived),
 * so it can't clobber colors the user has since fine-tuned in-app. */
export interface ThemeScanResult {
  installed: string[]
  errors: Array<{ folder: string; error: string }>
}
