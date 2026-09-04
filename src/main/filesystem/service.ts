import { app, shell } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { dirname, join, parse } from 'path'
import type { DirectoryListing, FileEntry } from '@shared/filesystemTypes'

/** No wmic dependency (deprecated on newer Windows) — just probes each letter directly. */
export function listDrives(): FileEntry[] {
  const drives: FileEntry[] = []
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const drivePath = `${letter}:\\`
    if (existsSync(drivePath)) {
      drives.push({ name: `${letter}:`, path: drivePath, isDirectory: true, size: 0, modifiedAt: 0 })
    }
  }
  return drives
}

export function getHomeDirectory(): string {
  return app.getPath('home')
}

/** Folders first, then alphabetical within each group — skips entries that fail to
 * stat (permission-denied, broken symlinks) rather than failing the whole listing. */
export function listDirectory(dirPath: string): DirectoryListing {
  try {
    const names = readdirSync(dirPath)
    const entries: FileEntry[] = []
    for (const name of names) {
      const fullPath = join(dirPath, name)
      try {
        const stat = statSync(fullPath)
        entries.push({
          name,
          path: fullPath,
          isDirectory: stat.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtimeMs
        })
      } catch {
        continue
      }
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { path: dirPath, entries, error: null }
  } catch (error) {
    return { path: dirPath, entries: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** null means dirPath is already a drive root — the caller should show the
 * drives/shortcuts list instead of trying to go further up. */
export function getParentPath(dirPath: string): string | null {
  const parsed = parse(dirPath)
  if (dirPath === parsed.root) return null
  return dirname(dirPath)
}

/** Opens with the OS's default associated app — same as double-clicking in
 * Explorer. Resolves to an error string on failure, null on success. */
export async function openPath(targetPath: string): Promise<string | null> {
  const result = await shell.openPath(targetPath)
  return result || null
}
