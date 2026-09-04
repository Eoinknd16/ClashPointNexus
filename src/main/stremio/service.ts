import type { CatalogItem, CatalogType, StreamResult } from '@shared/stremioTypes'
import { fetchCatalog, fetchReleaseDate } from './cinemeta'
import { loadStremioConfig } from './config'
import { ensureStremioServer, localStreamUrl } from './server'
import { extractLanguages, extractResolution } from './streamMeta'
import { fetchStreamsFromAddon, type RawStreamResult } from './streamAddons'

export async function getCatalog(type: CatalogType, catalogId: string): Promise<CatalogItem[]> {
  return fetchCatalog(type, catalogId)
}

export async function getReleaseDate(type: CatalogType, id: string): Promise<string | null> {
  return fetchReleaseDate(type, id)
}

/** Resolves playable stream URLs for a title via whatever of the user's addons can resolve streams. */
export async function getStreamOptions(type: CatalogType, id: string): Promise<StreamResult> {
  const config = loadStremioConfig()
  const streamAddons = config.addons.filter((a) => a.resources.includes('stream'))
  if (streamAddons.length === 0) {
    return { streams: [], hasAddonsConfigured: false, serverAvailable: false }
  }

  const serverAvailable = await ensureStremioServer()

  const perAddon = await Promise.all(
    streamAddons.map(async (addon) => ({
      addon,
      raw: await fetchStreamsFromAddon(addon.url, type, id)
    }))
  )

  // Order is intentionally left exactly as your addons are configured (addon order,
  // then that addon's own internal ranking) — this should mirror the real Stremio
  // app's stream list, not get reshuffled by any preference of ours.
  const streams: StreamResult['streams'] = []
  for (const { addon, raw } of perAddon) {
    for (const item of raw) {
      streams.push(buildStreamOption(item, addon.name, serverAvailable))
    }
  }

  return { streams, hasAddonsConfigured: true, serverAvailable }
}

function buildStreamOption(
  raw: RawStreamResult,
  addonName: string,
  serverAvailable: boolean
): StreamResult['streams'][number] {
  const playableUrl = raw.url
    ? raw.url
    : raw.infoHash && serverAvailable
      ? localStreamUrl(raw.infoHash, raw.fileIdx ?? 0)
      : null

  return {
    title: raw.title,
    playableUrl,
    addonName,
    resolution: extractResolution(raw.title),
    languages: extractLanguages(raw.title)
  }
}
