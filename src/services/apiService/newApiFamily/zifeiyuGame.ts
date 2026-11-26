import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"

/** ZIFEIYU's game routes require the dashboard's browser session, not an API token. */
export const ZIFEIYU_GAME_ORIGIN = "https://ai.112102.xyz"
const GAME_RUN_STATUSES = [
  "running",
  "defeated",
  "survived",
  "abandoned",
] as const

export interface ZifeiyuGameState {
  version: number
  tick: number
  clock_tick?: number
  pause_ticks?: number
  rng: number
  x: number
  y: number
  hp: number
  max_hp: number
  score: number
  kills: number
  collected: number
  picked_tokens: number
  power: number
  speed: number
  upgrades: number
  enemies: Array<{ id: number; x: number; y: number; hp: number; kind: number }>
  tokens: Array<{ x: number; y: number; value: number }>
  [field: string]: unknown
}

export interface ZifeiyuGameRun {
  id: string
  day: string
  week: string
  started_at: number
  finished_at: number
  status: "running" | "defeated" | "survived" | "abandoned"
  score: number
  quota_awarded: number
  reward_version: number
  state: ZifeiyuGameState
  server_time: number
}

export interface ZifeiyuGameStatus {
  settings: { enabled: boolean; rewards_enabled: boolean }
  budgets: {
    can_start: boolean
    daily_remaining: number
    max_run_reward: number
  }
  run: ZifeiyuGameRun | null
  day: string
  week: string
  resets_at: number
  server_time: number
}

export interface ZifeiyuGameRewards {
  budgets: {
    daily_quota: number
    daily_remaining: number
    weekly_pool: number
    first_token_quota: number
    subsequent_token_quota: number
    daily_reserved: number
    unlimited: boolean
    max_run_reward: number
    can_start: boolean
  }
  week: string
  enabled: boolean
  rewards_enabled: boolean
  server_time: number
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/** Validates the game run fields consumed by discovery and the input planner. */
function parseZifeiyuGameRun(value: unknown): ZifeiyuGameRun {
  const run = asRecord(value)
  const state = asRecord(run?.state)
  if (
    !run ||
    typeof run.id !== "string" ||
    !GAME_RUN_STATUSES.includes(run.status as ZifeiyuGameRun["status"]) ||
    !state ||
    !isFiniteNumber(state.version) ||
    !isFiniteNumber(state.tick) ||
    !isFiniteNumber(state.hp) ||
    !isFiniteNumber(state.x) ||
    !isFiniteNumber(state.y) ||
    !Array.isArray(state.enemies) ||
    !Array.isArray(state.tokens) ||
    typeof run.day !== "string" ||
    !isFiniteNumber(run.started_at) ||
    !isFiniteNumber(run.server_time) ||
    !isFiniteNumber(run.quota_awarded) ||
    !Number.isSafeInteger(run.quota_awarded) ||
    run.quota_awarded < 0
  ) {
    throw new Error("Invalid ZIFEIYU game run")
  }
  return value as ZifeiyuGameRun
}

/**
 * Uses the current Edge profile's ambient same-origin Cookie jar without
 * reading or storing Cookie bytes. The site identity is checked before use.
 */
export function createZifeiyuBrowserSessionRequest(
  account: SiteAccount,
  abortSignal?: AbortSignal,
): ApiServiceRequest {
  const accountUrl = new URL(account.site_url)
  if (
    account.site_type !== SITE_TYPES.NEW_API ||
    accountUrl.origin !== ZIFEIYU_GAME_ORIGIN ||
    accountUrl.protocol !== "https:" ||
    !account.account_info?.id
  ) {
    throw new Error("ZIFEIYU browser session is not available for this account")
  }

  return {
    baseUrl: ZIFEIYU_GAME_ORIGIN,
    siteType: account.site_type,
    accountId: account.id,
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
    allowAccountCredentialRecovery: false,
    ...(abortSignal ? { abortSignal } : {}),
    auth: {
      authType: AuthTypeEnum.Cookie,
      userId: account.account_info.id,
    },
  }
}

/**
 * Refuses to use the profile's site session unless it identifies this saved
 * account. No access token or Cookie header leaves this adapter.
 */
export async function assertZifeiyuBrowserSessionIdentity(
  account: SiteAccount,
  request = createZifeiyuBrowserSessionRequest(account),
): Promise<void> {
  const self = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: "/api/user/self",
    options: { method: "GET", cache: "no-store" },
  })
  const id = asRecord(self)?.id
  if (String(id ?? "") !== String(account.account_info.id)) {
    throw new Error("ZIFEIYU browser session belongs to another account")
  }
}

