import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Trophy } from 'lucide-react'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { KEY_ROWS, applyKey, clampKeyboardFocus } from '../components/onScreenKeyboardLayout'
import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'
import type { HighScoreEntry } from '@shared/arcadeTypes'

const LANE_COUNT = 3
type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'nameEntry' | 'gameover'

interface Obstacle {
  lane: number
  y: number
  kind: 'obstacle' | 'coin'
  resolved: boolean
}

const BASE_SPEED = 260 // px/sec
const MAX_SPEED = 620
const ACCEL_PER_SEC = 6 // speed gained per second survived
const SPAWN_INTERVAL_START_MS = 950
const SPAWN_INTERVAL_MIN_MS = 420
const COIN_CHANCE = 0.28
const PLAYER_Y_FRACTION = 0.82
const HIT_ZONE_PX = 34
const COUNTDOWN_MS = 1200
const MAX_HIGH_SCORES_SHOWN = 5

function themeColor(varName: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return raw ? `rgb(${raw})` : fallback
}

function freshGameState(): {
  lane: number
  playerX: number
  obstacles: Obstacle[]
  elapsedMs: number
  speed: number
  spawnTimerMs: number
  score: number
  laneSwitchQueued: -1 | 0 | 1
} {
  return {
    lane: 1,
    playerX: 0,
    obstacles: [],
    elapsedMs: 0,
    speed: BASE_SPEED,
    spawnTimerMs: 0,
    score: 0,
    laneSwitchQueued: 0
  }
}

/**
 * A controller-first arcade minigame built into the launcher itself, per a
 * direct request rather than anything on the wider roadmap. 3-lane dodge —
 * left/right (dpad/stick, same NavAction the rest of the app uses) to switch
 * lanes, avoid rocks, collect coins. High scores are local-only for now (see
 * arcadeTypes.ts) — a real cross-machine "global" leaderboard needs a
 * backend somewhere, which needs an account only the user can set up.
 *
 * The canvas stays mounted across every phase (sized once on mount via
 * useLayoutEffect, before paint) rather than being torn down and rebuilt
 * per game — simpler than re-deriving its pixel dimensions every time a
 * round starts. The actual per-frame game loop only runs while phase is
 * 'playing' (started/stopped by the effect below keyed on phase), reading
 * and writing gameRef directly rather than React state — a plain mutable
 * object so 60fps updates don't mean 60 re-renders/sec of this component;
 * `score` is the one piece mirrored into real state, once per frame, purely
 * for the HUD text.
 */
