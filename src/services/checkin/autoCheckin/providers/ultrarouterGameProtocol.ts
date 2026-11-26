import type { ConfirmedAward } from "~/services/amounts/awards"
import type { EvidenceRef } from "~/services/amounts/balance"
import {
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import type { SiteAccount } from "~/types"

export const ULTRAROUTER_GAME_ENDPOINTS = {
  Status: "/api/user/game",
  Rewards: "/api/user/game/rewards",
  Start: "/api/user/game/start",
  Input: "/api/user/game/input",
  Self: "/api/user/self",
} as const

export const ULTRAROUTER_GAME_RULES = {
  ticksPerRun: 900,
  ticksPerSecond: 10,
  inputFramesPerSecond: 10,
  framesPerBatch: 20,
  minimumBatchIntervalMs: 2_000,
  maximumRunMs: 150_000,
  maximumBatches: 60,
} as const

export interface UltraRouterGameToken {
  x: number
  y: number
  value: number
}

export interface UltraRouterGameEnemy {
  x: number
  y: number
}

export interface UltraRouterGameState {
  version: number
  tick: number
  clock_tick: number
  x: number
  y: number
  hp: number
  upgrades: number
  dash_ready: number
  picked_tokens: number
  tokens: UltraRouterGameToken[]
  enemies: UltraRouterGameEnemy[]
}

export interface UltraRouterGameRun {
  id: string
  status: string
  state: UltraRouterGameState
  first_token_quota?: number
  subsequent_token_quota?: number
}

export interface UltraRouterGameSnapshot {
  run: UltraRouterGameRun | null
  settings: { enabled: boolean }
  budgets: { can_start: boolean }
  server_time?: string | number
  resets_at?: string | number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isPoint = (value: unknown): value is { x: number; y: number } =>
  Boolean(
    value &&
    typeof value === "object" &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y),
  )

const isGameState = (value: unknown): value is UltraRouterGameState => {
  if (!value || typeof value !== "object") return false
  const state = value as Record<string, unknown>
  return (
    isFiniteNumber(state.version) &&
    state.version >= 2 &&
    isFiniteNumber(state.tick) &&
    isFiniteNumber(state.x) &&
    isFiniteNumber(state.y) &&
    isFiniteNumber(state.hp) &&
    isFiniteNumber(state.upgrades) &&
    isFiniteNumber(state.dash_ready) &&
    isFiniteNumber(state.picked_tokens) &&
    isFiniteNumber(state.clock_tick) &&
    Array.isArray(state.tokens) &&
    state.tokens.every(
      (token) =>
        isPoint(token) && isFiniteNumber((token as { value?: unknown }).value),
    ) &&
    Array.isArray(state.enemies) &&
    state.enemies.every(isPoint)
  )
}

/** Validate one server run and its authoritative game state. */
export function parseUltraRouterGameRun(
  value: unknown,
): UltraRouterGameRun | null {
  if (!value || typeof value !== "object") return null
  const run = value as Record<string, unknown>
  if (
    (typeof run.id !== "string" && typeof run.id !== "number") ||
    !String(run.id).trim() ||
    typeof run.status !== "string" ||
    !isGameState(run.state)
  )
    return null
  return {
    id: String(run.id),
    status: run.status,
    state: run.state,
    ...(isFiniteNumber(run.first_token_quota)
      ? { first_token_quota: run.first_token_quota }
      : {}),
    ...(isFiniteNumber(run.subsequent_token_quota)
      ? { subsequent_token_quota: run.subsequent_token_quota }
      : {}),
  }
}

/** Combine the game and reward endpoints into a safe start/status snapshot. */
export function parseUltraRouterGameSnapshot(
  gameValue: unknown,
  rewardsValue: unknown,
): UltraRouterGameSnapshot | undefined {
  if (!gameValue || typeof gameValue !== "object") return undefined
  const game = gameValue as Record<string, unknown>
  const settings = game.settings
  const rewards =
    rewardsValue && typeof rewardsValue === "object"
      ? (rewardsValue as Record<string, unknown>)
      : undefined
  const budgets = rewards?.budgets ?? game.budgets
  if (
    !settings ||
    typeof settings !== "object" ||
    typeof (settings as Record<string, unknown>).enabled !== "boolean" ||
    !budgets ||
    typeof budgets !== "object" ||
    typeof (budgets as Record<string, unknown>).can_start !== "boolean" ||
    !(
      game.run === null ||
      game.run === undefined ||
      parseUltraRouterGameRun(game.run)
    )
  )
    return undefined

  const run =
    game.run === null || game.run === undefined
      ? null
      : parseUltraRouterGameRun(game.run)
  if (game.run != null && !run) return undefined

  return {
    run,
    settings: {
      enabled: (settings as Record<string, unknown>).enabled as boolean,
    },
    budgets: {
      can_start: (budgets as Record<string, unknown>).can_start as boolean,
    },
    ...(typeof game.server_time === "string" ||
    typeof game.server_time === "number"
      ? { server_time: game.server_time }
      : {}),
    ...(typeof game.resets_at === "string" || typeof game.resets_at === "number"
      ? { resets_at: game.resets_at }
      : {}),
  }
}

/** Return the official input cursor used by the site client for this run. */
export function readUltraRouterGameClock(state: UltraRouterGameState): number {
  return state.version >= 2 ? state.clock_tick : state.tick
}

/**
 * Selects one legal direction from the latest server-authoritative snapshot.
 * The game simulates weapons, enemies, drops and pickups; this planner only
 * chooses ordinary movement inputs and never invents game state or rewards.
 */
export function chooseUltraRouterGameDirection(
  state: UltraRouterGameState,
): number {
  const nearest = <T extends { x: number; y: number }>(items: T[]) =>
    items
      .map((item) => ({
        item,
        distance: Math.hypot(item.x - state.x, item.y - state.y),
      }))
      .sort((left, right) => left.distance - right.distance)[0]

  const token = nearest(state.tokens)
  const enemy = nearest(state.enemies)
  let dx: number
  let dy: number

  if (enemy && enemy.distance < 700) {
    dx = state.x - enemy.item.x
    dy = state.y - enemy.item.y
  } else if (token) {
    dx = token.item.x - state.x
    dy = token.item.y - state.y
  } else if (enemy && enemy.distance < 1_700) {
    dx = state.x - enemy.item.x
    dy = state.y - enemy.item.y
  } else {
    // Keep moving through the arena so automatic attacks can create real drops.
    const sector = Math.floor(state.tick / 80) % 8
    return [3, 4, 5, 6, 7, 8, 1, 2][sector]!
  }

  if (dx === 0 && dy === 0) return 0
  const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8
  return ((octant + 2) % 8) + 1
}

/** Encode up to two seconds of normal game frames from the authoritative state. */
export function buildUltraRouterGameInputBatch(
  run: UltraRouterGameRun,
): number[] {
  const { state } = run
  const direction = chooseUltraRouterGameDirection(state)
  const inputs: number[] = []
  let tick = state.tick
  let upgrades = state.upgrades
  let dashReady = state.dash_ready
  const nearestEnemy = state.enemies
    .map((enemy) => Math.hypot(enemy.x - state.x, enemy.y - state.y))
    .sort((left, right) => left - right)[0]

  for (
    let frame = 0;
    frame < ULTRAROUTER_GAME_RULES.framesPerBatch;
    frame += 1
  ) {
    if (tick >= ULTRAROUTER_GAME_RULES.ticksPerRun) break

    const upgradeDue = upgrades < 3 && tick >= Math.min(3, upgrades + 1) * 200
    if (state.version >= 2 && upgradeDue) {
      // Upgrade 3 is a documented in-game choice (extra target on v3, health
      // on v2); the server still applies it only after accepting this input.
      inputs.push(3 << 5)
      upgrades += 1
      continue
    }

    const shouldDash =
      state.version >= 3 &&
      nearestEnemy !== undefined &&
      nearestEnemy < 1_700 &&
      tick >= dashReady
    inputs.push(direction | (shouldDash ? 16 : 0))
    if (shouldDash) dashReady = tick + 45
    tick += 1
  }

  // A start response must always lead to at least one advancing game input.
  return inputs
}

/** Require both server completion and at least one server-recorded token pickup. */
export function isCompletedUltraRouterGame(run: UltraRouterGameRun): boolean {
  return run.status === "survived" && run.state.picked_tokens > 0
}

/** Record only a quota increase observed after the server reports a survived run. */
export function createUltraRouterGameAward(input: {
  account: SiteAccount
  quotaDelta: number
  observedAt: number
  runId: string
  amount: {
    asset: import("~/services/amounts/assets").Asset
    nativeUnitsPerAsset?: number
    amountInputs?: EvidenceRef["amountInputs"]
    contractVersion: string
  }
}): ConfirmedAward {
  return accountAward(input.account, {
    id: "daily-game-quota",
    operation: ULTRAROUTER_GAME_ENDPOINTS.Self,
    field: "quota_delta_after_survived_run",
    asset: input.amount.asset,
    value: input.quotaDelta,
    ...(input.amount.nativeUnitsPerAsset !== undefined
      ? { nativeUnitsPerAsset: input.amount.nativeUnitsPerAsset }
      : {}),
    ...(input.amount.amountInputs
      ? { amountInputs: input.amount.amountInputs }
      : {}),
    contractVersion: input.amount.contractVersion,
    target: AWARD_TARGETS.Wallet,
    fulfillment: AWARD_FULFILLMENT.Credited,
    event: {
      namespace: "ultrarouter-game-run",
      id: input.runId,
    },
    observedAt: input.observedAt,
  })
}
