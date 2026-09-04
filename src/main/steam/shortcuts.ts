import { existsSync, readFileSync } from 'fs'
import { extname, join } from 'path'

export interface NonSteamShortcut {
  name: string
  launchGameId: string
  lastPlayed: number
  /** data: URI for locally-set custom artwork, if any — non-Steam games have no CDN box art. */
  imageDataUrl?: string
}

type BinaryVdfValue = string | number | BinaryVdfObject
interface BinaryVdfObject {
  [key: string]: BinaryVdfValue
}

const TYPE_OBJECT = 0x00
const TYPE_STRING = 0x01
const TYPE_INT32 = 0x02
const TYPE_END = 0x08

/** Parser for Steam's binary VDF format (distinct from the text VDF used by appmanifest/libraryfolders) — used only by shortcuts.vdf. */
function parseBinaryVdf(buf: Buffer): BinaryVdfObject {
  let i = 0

  function readCString(): string {
    const start = i
    while (i < buf.length && buf[i] !== 0x00) i++
    const str = buf.toString('utf-8', start, i)
    i++
    return str
  }

  function parseObject(): BinaryVdfObject {
    const obj: BinaryVdfObject = {}
    for (;;) {
      if (i >= buf.length) break
      const type = buf[i]
      i++
      if (type === TYPE_END) break

      const key = readCString()
      if (type === TYPE_OBJECT) {
        obj[key] = parseObject()
      } else if (type === TYPE_STRING) {
        obj[key] = readCString()
      } else if (type === TYPE_INT32) {
        obj[key] = buf.readInt32LE(i)
        i += 4
      } else {
        // Unknown field type — stop rather than reading garbage at a desynced offset.
        break
      }
    }
    return obj
  }

  return parseObject()
}

/**
 * Steam's steam:// protocol launches non-Steam shortcuts via a synthetic 64-bit
 * "gameid", derived from the 32-bit id stored in shortcuts.vdf: reinterpret it as
 * unsigned, shift into the high 32 bits, and OR in the 0x02000000 shortcut flag.
 * This is the same derivation Steam's own client and community tools (Playnite,
 * GloSC, etc.) use — there's no official public spec for it.
 */
function shortcutLaunchGameId(storedAppId: number): string {
  const unsigned = storedAppId >>> 0
  const gameId = (BigInt(unsigned) << 32n) | 0x02000000n
  return gameId.toString()
}

// Steam's "set custom artwork" feature (both Steam and non-Steam games) stores
// files under userdata/<account>/config/grid/<gameid><suffix> — landscape
// header art first (matches our card aspect), falling back to the portrait
// grid capsule if that's all the user has set. Non-Steam games have no
// official CDN art at all, so this is the only real image source for them.
const GRID_IMAGE_SUFFIXES = ['_header.png', '_header.jpg', '.png', '.jpg']

function mimeTypeForExt(ext: string): string {
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
}

function findGridImage(steamPath: string, accountId: string, gameId: string): string | undefined {
  const gridDir = join(steamPath, 'userdata', accountId, 'config', 'grid')
  for (const suffix of GRID_IMAGE_SUFFIXES) {
    const path = join(gridDir, `${gameId}${suffix}`)
    if (!existsSync(path)) continue
    try {
      const data = readFileSync(path).toString('base64')
      return `data:${mimeTypeForExt(extname(path))};base64,${data}`
    } catch {
      continue
    }
  }
  return undefined
}

function accountIdFromSteamId64(steamId64: string): string | null {
  try {
    const accountId = BigInt(steamId64) - 76561197960265728n
    return accountId > 0n ? accountId.toString() : null
  } catch {
    return null
  }
}

/** Reads the active account's Steam "Add a Non-Steam Game" shortcuts. */
export function getNonSteamShortcuts(steamPath: string, steamId64: string): NonSteamShortcut[] {
  const accountId = accountIdFromSteamId64(steamId64)
  if (!accountId) return []

  const shortcutsPath = join(steamPath, 'userdata', accountId, 'config', 'shortcuts.vdf')
  if (!existsSync(shortcutsPath)) return []

  try {
    const root = parseBinaryVdf(readFileSync(shortcutsPath))
    const entries = root['shortcuts']
    if (typeof entries !== 'object') return []

    const shortcuts: NonSteamShortcut[] = []
    for (const entry of Object.values(entries)) {
      if (typeof entry !== 'object') continue
      const appid = entry['appid']
      const appName = entry['AppName']
      if (typeof appid !== 'number' || typeof appName !== 'string') continue

      const launchGameId = shortcutLaunchGameId(appid)
      shortcuts.push({
        name: appName,
        launchGameId,
        lastPlayed: typeof entry['LastPlayTime'] === 'number' ? entry['LastPlayTime'] : 0,
        imageDataUrl: findGridImage(steamPath, accountId, launchGameId)
      })
    }
    return shortcuts
  } catch {
    return []
  }
}
