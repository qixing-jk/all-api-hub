/**
 * Public contract for Hog Coin Capture at
 * `Mr-Groundhog/hog-api-gateway@91a65711`: controller/coin_capture.go,
 * middleware/coin_capture.go, model/coin_capture.go and pkg/coincapture/game.go.
 * The game logic is independently implemented by All API Hub; only the wire
 * contract and server-enforced bounds are taken from the public source.
 */
export const HOG_COIN_CAPTURE_ENDPOINTS = {
  PublicStatus: "/api/status",
  UserSelf: "/api/user/self",
  GameStatus: "/api/coin-capture/status",
  Start: "/api/coin-capture/start",
  Settle: "/api/coin-capture/settle",
} as const

export const HOG_COIN_CAPTURE_RULES = {
  width: 900,
  height: 540,
  durationMs: 40_000,
  maxMovements: 2_000,
  stepMs: 20,
  movementSpeedPerSecond: 480,
  pickupRadius: 21,
} as const

export interface HogCoinCaptureMovement {
  elapsed_ms: number
  x: number
  y: number
}

export interface HogCoinCaptureCoin {
  x: number
  y: number
  value: number
  r: number
  alive: boolean
}

export interface HogCoinCaptureGameState {
  player: { x: number; y: number; tx: number; ty: number; r: number }
  coins: HogCoinCaptureCoin[]
}

export interface HogCoinCaptureRound {
  round_id: string
  game_day: string
  status: 1 | 2
  score: number
  reward_cents: number
  quota: number
  started_at: number
  settled_at: number
  sequence: number
}

export interface HogCoinCaptureView {
  round: HogCoinCaptureRound | null
  game?: HogCoinCaptureGameState
  server_time: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const inBounds = (x: number, y: number): boolean =>
  x >= 27 &&
  x <= HOG_COIN_CAPTURE_RULES.width - 27 &&
  y >= 27 &&
  y <= HOG_COIN_CAPTURE_RULES.height - 27

/** Parse only the state needed for safe daily execution and authoritative readback. */
export function parseHogCoinCaptureView(
  value: unknown,
): HogCoinCaptureView | undefined {
  if (!isRecord(value) || !finite(value.server_time)) return undefined

  let round: HogCoinCaptureRound | null = null
  if (value.round !== null) {
    if (!isRecord(value.round)) return undefined
    const source = value.round
    if (
      typeof source.round_id !== "string" ||
      source.round_id.length === 0 ||
      typeof source.game_day !== "string" ||
      (source.status !== 1 && source.status !== 2) ||
      !finite(source.score) ||
      !finite(source.reward_cents) ||
      !finite(source.quota) ||
      !finite(source.started_at) ||
      !finite(source.settled_at) ||
      !finite(source.sequence)
    )
      return undefined
    round = {
      round_id: source.round_id,
      game_day: source.game_day,
      status: source.status,
      score: source.score,
      reward_cents: source.reward_cents,
      quota: source.quota,
      started_at: source.started_at,
      settled_at: source.settled_at,
      sequence: source.sequence,
    }
  }

  let game: HogCoinCaptureGameState | undefined
  if (value.game !== undefined && value.game !== null) {
    if (
      !isRecord(value.game) ||
      !isRecord(value.game.player) ||
      !Array.isArray(value.game.coins)
    )
      return undefined
    const player = value.game.player
    if (
      !finite(player.x) ||
      !finite(player.y) ||
      !finite(player.tx) ||
      !finite(player.ty) ||
      !finite(player.r) ||
      !inBounds(player.x, player.y) ||
      !inBounds(player.tx, player.ty)
    )
      return undefined
    const coins: HogCoinCaptureCoin[] = []
    for (const candidate of value.game.coins) {
      if (!isRecord(candidate)) return undefined
      if (
        candidate.alive === true &&
        finite(candidate.x) &&
        finite(candidate.y) &&
        finite(candidate.value) &&
        finite(candidate.r) &&
        inBounds(candidate.x, candidate.y)
      )
        coins.push({
          x: candidate.x,
          y: candidate.y,
          value: candidate.value,
          r: candidate.r,
          alive: true,
        })
    }
    game = {
      player: {
        x: player.x,
        y: player.y,
        tx: player.tx,
        ty: player.ty,
        r: player.r,
      },
      coins,
    }
  }

  return {
    round,
    ...(game ? { game } : {}),
    server_time: value.server_time,
  }
}

/** The source server gates `/midnight-heist` with this public admin setting. */
export function parseHogCoinCaptureEnabled(
  value: unknown,
): boolean | undefined {
  if (!isRecord(value) || !("SidebarModulesAdmin" in value)) return undefined
  let modules: unknown = value.SidebarModulesAdmin
  if (typeof modules === "string") {
    if (!modules.trim()) return true
    try {
      modules = JSON.parse(modules)
    } catch {
      // The source server falls back to the default enabled configuration.
      return true
    }
  }
  if (!isRecord(modules)) return true
  const personal = modules.personal
  if (!isRecord(personal)) return true
  return personal.enabled === false || personal.welfareAirdrop === false
    ? false
    : true
}

/**
 * Plan a bounded target path through the server-provided coins. The service
 * replays each target using its own random seed and awards only its own score.
 */
export function buildHogCoinCaptureMovements(
  game: HogCoinCaptureGameState,
): HogCoinCaptureMovement[] {
  const unvisited = game.coins
    .filter((coin) => coin.alive && inBounds(coin.x, coin.y))
    .map((coin) => ({ x: coin.x, y: coin.y }))
  if (unvisited.length === 0) return []

  const movements: HogCoinCaptureMovement[] = []
  let x = game.player.x
  let y = game.player.y
  let elapsed = 0

  while (
    unvisited.length > 0 &&
    elapsed < HOG_COIN_CAPTURE_RULES.durationMs &&
    movements.length < HOG_COIN_CAPTURE_RULES.maxMovements
  ) {
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < unvisited.length; index += 1) {
      const coin = unvisited[index]
      if (!coin) continue
      const distance = Math.hypot(coin.x - x, coin.y - y)
      if (distance < nearestDistance) {
        nearestIndex = index
        nearestDistance = distance
      }
    }
    const target = unvisited.splice(nearestIndex, 1)[0]
    if (!target) break
    movements.push({ elapsed_ms: elapsed, x: target.x, y: target.y })

    const travelDistance = nearestDistance
    const ticks = Math.max(
      1,
      Math.ceil(
        travelDistance /
          (HOG_COIN_CAPTURE_RULES.movementSpeedPerSecond *
            (HOG_COIN_CAPTURE_RULES.stepMs / 1_000)),
      ) + 1,
    )
    elapsed += ticks * HOG_COIN_CAPTURE_RULES.stepMs
    x = target.x
    y = target.y
  }

  return movements.slice(0, HOG_COIN_CAPTURE_RULES.maxMovements)
}
