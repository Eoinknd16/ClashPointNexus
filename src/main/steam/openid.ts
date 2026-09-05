import { BrowserWindow } from 'electron'
import { createServer, type Server } from 'http'

// Distinct from the transcode proxy's port (11471) — this one only lives for
// the duration of a single sign-in attempt, not the whole app session.
const CALLBACK_PORT = 11472
const SIGN_IN_TIMEOUT_MS = 120000

function buildLoginUrl(returnTo: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': returnTo,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  })
  return `https://steamcommunity.com/openid/login?${params.toString()}`
}

/** Required by the OpenID 2.0 spec — the callback params alone aren't proof
 * they actually came from Steam (anyone could forge a request to our own
 * local callback URL claiming any steamid). Re-posting them back to Steam
 * with mode=check_authentication is Steam's own verification step, the same
 * one every "Sign in through Steam" website implementation is required to do. */
async function verifyWithSteam(params: URLSearchParams): Promise<boolean> {
  const verifyParams = new URLSearchParams(params)
  verifyParams.set('openid.mode', 'check_authentication')
  const response = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
    signal: AbortSignal.timeout(10000)
  })
  const text = await response.text()
  return /is_valid\s*:\s*true/.test(text)
}

function extractSteamId64(claimedId: string | null): string | null {
  if (!claimedId) return null
  const match = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)
  return match ? match[1] : null
}

interface SignInResult {
  steamId64: string | null
  error: string | null
}

/** Opens a real Steam login page in its own window (same OpenID 2.0 flow
 * every "Sign in through Steam" button uses) and captures the SteamID64 from
 * the verified callback — the manual apiKey field still has to stay (Steam's
 * Web API always requires one, regardless of how the user authenticates),
 * but this removes needing to know or look up your own 17-digit SteamID64. */
export async function signInWithSteam(): Promise<SignInResult> {
  return new Promise((resolve) => {
    let settled = false
    let server: Server | null = null
    let loginWindow: BrowserWindow | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function finish(result: SignInResult): void {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      server?.close()
      loginWindow?.removeAllListeners('closed')
      loginWindow?.close()
      resolve(result)
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`)
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body>Signed in to Steam — you can close this window.</body></html>')

      void (async () => {
        try {
          const valid = await verifyWithSteam(url.searchParams)
          if (!valid) {
            finish({ steamId64: null, error: "Steam couldn't verify this sign-in" })
            return
          }
          const steamId64 = extractSteamId64(url.searchParams.get('openid.claimed_id'))
          finish(
            steamId64
              ? { steamId64, error: null }
              : { steamId64: null, error: "Steam's response didn't include a SteamID" }
          )
        } catch (error) {
          finish({ steamId64: null, error: error instanceof Error ? error.message : String(error) })
        }
      })()
    })

    server.on('error', (error) => {
      finish({ steamId64: null, error: `Couldn't start local sign-in listener: ${error.message}` })
    })

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      loginWindow = new BrowserWindow({
        width: 500,
        height: 650,
        autoHideMenuBar: true,
        webPreferences: { sandbox: true }
      })
      loginWindow.on('closed', () => {
        loginWindow = null
        finish({ steamId64: null, error: 'Sign-in window closed before finishing' })
      })
      void loginWindow.loadURL(buildLoginUrl(`http://127.0.0.1:${CALLBACK_PORT}/callback`))
    })

    timeoutId = setTimeout(() => finish({ steamId64: null, error: 'Steam sign-in timed out' }), SIGN_IN_TIMEOUT_MS)
  })
}
