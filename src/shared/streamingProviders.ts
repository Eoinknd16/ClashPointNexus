/** The legal, DRM-respecting half of "watch this anywhere" — Nexus can't
 * play Netflix/Prime/Disney+/etc. video in its own player (that would mean
 * circumventing their DRM, which is illegal regardless of whether the
 * underlying subscription is legitimate — see streaming/tmdb.ts's own docs).
 * What it CAN legally do is know which of these services carries a title
 * and hand off to the real thing, same "unify everything, launch the
 * official app" model Apple TV/Google TV/Fire TV already use.
 *
 * tmdbNames match TMDb's own `provider_name` strings from its watch/providers
 * endpoint (exact, case-insensitive) — matched by full name rather than a
 * substring guess, since a short name like "Max" would false-positive
 * against unrelated providers under substring matching.
 *
 * searchUrl builds each service's own public search page with the title
 * pre-filled — not a per-title deep link (no legal API hands those out),
 * but every one of these is a plain public URL a person could type in
 * themselves, so this is just automating that, not scraping or bypassing
 * anything.
 */
export interface StreamingService {
  id: string
  name: string
  tmdbNames: string[]
  searchUrl: (title: string) => string
}

export const STREAMING_SERVICES: StreamingService[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    tmdbNames: ['Netflix'],
    searchUrl: (title) => `https://www.netflix.com/search?q=${encodeURIComponent(title)}`
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    tmdbNames: ['Amazon Prime Video', 'Prime Video'],
    searchUrl: (title) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(title)}`
  },
  {
    id: 'disneyplus',
    name: 'Disney+',
    tmdbNames: ['Disney Plus'],
    searchUrl: (title) => `https://www.disneyplus.com/search?q=${encodeURIComponent(title)}`
  },
  {
    id: 'hulu',
    name: 'Hulu',
    tmdbNames: ['Hulu'],
    searchUrl: (title) => `https://www.hulu.com/search?q=${encodeURIComponent(title)}`
  },
  {
    id: 'max',
    name: 'Max',
    tmdbNames: ['Max', 'HBO Max'],
    searchUrl: (title) => `https://play.max.com/search?q=${encodeURIComponent(title)}`
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    tmdbNames: ['Apple TV Plus', 'Apple TV+'],
    searchUrl: (title) => `https://tv.apple.com/search?term=${encodeURIComponent(title)}`
  },
  {
    id: 'paramountplus',
    name: 'Paramount+',
    tmdbNames: ['Paramount Plus', 'Paramount+'],
    searchUrl: (title) => `https://www.paramountplus.com/search/?query=${encodeURIComponent(title)}`
  },
  {
    id: 'peacock',
    name: 'Peacock',
    tmdbNames: ['Peacock', 'Peacock Premium'],
    searchUrl: (title) => `https://www.peacocktv.com/search?q=${encodeURIComponent(title)}`
  }
]

export interface WatchAvailability {
  /** Ids from STREAMING_SERVICES this title is included with a subscription
   * on (TMDb's "flatrate" category) — the only category shown for now;
   * rent/buy-only availability isn't surfaced, to keep "available" meaning
   * "just press play", not "pay again for something you may not want to buy". */
  serviceIds: string[]
}
