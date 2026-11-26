import { app, type BrowserWindow } from 'electron'
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import { createSocket, type Socket } from 'dgram'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { hostname, networkInterfaces } from 'os'
import { join } from 'path'
import type { CatalogItem, CatalogType } from '@shared/stremioTypes'
import {
  REMOTE_API_PORT,
  REMOTE_DISCOVERY_PORT,
  type RemoteCastPayload,
  type RemoteDevice,
  type RemotePairRequest,
  type RemotePairingInfo
} from '@shared/remoteTypes'
import { appendLog } from '../logging/service'
import { loadStremioConfig } from '../stremio/config'
import { ensureStremioServer, localStreamUrl } from '../stremio/server'

/**
 * Remote-control API for the phone app (ClashPointNexus-Android): pairing,
 * D-pad/screen remote, "play this on the TV", and a proxy to the local
 * Stremio torrent server so the phone can stream torrent sources through
 * this PC.
 *
 * Plain HTTP on the LAN (or Tailscale). Every endpoint except /api/pair
 * needs a device token, and a token is only ever issued against a one-time
 * 6-digit code that's shown on this PC's own screen (Settings > Phone
 * Link), so being on the same network isn't enough to control it.
 *
 * All file I/O here is async: this runs on Electron's main process, the
 * same thread that delivers input and frames to the window (see 0.3.0).
 */

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000
const PAIR_REQUEST_TTL_MS = 2 * 60 * 1000
const MAX_PENDING_REQUESTS = 3
const MAX_PAIR_ATTEMPTS = 5
const MAX_BODY_BYTES = 64 * 1024
const STREMIO_SERVER = { host: '127.0.0.1', port: 11470 }

const NAV_ACTIONS = new Set([
  'up', 'down', 'left', 'right', 'confirm', 'back', 'menu', 'prevStream', 'nextStream',
  'volumeDown', 'volumeUp', 'toggleSubtitles', 'skipNext', 'search', 'contextMenu', 'quickMenu'
])
const SCREENS = new Set(['home', 'games', 'tv', 'browse', 'files', 'apps', 'settings', 'library', 'store'])

interface StoredDevice extends RemoteDevice {
  token: string
}

let server: Server | null = null
let listening = false
let listenError: string | null = null
let mainWindow: BrowserWindow | null = null
let devices: StoredDevice[] | null = null
let pairing: { code: string; expiresAt: number; attempts: number } | null = null
let lastScreen: string | null = null
/** Stable id for this PC, so a phone can find it again after its IP changes. */
let pcId: string | null = null
let discovery: Socket | null = null

interface PairRequestState {
  id: string
  deviceName: string
  code: string
  createdAt: number
  state: 'pending' | 'approved' | 'denied'
  token: string | null
}
const pairRequests = new Map<string, PairRequestState>()

function configPath(): string {
  return app.isPackaged ? join(app.getPath('userData'), 'remote.config.json') : join(process.cwd(), 'remote.config.json')
}

async function loadDevices(): Promise<StoredDevice[]> {
  if (devices) return devices
  let loaded: StoredDevice[] = []
  const path = configPath()
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(await readFile(path, 'utf-8'))
      if (typeof raw?.pcId === 'string') pcId ??= raw.pcId
      if (Array.isArray(raw?.devices)) {
        loaded = raw.devices.filter(
          (d: unknown): d is StoredDevice =>
            !!d && typeof (d as StoredDevice).token === 'string' && typeof (d as StoredDevice).id === 'string'
        )
      }
    } catch {
      // unreadable config -- every phone just re-pairs
    }
  }
  // Another caller may have finished loading while this one awaited.
  devices ??= loaded
  if (!pcId) {
    pcId = randomUUID()
    void saveDevices()
  }
  return devices
}

async function saveDevices(): Promise<void> {
  await writeFile(configPath(), JSON.stringify({ pcId, devices: devices ?? [] }, null, 2)).catch((error) => {
    appendLog('error', `[remote] couldn't save remote.config.json: ${String(error)}`)
  })
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Non-internal IPv4 addresses + their adapter MACs (for wake-on-LAN). */
function localInterfaces(): { addresses: string[]; macs: string[] } {
  const addresses: string[] = []
  const macs = new Set<string>()
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4') continue
      addresses.push(entry.address)
      if (entry.mac && entry.mac !== '00:00:00:00:00:00') macs.add(entry.mac.toUpperCase())
    }
  }
  return { addresses, macs: [...macs] }
}

