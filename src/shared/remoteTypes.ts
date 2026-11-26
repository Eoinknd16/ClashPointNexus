import type { CatalogItem, CatalogType } from './stremioTypes'

/** The phone app (ClashPointNexus-Android) talks to this port over the LAN
 * or Tailscale. Must match PcLinkConfig.DEFAULT_PORT on the Android side. */
export const REMOTE_API_PORT = 11480

/** Everything Settings > Phone Link shows. */
export interface RemotePairingInfo {
  listening: boolean
  /** Why the server isn't listening, when it isn't (port in use, etc.). */
  error: string | null
  port: number
  /** This PC's non-internal IPv4 addresses -- what to type on the phone. */
  addresses: string[]
  /** Current one-time pairing code, or null if none is active. */
  code: string | null
  codeExpiresAt: number | null
  devices: RemoteDevice[]
}

export interface RemoteDevice {
  id: string
  name: string
  createdAt: number
  lastSeenAt: number | null
}

/** "Play this on the TV", sent from the phone. The main process has already
 * resolved `playableUrl` when the phone sent a specific stream (a direct URL,
 * or a torrent against the local Stremio server); otherwise TvScreen resolves
 * streams itself from this PC's own addons, the same as pressing Play. */
export interface RemoteCastPayload {
  tab: CatalogType
  item: CatalogItem
  episodeId: string | null
  season: number | null
  episode: number | null
  positionSeconds: number
  playableUrl: string | null
}
