import { COMMUNITY_PLUGINS_REPO, isPluginManifest, type CommunityPluginSummary, type PluginManifest } from '@shared/pluginTypes'

const { owner: REPO_OWNER, name: REPO_NAME, branch: REPO_BRANCH } = COMMUNITY_PLUGINS_REPO
const MANIFEST_FILENAME = 'plugin.json'

// jsDelivr's public GitHub CDN/API, not api.github.com directly — same
// reasoning as communityThemes.ts's identical rawUrl: api.github.com caps
// anonymous requests at 60/hour *per IP*, trivial to exhaust and then have
// this silently look like an empty store with no error surfaced anywhere.
function rawUrl(folder: string, filename: string): string {
  return `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`
}

async function fetchManifest(folder: string): Promise<PluginManifest | null> {
  try {
    const response = await fetch(rawUrl(folder, MANIFEST_FILENAME))
    if (!response.ok) return null
    const parsed = JSON.parse(await response.text())
    return isPluginManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

interface JsDelivrEntry {
  type: 'directory' | 'file'
  name: string
}

/**
 * Lists every plugin folder in the public community repo — there's no
 * server of our own here, just a GitHub repo reviewed/merged by hand (same
 * model as Community Themes). Best-effort throughout: an unreachable repo,
 * an empty one, or one bad/malformed folder just means it's missing from
 * the list, never a crash — and a manifest that fails isPluginManifest is
 * silently dropped rather than shown half-broken, since this repo takes
 * third-party submissions and a malformed one should fail closed.
 *
 * This only ever describes a plugin — nothing here downloads or runs one.
 */
export async function listCommunityPlugins(): Promise<CommunityPluginSummary[]> {
  try {
    const response = await fetch(
      `https://data.jsdelivr.com/v1/packages/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`
    )
    if (!response.ok) return []
    const data = (await response.json()) as { files?: unknown }
    if (!Array.isArray(data.files)) return []
    const folders = (data.files as JsDelivrEntry[]).filter((e) => e.type === 'directory')

    const summaries = await Promise.all(
      folders.map(async (folder): Promise<CommunityPluginSummary | null> => {
        const manifest = await fetchManifest(folder.name)
        if (!manifest) return null
        return {
          folder: folder.name,
          manifest,
          iconUrl: manifest.icon ? rawUrl(folder.name, manifest.icon) : null
        }
      })
    )
    return summaries.filter((s): s is CommunityPluginSummary => s !== null)
  } catch {
    return []
  }
}
