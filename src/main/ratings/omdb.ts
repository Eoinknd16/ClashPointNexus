import { getOmdbApiKey } from './config'

interface OmdbRating {
  Source: string
  Value: string
}

interface OmdbResponse {
  Response: string
  Ratings?: OmdbRating[]
}

// OMDb reuses IMDb's own source name verbatim ("Internet Movie Database") —
// shortened here since the detail panel already shows the plain IMDb rating
// separately (straight from Cinemeta), so this list is really "everything
// besides IMDb", just labeled for whatever OMDb happens to send back.
const SOURCE_LABELS: Record<string, string> = {
  'Internet Movie Database': 'IMDb',
  'Rotten Tomatoes': 'Rotten Tomatoes',
  Metacritic: 'Metacritic'
}

/**
 * OMDb (omdbapi.com) is the only free, public source that aggregates
 * multiple critics' scores (Rotten Tomatoes, Metacritic, alongside IMDb) in
 * one call — needs the user's own free API key (omdbapi.com/apikey.aspx),
 * same pattern as the Steam API key: never bundled or shared, and this
 * entire feature quietly no-ops (empty array) rather than erroring when no
 * key is configured, since it's pure enrichment, not something playback or
 * browsing depends on.
 */
export async function fetchExternalRatings(imdbId: string): Promise<Array<{ source: string; value: string }>> {
  const apiKey = getOmdbApiKey()
  if (!apiKey) return []
  try {
    const response = await fetch(
      `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!response.ok) return []
    const data = (await response.json()) as OmdbResponse
    if (data.Response !== 'True' || !data.Ratings) return []
    return data.Ratings.map((r) => ({ source: SOURCE_LABELS[r.Source] ?? r.Source, value: r.Value }))
  } catch {
    return []
  }
}
