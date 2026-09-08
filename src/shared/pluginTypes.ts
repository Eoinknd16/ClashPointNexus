/**
 * A plugin is real, arbitrary JavaScript that will eventually run inside
 * this app — unlike a theme pack (pure CSS vars + images), that means what
 * it's *allowed to touch* has to be something a user can see and weigh
 * before installing, not just discovered after the fact. `permissions`
 * exists for that: an author declares up front what capabilities their
 * plugin needs, the Store shows that declaration before Install, and
 * (once the runtime loader exists) it's a real permission set a sandboxed
 * loader enforces, not just an honor system.
 *
 * This repo (see COMMUNITY_PLUGINS_REPO) is open to third-party
 * submissions, same as Community Themes is — so every manifest field is
 * validated at runtime (isPluginManifest) before any of it is trusted,
 * and nothing here executes yet: as of this file, the Store only browses
 * and describes plugins. Downloading + actually running a plugin's bundle
 * is a separate, later piece of work (a real sandboxed loader), not
 * something a manifest being well-formed implies is safe to skip.
 */
export type PluginCategory = 'game' | 'media' | 'widget' | 'system' | 'input' | 'social' | 'other'

/** Each maps to a real capability a plugin might need — kept small and
 * specific (not a blanket "full access") so a permission list is actually
 * meaningful to read before installing something written by a stranger. */
export type PluginPermission =
  | 'network' // fetch/XHR to hosts outside this app's own backends
  | 'filesystem' // read/write beyond its own sandboxed storage directory
  | 'notifications'
  | 'home-widget' // register a tile/card on the Home screen
  | 'settings-panel' // register its own panel under Settings > Plugins
  | 'background' // keep running logic while it isn't the active screen

export type PluginPrice = { kind: 'free' } | { kind: 'paid'; amountUsd: number }

/** What a plugin author's plugin.json must contain, one per folder in the
 * community plugins repo (mirrors theme.json's one-folder-per-pack shape
 * in ClashPointNexus-Themes). `entry` is a filename *within that same
 * folder* — the pre-built JS bundle a future loader would fetch and run. */
export interface PluginManifest {
  /** Stable, author-chosen identifier — must be unique across the repo.
   * Distinct from the folder name (which can change/be prettified) so a
   * plugin's identity survives a folder rename. */
  id: string
  name: string
  description: string
  author: string
  /** Semver string, e.g. "1.0.0". */
  version: string
  category: PluginCategory
  entry: string
  /** Icon filename within the plugin's own folder, square, shown in the Store grid. */
  icon?: string
  permissions: PluginPermission[]
  price: PluginPrice
  /** Lowest core Nexus version (package.json's own version string) this
   * plugin declares it works with — informational only until a real
   * compatibility check is built; not enforced yet. */
  minAppVersion?: string
}

/** One plugin folder listed in the public community repo (Settings >
 * Plugins > Browse Plugin Store) — enough to render a card without
 * downloading anything beyond the manifest + icon. */
export interface CommunityPluginSummary {
  /** Folder name in the repo. */
  folder: string
  manifest: PluginManifest
  /** Hot-linked CDN URL for the plugin's own icon, or null if it has none. */
  iconUrl: string | null
}

/** The public repo the Plugin Store reads from — same distribution model
 * as COMMUNITY_THEMES_REPO (see themeTypes.ts), open to third-party pull
 * requests. Placeholder name until the actual repo exists; update this
 * the moment it's created under a different name. */
export const COMMUNITY_PLUGINS_REPO = { owner: 'Eoinknd16', name: 'ClashPointNexus-Plugins', branch: 'main' } as const

const PLUGIN_CATEGORIES: PluginCategory[] = ['game', 'media', 'widget', 'system', 'input', 'social', 'other']
const PLUGIN_PERMISSIONS: PluginPermission[] = [
  'network',
  'filesystem',
  'notifications',
  'home-widget',
  'settings-panel',
  'background'
]

function isPluginPrice(value: unknown): value is PluginPrice {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'free') return true
  if (candidate.kind === 'paid') return typeof candidate.amountUsd === 'number' && candidate.amountUsd > 0
  return false
}

/** Strict validation for untrusted, third-party-submitted JSON — every
 * field checked, not just the ones the current UI happens to read, since
 * a malformed-but-partially-valid manifest here is exactly the kind of
 * thing that should fail closed rather than surface as a half-broken card. */
export function isPluginManifest(value: unknown): value is PluginManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>

  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return false
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) return false
  if (typeof candidate.description !== 'string') return false
  if (typeof candidate.author !== 'string' || !candidate.author.trim()) return false
  if (typeof candidate.version !== 'string' || !/^\d+\.\d+\.\d+/.test(candidate.version)) return false
  if (typeof candidate.category !== 'string' || !PLUGIN_CATEGORIES.includes(candidate.category as PluginCategory)) {
    return false
  }
  if (typeof candidate.entry !== 'string' || !candidate.entry.trim()) return false
  if (candidate.icon !== undefined && typeof candidate.icon !== 'string') return false
  if (
    !Array.isArray(candidate.permissions) ||
    !candidate.permissions.every((p) => PLUGIN_PERMISSIONS.includes(p as PluginPermission))
  ) {
    return false
  }
  if (!isPluginPrice(candidate.price)) return false
  if (candidate.minAppVersion !== undefined && typeof candidate.minAppVersion !== 'string') return false

  return true
}