/** Reads the account's credited New API quota without advancing a game run. */
export async function readZifeiyuAccountQuota(
  account: SiteAccount,
  signal?: AbortSignal,
): Promise<number> {
  const request = createZifeiyuBrowserSessionRequest(account, signal)
  const self = asRecord(
    await newApiFamilyRequests.data<unknown>(request, {
      endpoint: "/api/user/self",
      options: { method: "GET", cache: "no-store" },
    }),
  )
  if (!self || String(self.id ?? "") !== String(account.account_info.id)) {
    throw new Error("ZIFEIYU browser session belongs to another account")
  }

  const quota =
    typeof self.quota === "number"
      ? self.quota
      : typeof self.quota === "string" && /^\d+$/.test(self.quota)
        ? Number(self.quota)
        : Number.NaN
  if (!Number.isSafeInteger(quota) || quota < 0) {
    throw new Error("ZIFEIYU account quota is unavailable for reward readback")
  }
  return quota
}

/** Validates the account's current server-authoritative game state. */
export function parseZifeiyuGameStatus(value: unknown): ZifeiyuGameStatus {
  const root = asRecord(value)
  const settings = asRecord(root?.settings)
  const budgets = asRecord(root?.budgets)
  const day = root?.day
  const week = root?.week
  const resetsAt = root?.resets_at
  const serverTime = root?.server_time
  const run = root?.run

  if (
    !settings ||
    typeof settings.enabled !== "boolean" ||
    typeof settings.rewards_enabled !== "boolean" ||
    !budgets ||
    typeof budgets.can_start !== "boolean" ||
    !isFiniteNumber(budgets.daily_remaining) ||
    !isFiniteNumber(budgets.max_run_reward) ||
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    typeof week !== "string" ||
    !isFiniteNumber(resetsAt) ||
    !isFiniteNumber(serverTime)
  ) {
    throw new Error("Invalid ZIFEIYU game status")
  }
  if (run !== null) {
    parseZifeiyuGameRun(run)
  }

  return value as ZifeiyuGameStatus
}

/** Reads game status during an explicit play operation; stale runs may advance. */
export async function readZifeiyuGameStatus(
  account: SiteAccount,
  signal?: AbortSignal,
): Promise<ZifeiyuGameStatus> {
  const request = createZifeiyuBrowserSessionRequest(account, signal)
  await assertZifeiyuBrowserSessionIdentity(account, request)
  return parseZifeiyuGameStatus(
    await newApiFamilyRequests.data<unknown>(request, {
      endpoint: "/api/user/game",
      options: { method: "GET", cache: "no-store" },
    }),
  )
}

/** Pure discovery/readiness endpoint; unlike `/api/user/game`, it never advances a run. */
export async function readZifeiyuGameRewards(
  account: SiteAccount,
  signal?: AbortSignal,
): Promise<ZifeiyuGameRewards> {
  const request = createZifeiyuBrowserSessionRequest(account, signal)
  await assertZifeiyuBrowserSessionIdentity(account, request)
  const value = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: "/api/user/game/rewards",
    options: { method: "GET", cache: "no-store" },
  })
  const root = asRecord(value)
  const budgets = asRecord(root?.budgets)
  if (
    !budgets ||
    typeof root?.week !== "string" ||
    typeof root.enabled !== "boolean" ||
    typeof root.rewards_enabled !== "boolean" ||
    !isFiniteNumber(root.server_time) ||
    !isFiniteNumber(budgets.daily_remaining) ||
    !isFiniteNumber(budgets.max_run_reward) ||
    typeof budgets.can_start !== "boolean"
  ) {
    throw new Error("Invalid ZIFEIYU game rewards status")
  }
  return value as ZifeiyuGameRewards
}

/** Starts one server-authoritative daily game; never retries this mutation. */
export async function startZifeiyuGame(
  account: SiteAccount,
  request = createZifeiyuBrowserSessionRequest(account),
): Promise<ZifeiyuGameRun> {
  const result = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: "/api/user/game/start",
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    options: { method: "POST", body: undefined },
  })
  return parseZifeiyuGameRun(result)
}

/** Sends only the site's documented, bounded input batch for this run. */
export async function sendZifeiyuGameInputs(
  request: ApiServiceRequest,
  input: { id: string; from: number; inputs: number[]; quit?: boolean },
): Promise<ZifeiyuGameRun> {
  if (
    !input.id ||
    !Number.isInteger(input.from) ||
    input.from < 0 ||
    input.inputs.length > 300 ||
    input.inputs.some(
      (value) =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 127 ||
        (value & 15) > 8,
    )
  ) {
    throw new Error("Invalid ZIFEIYU game input batch")
  }
  const result = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: "/api/user/game/input",
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    options: {
      method: "POST",
      body: JSON.stringify(input),
    },
  })
  const run = parseZifeiyuGameRun(result)
  if (run.id !== input.id)
    throw new Error("Invalid ZIFEIYU game input response")
  return run
}