export function ArcadeScreen(): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef(freshGameState())
  const [phase, setPhase] = useState<Phase>('ready')
  const [score, setScore] = useState(0)
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([])
  const [lastResult, setLastResult] = useState<{ score: number; rank: number | null } | null>(null)
  const [kbValue, setKbValue] = useState('')
  const [kbShift, setKbShift] = useState(false)
  const [kbRow, setKbRow] = useState(0)
  const [kbCol, setKbCol] = useState(0)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width)
    canvas.height = Math.round(rect.height)
  }, [])

  useEffect(() => {
    window.api.arcade
      .getHighScores()
      .then(setHighScores)
      .catch(() => setHighScores([]))
  }, [])

  function startGame(): void {
    setPhase('countdown')
  }

  useEffect(() => {
    if (phase !== 'countdown') return
    gameRef.current = freshGameState()
    setScore(0)
    const timer = setTimeout(() => setPhase('playing'), COUNTDOWN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  function endGame(finalScore: number): void {
    const worstShown = highScores[highScores.length - 1]?.score ?? 0
    const qualifies = finalScore > 0 && (highScores.length < 10 || finalScore > worstShown)
    setLastResult({ score: finalScore, rank: null })
    if (qualifies) {
      setKbValue('')
      setKbShift(false)
      setKbRow(0)
      setKbCol(0)
      setPhase('nameEntry')
    } else {
      setPhase('gameover')
    }
  }

  async function submitName(name: string): Promise<void> {
    const finalScore = lastResult?.score ?? 0
    try {
      const result = await window.api.arcade.submitScore(name.trim() || 'Player', finalScore)
      setHighScores(result.entries)
      setLastResult({ score: finalScore, rank: result.rank })
    } catch {
      // Keep the local finalScore visible on the game-over screen either way.
    }
    setPhase('gameover')
  }

  function pressVirtualKey(key: string): void {
    const result = applyKey(key, kbValue, kbShift)
    setKbValue(result.value)
    setKbShift(result.shift)
    if (result.done) void submitName(result.value)
  }

  // The actual game loop — only alive while phase is 'playing', so pausing
  // (phase -> 'paused') cancels it via this effect's own cleanup, and
  // resuming mounts a fresh instance of it that picks up gameRef exactly
  // where it left off (obstacles mid-flight, current score, everything).
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx) return

    const colors = {
      bg: themeColor('--color-surface', 'rgb(21,21,31)'),
      lane: themeColor('--color-surface-hi', 'rgb(30,30,44)'),
      text: themeColor('--color-muted', 'rgb(143,143,163)'),
      accent: themeColor('--color-accent', 'rgb(91,140,255)')
    }

    let rafId: number
    let lastTime = performance.now()

    const tick = (time: number): void => {
      const dt = Math.min(0.05, (time - lastTime) / 1000)
      lastTime = time
      const game = gameRef.current

      game.elapsedMs += dt * 1000
      game.speed = Math.min(MAX_SPEED, BASE_SPEED + (game.elapsedMs / 1000) * ACCEL_PER_SEC)

      if (game.laneSwitchQueued !== 0) {
        game.lane = Math.max(0, Math.min(LANE_COUNT - 1, game.lane + game.laneSwitchQueued))
        game.laneSwitchQueued = 0
      }

      const laneWidth = canvas.width / LANE_COUNT
      const targetX = laneWidth * (game.lane + 0.5)
      if (game.playerX === 0) game.playerX = targetX
      game.playerX += (targetX - game.playerX) * Math.min(1, dt * 10)

      const spawnInterval = Math.max(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_START_MS - game.elapsedMs / 40)
      game.spawnTimerMs += dt * 1000
      if (game.spawnTimerMs >= spawnInterval) {
        game.spawnTimerMs = 0
        game.obstacles.push({
          lane: Math.floor(Math.random() * LANE_COUNT),
          y: -40,
          kind: Math.random() < COIN_CHANCE ? 'coin' : 'obstacle',
          resolved: false
        })
      }

      const playerY = canvas.height * PLAYER_Y_FRACTION
      let gameOver = false
      let coinsCollected = 0
      const stillObstacles: Obstacle[] = []
      for (const obs of game.obstacles) {
        obs.y += game.speed * dt
        if (!obs.resolved && obs.lane === game.lane && Math.abs(obs.y - playerY) <= HIT_ZONE_PX) {
          obs.resolved = true
          if (obs.kind === 'coin') {
            coinsCollected += 1
            continue
          }
          gameOver = true
        }
        if (obs.y < canvas.height + 60) stillObstacles.push(obs)
      }
      game.obstacles = stillObstacles

      if (coinsCollected > 0) game.score += coinsCollected * 50
      // Accumulated as a float and only floored for display/submission below —
      // rounding this per-frame first would discard almost all of it, since
      // each individual frame's share (well under 1 point at 60fps) rounds
      // straight down to 0 far more often than not.
      game.score += dt * (game.speed / 12)
      setScore(Math.floor(game.score))

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = colors.lane
      ctx.lineWidth = 2
      for (let i = 1; i < LANE_COUNT; i++) {
        const x = laneWidth * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      // Plain canvas-drawn shapes rather than emoji glyphs -- fillText with an
      // emoji is text rendering, not an icon component, so there's no SVG
      // equivalent to drop in here the way the rest of the app's emoji got
      // replaced; real shapes are the idiomatic way to draw game sprites on
      // a 2D canvas anyway.
      for (const obs of game.obstacles) {
        const x = laneWidth * (obs.lane + 0.5)
        if (obs.kind === 'coin') {
          ctx.beginPath()
          ctx.arc(x, obs.y, 15, 0, Math.PI * 2)
          ctx.fillStyle = '#facc15'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = '#ca8a04'
          ctx.stroke()
        } else {
          const size = 32
          ctx.fillStyle = '#78716c'
          ctx.beginPath()
          ctx.moveTo(x, obs.y - size / 2)
          ctx.lineTo(x + size / 2, obs.y)
          ctx.lineTo(x, obs.y + size / 2)
          ctx.lineTo(x - size / 2, obs.y)
          ctx.closePath()
          ctx.fill()
        }
      }

      ctx.fillStyle = colors.accent
      ctx.beginPath()
      ctx.moveTo(game.playerX, playerY - 24)
      ctx.lineTo(game.playerX + 20, playerY + 18)
      ctx.lineTo(game.playerX, playerY + 8)
      ctx.lineTo(game.playerX - 20, playerY + 18)
      ctx.closePath()
      ctx.fill()

      if (gameOver) {
        endGame(Math.floor(game.score))
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useNavListener((action) => {
    if (phase === 'nameEntry') {
      switch (action) {
        case 'up': {
          const next = clampKeyboardFocus(kbRow - 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'down': {
          const next = clampKeyboardFocus(kbRow + 1, kbCol)
          setKbRow(next.row)
          setKbCol(next.col)
          return
        }
        case 'left':
          setKbCol((c) => Math.max(0, c - 1))
          return
        case 'right':
          setKbCol((c) => clampKeyboardFocus(kbRow, c + 1).col)
          return
        case 'confirm':
          pressVirtualKey(KEY_ROWS[kbRow][kbCol])
          return
        case 'toggleSubtitles':
          pressVirtualKey('BACKSPACE')
          return
        case 'volumeUp':
          pressVirtualKey('SHIFT')
          return
        case 'nextStream':
          void submitName(kbValue)
          return
        case 'back':
        case 'menu':
          void submitName(kbValue)
          return
        default:
          return
      }
    }

    if (phase === 'playing') {
      switch (action) {
        case 'left':
          gameRef.current.laneSwitchQueued = -1
          return
        case 'right':
          gameRef.current.laneSwitchQueued = 1
          return
        case 'back':
        case 'menu':
          setPhase('paused')
          return
        default:
          return
      }
    }

    if (phase === 'paused') {
      switch (action) {
        case 'confirm':
          setPhase('playing')
          return
        case 'back':
        case 'menu':
          goHome()
          return
        default:
          return
      }
    }

    // 'ready' or 'gameover' (countdown ignores input entirely)
    if (phase === 'ready' || phase === 'gameover') {
      switch (action) {
        case 'confirm':
          startGame()
          return
        case 'back':
        case 'menu':
          goHome()
          return
        default:
          return
      }
    }
  }, 'arcade')

  const topScores = highScores.slice(0, MAX_HIGH_SCORES_SHOWN)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {(phase === 'playing' || phase === 'paused') && (
        <div className="pointer-events-none absolute left-8 top-8 flex flex-col gap-1">
          <span className="text-sm font-medium uppercase tracking-wide text-muted">Score</span>
          <span className="text-4xl font-bold tabular-nums">{score}</span>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-4xl font-bold">Get Ready...</span>
        </div>
      )}

      {phase === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex w-80 flex-col items-center gap-4 rounded-2xl bg-surface p-8 text-center">
            <h2 className="text-2xl font-bold">Paused</h2>
            <p className="text-sm text-muted">Cross: Resume · Circle: Quit to Home</p>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex w-96 flex-col items-center gap-5 rounded-2xl bg-surface p-8 text-center">
            <h1 className="bg-accent-gradient bg-clip-text text-3xl font-bold text-transparent">Nexus Dash</h1>
            <p className="flex items-center justify-center gap-1 text-sm text-muted">
              <ArrowLeft className="h-3.5 w-3.5" />/<ArrowRight className="h-3.5 w-3.5" /> or D-Pad to dodge ·
              Collect coins · Avoid rocks
            </p>
            {topScores.length > 0 && (
              <div className="flex w-full flex-col gap-1 border-t border-white/5 pt-4 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Top Scores</span>
                {topScores.map((entry, i) => (
                  <div key={i} className="flex justify-between gap-6">
                    <span className="truncate">
                      {i + 1}. {entry.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-lg font-semibold text-accent">Cross to Start</p>
          </div>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex w-96 flex-col items-center gap-5 rounded-2xl bg-surface p-8 text-center">
            <h2 className="text-2xl font-bold">Game Over</h2>
            <p className="text-4xl font-bold tabular-nums">{lastResult?.score ?? 0}</p>
            {lastResult?.rank != null && (
              <p className="flex items-center justify-center gap-2 font-semibold text-accent">
                <Trophy className="h-5 w-5" /> New High Score — #{lastResult.rank + 1}!
              </p>
            )}
            {topScores.length > 0 && (
              <div className="flex w-full flex-col gap-1 border-t border-white/5 pt-4 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Top Scores</span>
                {topScores.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex justify-between gap-6 ${
                      lastResult?.rank === i ? 'font-bold text-accent' : ''
                    }`}
                  >
                    <span className="truncate">
                      {i + 1}. {entry.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-muted">Cross: Play Again · Circle: Home</p>
          </div>
        </div>
      )}

      {phase === 'nameEntry' && (
        <OnScreenKeyboard
          label="New High Score! Enter your name"
          value={kbValue}
          shift={kbShift}
          focusedRow={kbRow}
          focusedCol={kbCol}
          onChange={setKbValue}
          onSubmit={() => void submitName(kbValue)}
          onCancel={() => void submitName(kbValue)}
          onKeyPress={pressVirtualKey}
        />
      )}
    </div>
  )
}