// ---- HTTP plumbing -----------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) })
  res.end(data)
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function authenticate(req: IncomingMessage, url: URL): Promise<StoredDevice | null> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token')
  if (!token) return null
  const device = (await loadDevices()).find((d) => safeEqual(d.token, token)) ?? null
  if (device) device.lastSeenAt = Date.now() // persisted with the next save; not worth a write per request
  return device
}

function send(channel: string, ...args: unknown[]): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  mainWindow.webContents.send(channel, ...args)
  return true
}

function bringToFront(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The phone serializes without null fields, so fill in the PC's full shape. */
function toCatalogItem(raw: unknown, type: CatalogType): CatalogItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const name = str(r.name)
  if (!id || !name) return null
  return {
    id,
    type,
    name,
    poster: str(r.poster),
    description: str(r.description),
    year: str(r.year),
    released: null,
    genres: Array.isArray(r.genres) ? r.genres.filter((g): g is string => typeof g === 'string') : []
  }
}

// ---- Routes -------------------------------------------------------------------

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  // Automatic pairing (no code typing): the phone asks, this PC shows an
  // Allow / Deny prompt on the TV with a 4-digit code that matches the one on
  // the phone, and the phone polls until someone answers.
  if (req.method === 'POST' && path === '/api/pair-request') {
    prunePairRequests()
    const pending = [...pairRequests.values()].filter((r) => r.state === 'pending')
    if (pending.length >= MAX_PENDING_REQUESTS) return sendJson(res, 429, { error: 'Too many pairing requests, try again shortly' })
    const body = await readJsonBody(req)
    const request: PairRequestState = {
      id: randomBytes(9).toString('base64url'),
      deviceName: (str(body.deviceName) ?? 'Phone').slice(0, 60),
      code: String(randomInt(0, 10_000)).padStart(4, '0'),
      createdAt: Date.now(),
      state: 'pending',
      token: null
    }
    pairRequests.set(request.id, request)
    bringToFront()
    const prompt: RemotePairRequest = { id: request.id, deviceName: request.deviceName, code: request.code }
    send('remote:pairRequest', prompt)
    appendLog('info', `[remote] pairing requested by "${request.deviceName}"`)
    return sendJson(res, 200, { requestId: request.id, code: request.code, name: hostname(), pcId })
  }

  if (req.method === 'GET' && path === '/api/pair-status') {
    prunePairRequests()
    const request = pairRequests.get(url.searchParams.get('id') ?? '')
    if (!request) return sendJson(res, 200, { state: 'expired' })
    if (request.state !== 'approved') return sendJson(res, 200, { state: request.state })
    // Hand the token over exactly once.
    const token = request.token
    pairRequests.delete(request.id)
    return sendJson(res, 200, { state: 'approved', token, name: hostname(), macs: localInterfaces().macs, pcId })
  }

  if (req.method === 'POST' && path === '/api/pair') {
    const body = await readJsonBody(req)
    const code = str(body.code)
    if (!pairing || Date.now() > pairing.expiresAt) {
      return sendJson(res, 403, { error: 'No active pairing code. Open Settings > Phone Link on the PC.' })
    }
    if (!code || !safeEqual(code, pairing.code)) {
      pairing.attempts += 1
      if (pairing.attempts >= MAX_PAIR_ATTEMPTS) pairing = null // force a fresh code after repeated misses
      return sendJson(res, 403, { error: 'Wrong code' })
    }
    pairing = null // one-time
    const device = await createDevice((str(body.deviceName) ?? 'Phone').slice(0, 60))
    return sendJson(res, 200, { token: device.token, name: hostname(), macs: localInterfaces().macs, pcId })
  }

  const device = await authenticate(req, url)
  if (!device) return sendJson(res, 401, { error: 'Not paired' })

  // Torrent stream proxy: the phone's player fetches this directly, so it
  // supports GET/HEAD with Range passthrough. Path params are validated
  // strictly -- this must only ever reach the local Stremio server.
  // fileIdx -1 = "the addon didn't say": the Stremio server picks the main video file.
  const streamMatch = path.match(/^\/stremio\/([a-fA-F0-9]{40})\/(-1|\d{1,5})$/)
  if (streamMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    return proxyStremio(req, res, streamMatch[1].toLowerCase(), Number(streamMatch[2]))
  }

  if (req.method === 'GET' && path === '/api/status') {
    return sendJson(res, 200, {
      name: hostname(),
      version: app.getVersion(),
      screen: lastScreen,
      macs: localInterfaces().macs,
      pcId,
      nowPlaying: null
    })
  }

  if (req.method === 'GET' && path === '/api/addons') {
    return sendJson(res, 200, { addons: loadStremioConfig().addons })
  }

  if (req.method === 'POST' && path === '/api/stremio/ensure') {
    const status = await ensureStremioServer()
    return sendJson(res, 200, { available: status.available, reason: status.reason })
  }

  if (req.method === 'POST' && path === '/api/nav') {
    const action = str((await readJsonBody(req)).action)
    if (!action || !NAV_ACTIONS.has(action)) return sendJson(res, 400, { ok: false, error: 'Unknown action' })
    return sendJson(res, 200, { ok: send('remote:nav', action) })
  }

  // Power: shutdown/restart give a short countdown (Windows shows its own
  // notice) so a mis-tap can be cancelled from the phone.
  if (req.method === 'POST' && path === '/api/power') {
    const action = str((await readJsonBody(req)).action)
    const args: Record<string, [string, string[]]> = {
      shutdown: ['shutdown', ['/s', '/t', '20', '/c', 'Shutting down from your phone (Nexus). Cancel from the phone app.']],
      restart: ['shutdown', ['/r', '/t', '20', '/c', 'Restarting from your phone (Nexus). Cancel from the phone app.']],
      cancel: ['shutdown', ['/a']],
      // Sleep (not hibernate) so Wake-on-LAN can bring it straight back.
      sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']]
    }
    const cmd = action ? args[action] : undefined
    if (!cmd) return sendJson(res, 400, { ok: false, error: 'Unknown power action' })
    if (process.platform !== 'win32') return sendJson(res, 200, { ok: false, error: 'Only supported on Windows' })
    appendLog('info', `[remote] power: ${action} requested from phone`)
    // Answer first: sleep cuts the network immediately.
    sendJson(res, 200, { ok: true })
    setTimeout(() => {
      execFile(cmd[0], cmd[1], { windowsHide: true }, (error) => {
        if (error) appendLog('error', `[remote] power ${action} failed: ${error.message}`)
      })
    }, action === 'sleep' ? 500 : 0)
    return
  }

  if (req.method === 'POST' && path === '/api/screen') {
    const screen = str((await readJsonBody(req)).screen)
    if (!screen || !SCREENS.has(screen)) return sendJson(res, 400, { ok: false, error: 'Unknown screen' })
    bringToFront()
    return sendJson(res, 200, { ok: send('remote:screen', screen) })
  }

  if (req.method === 'POST' && path === '/api/cast') {
    const body = await readJsonBody(req)
    const tab: CatalogType | null = body.type === 'movie' || body.type === 'series' ? body.type : null
    const item = tab ? toCatalogItem(body.item, tab) : null
    if (!tab || !item) return sendJson(res, 400, { ok: false, error: 'Missing title' })

    let playableUrl: string | null = null
    const directUrl = str(body.directUrl)
    const infoHash = str(body.infoHash)
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      playableUrl = directUrl
    } else if (infoHash && /^[a-fA-F0-9]{40}$/.test(infoHash)) {
      const status = await ensureStremioServer()
      if (!status.available) return sendJson(res, 200, { ok: false, error: status.reason ?? 'Torrent server unavailable' })
      playableUrl = localStreamUrl(infoHash.toLowerCase(), num(body.fileIdx) ?? -1)
    }

    const payload: RemoteCastPayload = {
      tab,
      item,
      episodeId: str(body.episodeId),
      season: num(body.season),
      episode: num(body.episode),
      positionSeconds: Math.max(0, num(body.positionSeconds) ?? 0),
      playableUrl
    }
    bringToFront()
    appendLog('info', `[remote] cast from "${device.name}": ${item.name}${payload.episodeId ? ` (${payload.episodeId})` : ''}`)
    return sendJson(res, 200, { ok: send('remote:cast', payload) })
  }

  sendJson(res, 404, { error: 'Not found' })
}

