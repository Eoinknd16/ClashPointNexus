/** A user-registered arbitrary application — the whole point of not hard-
 * coding what's launchable, per the "almost a full OS" vision: Add
 * Application (currently: from the File Manager, picking any .exe) makes
 * anything launchable from Nexus, not just Steam/Stremio. */
export interface AppEntry {
  id: string
  name: string
  executablePath: string
  /** Raw args string, split on whitespace at launch time — empty string, not undefined, when there are none. */
  args: string
  favorite: boolean
  addedAt: number
}
