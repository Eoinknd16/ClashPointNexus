import type { AddonSummary } from '@shared/stremioTypes'
import { normalizeAddonUrl } from './streamAddons'

const API_BASE = 'https://api.strem.io'

interface ApiErrorBody {
  message?: string
}

interface ApiResponse<T> {
  result?: T
  error?: ApiErrorBody | string
}

/** Matches the request/response shape of Stremio's own official api-client (github.com/Stremio/stremio-api-client). */
async function callApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    throw new Error(`Stremio API responded with ${response.status}`)
  }

  const data = (await response.json()) as ApiResponse<T>
  if (data.error) {
    const message = typeof data.error === 'string' ? data.error : data.error.message
    throw new Error(message ?? 'Stremio API request failed')
  }
  if (!data.result) {
    throw new Error('Stremio API returned no result')
  }
  return data.result
}

export async function stremioLogin(email: string, password: string): Promise<string> {
  const result = await callApi<{ authKey: string }>('login', { email, password })
  return result.authKey
}

interface AddonResource {
  name: string
}

interface AddonManifest {
  name?: string
  resources?: Array<string | AddonResource>
}

interface AddonDescriptor {
  transportUrl: string
  manifest: AddonManifest
}

function resourceNames(manifest: AddonManifest): string[] {
  return (manifest.resources ?? []).map((r) => (typeof r === 'string' ? r : r.name))
}

/** Pulls the account's ENTIRE installed addon collection — same set/order as the real app, not filtered. */
export async function fetchAccountAddons(authKey: string): Promise<AddonSummary[]> {
  const result = await callApi<{ addons: AddonDescriptor[] }>('addonCollectionGet', {
    authKey,
    update: true,
    addFromURL: []
  })

  return result.addons.map((addon) => ({
    name: addon.manifest.name ?? new URL(addon.transportUrl).host,
    url: normalizeAddonUrl(addon.transportUrl),
    resources: resourceNames(addon.manifest)
  }))
}

/** Fetches an addon's manifest.json directly — used when a user manually adds an addon URL in Settings. */
export async function fetchAddonManifestInfo(
  addonUrl: string
): Promise<{ name: string; resources: string[] }> {
  const base = normalizeAddonUrl(addonUrl)
  const response = await fetch(`${base}/manifest.json`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Addon manifest fetch failed with ${response.status}`)
  const data = (await response.json()) as AddonManifest
  return { name: data.name ?? new URL(base).host, resources: resourceNames(data) }
}
