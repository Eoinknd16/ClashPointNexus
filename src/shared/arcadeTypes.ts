/** Local-only for now (see submitScore) — a real cross-machine "global"
 * leaderboard needs a backend somewhere, which needs an account only the
 * user can create; this is the foundation to plug that into later without
 * changing the game itself, just where these two functions read/write. */
export interface HighScoreEntry {
  name: string
  score: number
  achievedAt: number
}

export interface ScoreSubmitResult {
  entries: HighScoreEntry[]
  /** 0-based placement on the full (untrimmed) sorted list — null if it
   * didn't make the saved top N at all. */
  rank: number | null
}
