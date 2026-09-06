/** Shared by Settings' Appearance tab and the Store's Themes section — both
 * expose the same "drop a pack folder in, then pick it up" actions rather
 * than each keeping its own copy of this logic. */
export function openThemesFolder(): void {
  void window.api.settings.openThemesFolder()
}

// Only ever adds themes (never updates/removes) — see scanThemesDropFolder's
// own docs for why a folder that's already installed is always a no-op, so
// it's safe to call this as often as the user likes.
export async function rescanThemesFolder(
  refreshCustomThemes: () => Promise<void>,
  setMessage: (message: string) => void
): Promise<void> {
  setMessage('Scanning Themes folder...')
  try {
    const result = await window.api.settings.scanThemesFolder()
    if (result.installed.length > 0) {
      await refreshCustomThemes()
      setMessage(`Installed ${result.installed.length} new theme(s): ${result.installed.join(', ')}`)
    } else if (result.errors.length > 0) {
      setMessage(`No new themes — ${result.errors.length} folder(s) had errors (missing/invalid theme.json)`)
    } else {
      setMessage('No new theme pack folders found')
    }
  } catch (error) {
    setMessage(`Rescan failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
