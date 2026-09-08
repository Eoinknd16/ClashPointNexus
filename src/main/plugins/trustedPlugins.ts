/**
 * The entire security boundary for the trusted plugin tier lives here, and
 * nowhere else. A plugin's own manifest.json can never grant itself
 * trust — that would let any third-party submission to the (otherwise
 * open-submission) community plugins repo claim it. Trust is instead a
 * hardcoded id allow-list checked in the main process at launch time
 * (see plugins/ipc.ts's prepareLaunch), the same place the bundle's
 * SHA-256 is already re-verified on every launch.
 *
 * A trusted plugin gets a materially larger preload bridge
 * (preload/arcadePlugin.ts: process spawn, registry query, filesystem
 * read/write) instead of the narrow nav-only relay every other plugin
 * gets (preload/plugin.ts). Only add an id here for a plugin that is
 * first-party (built and reviewed by us, not a community submission) —
 * this is close to unrestricted code execution on the user's machine,
 * gated only by whoever can push to that plugin's folder in the plugins
 * repo.
 */
const TRUSTED_PLUGIN_IDS = ['arcade']

export function isTrustedPlugin(id: string): boolean {
  return TRUSTED_PLUGIN_IDS.includes(id)
}
