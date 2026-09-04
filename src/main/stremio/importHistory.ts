import type { CatalogType } from '@shared/stremioTypes'
import type { StremioImportResult } from '@shared/settingsTypes'
import { addToLibrary } from '../library/config'
import { saveProgress } from '../progress/config'
import { fetchLibraryItems } from './account'
import { loadStremioConfig } from './config'

/** Series video ids look like "tt1234567:1:4" — season/episode are the 2nd/3rd segments. */
function parseVideoId(videoId: string): { season: number; episode: number } | null {
  const parts = videoId.split(':')
  if (parts.length < 3) return null
  const season = Number(parts[1])
  const episode = Number(parts[2])
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null
  return { season, episode }
}

/**
 * Pulls the account's Stremio library — the one collection behind both the
 * real app's Continue Watching and its Library page — and splits it across
 * our two separate stores: anything with real in-progress playback state
 * becomes a resume-progress entry, and anything not just transiently viewed
 * (`!temp`) becomes a My Library entry. A title can be both.
 */
export async function importStremioHistory(): Promise<StremioImportResult> {
  const config = loadStremioConfig()
  if (!config.authKey) {
    return { success: false, error: 'Not logged in', progressImported: 0, libraryImported: 0 }
  }

  try {
    const items = await fetchLibraryItems(config.authKey)
    let progressImported = 0
    let libraryImported = 0

    for (const item of items) {
      if (item.removed || !item.name) continue
      const type: CatalogType | null = item.type === 'movie' || item.type === 'series' ? item.type : null
      if (!type) continue

      const state = item.state
      if (state?.timeOffset && state.timeOffset > 0 && state.duration && state.duration > 0) {
        const positionSeconds = state.timeOffset / 1000
        const durationSeconds = state.duration / 1000
        const parsedDate = state.lastWatched ? Date.parse(state.lastWatched) : NaN
        const updatedAt = Number.isFinite(parsedDate) ? parsedDate : Date.now()

        if (type === 'movie') {
          saveProgress({ type: 'movie', id: item._id, positionSeconds, durationSeconds, updatedAt })
          progressImported++
        } else if (state.video_id) {
          const parsed = parseVideoId(state.video_id)
          if (parsed) {
            saveProgress({
              type: 'series',
              id: item._id,
              positionSeconds,
              durationSeconds,
              season: parsed.season,
              episode: parsed.episode,
              episodeId: state.video_id,
              updatedAt
            })
            progressImported++
          }
        }
      }

      if (!item.temp) {
        addToLibrary({ type, id: item._id, name: item.name, poster: item.poster ?? null })
        libraryImported++
      }
    }

    return { success: true, error: null, progressImported, libraryImported }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      progressImported: 0,
      libraryImported: 0
    }
  }
}
