/** UI Scale presets (Settings > App) — a browser zoom over the whole
 * renderer, for a TV/couch-viewing-distance display where the default size
 * renders too small or too large. Shared between main (applies it via
 * webContents.setZoomFactor, validates a persisted value against this same
 * list) and the renderer (Settings' own cycle-through-presets row), so
 * there's exactly one list to keep in sync rather than two. */
export const UI_SCALE_PRESETS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const
export const DEFAULT_UI_SCALE = 1
