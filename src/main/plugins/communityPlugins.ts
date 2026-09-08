import { COMMUNITY_PLUGINS_REPO, isPluginManifest, type CommunityPluginSummary, type PluginManifest } from '@shared/pluginTypes'

const { owner: REPO_OWNER, name: REPO_NAME, branch: REPO_BRANCH } = COMMUNITY_PLUGINS_REPO
const MANIFEST_FILENAME = 'plugin.json'

// jsDelivr's directory-listing API (data.jsdelivr.com, used below to
// enumerate folders) caches a branch's file tree separately from raw file
// content (rawUrl above), and — confirmed twice now, with both Nexus Dash
// and Arcade — can lag well behind a real push to main even after purging
// the raw content cache; there's no equivalent purge for the listing
// endpoint itself. Every folder listed here gets fetched directly by name
// as a fallback whenever the listing doesn't already include it, so a
// just-pushed plugin doesn't sit invisible in the Store for however long
// jsDelivr's listing cache takes to catch up.
const FALLBACK_PLUGIN_FOLDERS = ['Arcade']

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

/** Raw folder listing from jsDelivr's data API — see FALLBACK_PLUGIN_FOLDERS
 * above for why listCommunityPlugins below never trusts this alone. */
async function listFolders(): Promise<string[]> {
  try {
    const response = await fetch(
      `https://data.jsdelivr.com/v1/packages/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`
    )
    if (!response.ok) return []
    const data = (await response.json()) as { files?: unknown }
    if (!Array.isArray(data.files)) return []
    return (data.files as JsDelivrEntry[]).filter((e) => e.type === 'directory').map((e) => e.name)
  } catch {
    return []
  }
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
  const listed = await listFolders()
  const listedNames = new Set(listed)
  // See FALLBACK_PLUGIN_FOLDERS's own doc comment — the listing above can
  // be stale even when a folder's actual content is already live.
  const folderNames = [...listed, ...FALLBACK_PLUGIN_FOLDERS.filter((f) => !listedNames.has(f))]

  const summaries = await Promise.all(
    folderNames.map(async (folderName): Promise<CommunityPluginSummary | null> => {
      const manifest = await fetchManifest(folderName)
      if (!manifest) return null
      return {
        folder: folderName,
        manifest,
        iconUrl: manifest.icon ? rawUrl(folderName, manifest.icon) : null
      }
    })
  )
  return summaries.filter((s): s is CommunityPluginSummary => s !== null)
}