function proxyStremio(req: IncomingMessage, res: ServerResponse, infoHash: string, fileIdx: number): void {
  const headers: Record<string, string> = {}
  for (const name of ['range', 'accept', 'user-agent', 'if-range']) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  const upstream = httpRequest(
    { ...STREMIO_SERVER, method: req.method, path: `/${infoHash}/${fileIdx}`, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    }
  )
  upstream.on('error', (error) => {
    if (!res.headersSent) sendJson(res, 502, { error: `Torrent server: ${error.message}` })
    else res.destroy()
  })
  // Phone closed the stream (seek, stop) -> stop pulling from upstream too.
  res.on('close', () => upstream.destroy())
  upstream.end()
}

function prunePairRequests(): void {
  const now = Date.now()
  for (const [id, r] of pairRequests) if (now - r.createdAt > PAIR_REQUEST_TTL_MS) pairRequests.delete(id)
}

async function createDevice(name: string): Promise<StoredDevice> {
  const device: StoredDevice = {
    id: randomBytes(6).toString('hex'),
    name,
    token: randomBytes(24).toString('base64url'),
    createdAt: Date.now(),
    lastSeenAt: Date.now()
  }
  ;(await loadDevices()).push(device)
  await saveDevices()
  send('remote:devicesChanged')
  appendLog('info', `[remote] paired new device "${device.name}"`)
  return device
}

