import { app, shell } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { basename, dirname, join, parse } from 'path'
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function renameEntry(targetPath: string, newName: string): string | null {
  try {
    renameSync(targetPath, join(dirname(targetPath), newName))
    return null
  } catch (error) {
    return errorMessage(error)
  }
}

/** Recycle Bin, not a permanent delete — reversible from Windows if a bound
 * button fires it by mistake, unlike fs.rmSync. */
export async function deleteEntry(targetPath: string): Promise<string | null> {
  try {
    await shell.trashItem(targetPath)
    return null
  } catch (error) {
    return errorMessage(error)
  }
}

export function createFolder(parentDir: string, name: string): string | null {
  try {
    mkdirSync(join(parentDir, name))
    return null
  } catch (error) {
    return errorMessage(error)
  }
}

export function copyEntry(sourcePath: string, destDir: string): string | null {
  try {
    cpSync(sourcePath, join(destDir, basename(sourcePath)), { recursive: true, errorOnExist: true })
    return null
  } catch (error) {
    return errorMessage(error)
  }
}

/** Cut/paste. renameSync is instant but fails across drives (EXDEV) — falls
 * back to copy-then-delete-original in that case, still one atomic-feeling op
 * from the UI's perspective. */
export function moveEntry(sourcePath: string, destDir: string): string | null {
  const destPath = join(destDir, basename(sourcePath))
  try {
    renameSync(sourcePath, destPath)
    return null
  } catch {
    try {
      cpSync(sourcePath, destPath, { recursive: true, errorOnExist: true })
      rmSync(sourcePath, { recursive: true })
      return null
    } catch (error) {
      return errorMessage(error)
    }
  }
}
