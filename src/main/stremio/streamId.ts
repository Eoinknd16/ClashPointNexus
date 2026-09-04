/**
 * Stremio video ids for episodes look like "tt1234567:1:4" — plain
 * encodeURIComponent would turn those colons into %3A, breaking the addon
 * protocol's path segments. Encode each colon-separated part individually so
 * the colons survive as literal separators.
 */
export function encodeStremioId(id: string): string {
  return id.split(':').map(encodeURIComponent).join(':')
}
