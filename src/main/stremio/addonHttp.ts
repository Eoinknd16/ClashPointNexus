/** Sent on every request to a user-configured (arbitrary, third-party)
 * Stremio addon server. A bare fetch() with no headers at all is a
 * plausible reason a request gets rejected by anti-bot/WAF-style filtering
 * on an addon's own server — a real user hit exactly this shape of failure
 * (one addon endpoint returning "fetch failed", a sibling endpoint on the
 * same underlying service returning "HTTP 403"), which reads like basic
 * bot/scraper filtering rather than anything wrong with the request itself.
 * This is the most likely fix, though it has not been confirmed against
 * that specific service — there is no way to test it without the user's
 * own addon subscription. Not applied to Cinemeta or Stremio's own account
 * API, both first-party and not implicated by that diagnostic. */
export const ADDON_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json'
}
