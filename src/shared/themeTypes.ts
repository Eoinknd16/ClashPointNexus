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

/** What a theme pack's theme.json must contain — image fields are plain
 * filenames relative to the pack's own folder (installThemeFromFolder
 * resolves + copies them into real file:// paths afterward), not the
 * resolved ThemeDefinition shape above. */
export interface ThemePackManifest {
  name: string
  vars: Record<string, string>
  heroImage?: string
  tileImages?: Record<string, string>
}

export interface ThemeInstallResult {
  success: boolean
  error: string | null
  theme: ThemeDefinition | null
}
