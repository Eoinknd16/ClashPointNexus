import { execFileSync } from 'child_process'
import { dirname } from 'path'

/**
 * Stremio's desktop install registers a stremio:// protocol handler pointing at its
 * shell exe; the streaming/torrent engine (server.js/stremio-runtime.exe) and the
 * bundled ffmpeg/ffprobe binaries all live in that same install directory.
 */
export function findStremioInstallDir(): string | null {
  try {
    const output = execFileSync('reg', [
      'query',
      'HKCU\\Software\\Classes\\stremio\\shell\\open\\command'
    ]).toString('utf-8')
    const match = output.match(/\(Default\)\s+REG_SZ\s+(.+)/)
    if (!match) return null
    const exePathMatch = match[1].match(/"([^"]+)"/)
    const exePath = exePathMatch ? exePathMatch[1] : match[1].trim()
    return dirname(exePath)
  } catch {
    return null
  }
}
