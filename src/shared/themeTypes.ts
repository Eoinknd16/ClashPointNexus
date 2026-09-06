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

/** One theme pack folder listed in the public community repo (Store's
 * "Community Themes" row) — enough to render a preview card without
 * downloading anything; installCommunityTheme fetches the rest on demand. */
export interface CommunityThemeSummary {
  /** Folder name in the repo — also its identity: installing derives the
   * same id from it that a local Themes-folder pack of the same name would. */
  folder: string
  name: string
  /** Hot-linked raw.githubusercontent.com URL for the pack's own hero/first
   * tile image, or null if it has neither — this repo is the user's own, so
   * linking directly to it for a preview (rather than downloading first) is
   * not the kind of hotlinking this app otherwise avoids. */
  previewUrl: string | null
}

/** The public repo Store's Community Themes row reads from, and where
 * "Prepare Submission" points the user to upload their exported folder —
 * one place to update if it's ever renamed or moved. */
export const COMMUNITY_THEMES_REPO = { owner: 'Eoinknd16', name: 'ClashPointNexus-Themes', branch: 'main' } as const

/** Result of packaging a custom/installed theme into a shareable folder
 * (see themeSubmission.ts) — the user uploads exportPath to the community
 * repo themselves; this never touches GitHub. */
export interface ThemeSubmissionResult {
  success: boolean
  error: string | null
  exportPath: string | null
}