/** The TV prompt's answer (Settings' PairRequestOverlay -> IPC). */
export async function respondToPairRequest(id: string, approve: boolean): Promise<void> {
  const request = pairRequests.get(id)
  if (!request || request.state !== 'pending') return
  if (!approve) {
    request.state = 'denied'
    return
  }
  const device = await createDevice(request.deviceName)
  request.state = 'approved'
  request.token = device.token
}

/**
 * LAN discovery: phones broadcast "NEXUS_DISCOVER" on UDP 11481 and every
 * Nexus PC that hears it answers with who it is, so the phone app can list
 * PCs without anyone typing an IP address. Answers carry nothing secret --
 * pairing still needs the on-screen approval.
 */
function startDiscovery(): void {
  if (discovery) return
  const socket = createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('message', (msg, rinfo) => {
    if (msg.toString('utf-8').trim() !== 'NEXUS_DISCOVER') return
    void loadDevices().then(() => {
      const reply = Buffer.from(
        JSON.stringify({ nexus: 1, pcId, name: hostname(), port: REMOTE_API_PORT, version: app.getVersion() })
      )
      socket.send(reply, rinfo.port, rinfo.address)
    })
  })
  socket.on('error', (error) => appendLog('error', `[remote] discovery socket: ${error.message}`))
  socket.bind(REMOTE_DISCOVERY_PORT, '0.0.0.0')
  discovery = socket
}

// ---- Lifecycle + IPC-facing API ---------------------------------------------

export function startRemoteServer(window: BrowserWindow): void {
  mainWindow = window
  if (server) return
  void loadDevices()
  server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    })
  })
  server.on('listening', () => {
    listening = true
    listenError = null
    appendLog('info', `[remote] phone link listening on :${REMOTE_API_PORT}`)
  })
  server.on('error', (error: NodeJS.ErrnoException) => {
    listening = false
    listenError = error.code === 'EADDRINUSE' ? `Port ${REMOTE_API_PORT} is already in use` : error.message
    appendLog('error', `[remote] server error: ${error.message}`)
  })
  // All interfaces, so the phone can reach it on the LAN and over Tailscale.
  // Windows Firewall asks once to allow Nexus on private networks.
  server.listen(REMOTE_API_PORT, '0.0.0.0')
  startDiscovery()
}

export function stopRemoteServer(): void {
  server?.close()
  server = null
  discovery?.close()
  discovery = null
  listening = false
  void saveDevices()
}

export async function getPairingInfo(): Promise<RemotePairingInfo> {
  const list = await loadDevices()
  const active = pairing && Date.now() < pairing.expiresAt ? pairing : null
  return {
    listening,
    error: listenError,
    port: REMOTE_API_PORT,
    addresses: localInterfaces().addresses,
    code: active?.code ?? null,
    codeExpiresAt: active?.expiresAt ?? null,
    devices: list.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt }))
  }
}

export async function newPairingCode(): Promise<RemotePairingInfo> {
  pairing = { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: Date.now() + PAIRING_CODE_TTL_MS, attempts: 0 }
  return getPairingInfo()
}

export async function revokeDevice(id: string): Promise<RemotePairingInfo> {
  devices = (await loadDevices()).filter((d) => d.id !== id)
  await saveDevices()
  return getPairingInfo()
}

export function reportScreen(screen: string): void {
  lastScreen = screen
}
