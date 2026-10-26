import { fetchApiResponse } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import {
  VERCEL_ACCOUNT_ENDPOINTS,
  VERCEL_AI_GATEWAY_KEY_PURPOSE,
  VERCEL_TEAM_ID_QUERY_PARAM,
} from "./constants"
import { createVercelHttpError, VercelTeamRequiredError } from "./errors"
import { readVercelString as readString } from "./parsing"
import {
  createVercelAccountRequest,
  vercelRequests,
  withVercelQuery,
} from "./request"

/** Spend attribution the console offers per key; new keys default to `user`. */
export const VERCEL_KEY_SPEND_ATTRIBUTIONS = {
  User: "user",
  Team: "team",
} as const

export type VercelKeySpendAttribution =
  (typeof VERCEL_KEY_SPEND_ATTRIBUTIONS)[keyof typeof VERCEL_KEY_SPEND_ATTRIBUTIONS]

export const VERCEL_BUDGET_REFRESH_PERIODS = {
  None: "none",
  Daily: "daily",
  Weekly: "weekly",
  Monthly: "monthly",
} as const
export const VERCEL_BUDGET_PERIODS = [
  VERCEL_BUDGET_REFRESH_PERIODS.None,
  VERCEL_BUDGET_REFRESH_PERIODS.Daily,
  VERCEL_BUDGET_REFRESH_PERIODS.Weekly,
  VERCEL_BUDGET_REFRESH_PERIODS.Monthly,
] as const
export const VERCEL_BUDGET_ALERT_THRESHOLDS = [50, 75, 100] as const
export const VERCEL_BUDGET_MINIMUM_USD = 1
export type VercelKeyBudgetInput = {
  limitAmount: number
  refreshPeriod: (typeof VERCEL_BUDGET_PERIODS)[number]
  alertThresholds: readonly number[]
}

export type VercelAiGatewayKey = {
  id: string
  name: string
  /** Last six characters the inventory exposes; the secret itself is never re-shown. */
  partialKey: string
  purpose: string
  teamId: string
  projectId: string | null
  /** Unix epoch milliseconds, or null when the key never expires. */
  expiresAt: number | null
  activeAt: number
  createdAt: number
  createdBy: string
  leakedAt: number | null
  spendAttribution?: VercelKeySpendAttribution
  metadata?: Record<string, unknown>
  /** Undefined means unread; null means no custom budget, not unlimited. */
  budget?: VercelKeyBudget | null
  defaultBudget?: VercelKeyBudget | null
}

export type VercelKeyBudget = VercelKeyBudgetInput & {
  currentSpend: number
  active: boolean
  archived: boolean
  includeByokInQuota?: boolean
}

export type VercelAiGatewayKeyCreateInput = {
  name?: string
  expiresAt?: number
  spendAttribution?: VercelKeySpendAttribution
  aiGatewayQuota?: VercelKeyBudgetInput
}

export type VercelAiGatewayKeyCreateResult = {
  /** One-time plaintext; the console cannot show it again. */
  secret: string
  key: VercelAiGatewayKey
}

const readNumberOrNull = (value: unknown): number | null | undefined => {
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}

/** Reads one inventory row; unknown or partial rows are dropped. */
export function parseVercelAiGatewayKey(
  value: unknown,
): VercelAiGatewayKey | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const name = readString(value.name)
  const partialKey = readString(value.partialKey)
  const purpose = readString(value.purpose)
  const teamId = readString(value.teamId)
  const createdBy = readString(value.createdBy)
  const expiresAt = readNumberOrNull(value.expiresAt)
  const activeAt = readNumberOrNull(value.activeAt)
  const createdAt = readNumberOrNull(value.createdAt)
  const leakedAt = readNumberOrNull(value.leakedAt)
  if (
    !id ||
    !partialKey ||
    !purpose ||
    !teamId ||
    expiresAt === undefined ||
    activeAt === null ||
    activeAt === undefined ||
    createdAt === null ||
    createdAt === undefined ||
    leakedAt === undefined
  ) {
    return null
  }
  const metadata = isRecord(value.metadata) ? value.metadata : undefined
  const spendAttribution =
    metadata &&
    readString(metadata.spendAttribution) === VERCEL_KEY_SPEND_ATTRIBUTIONS.Team
      ? VERCEL_KEY_SPEND_ATTRIBUTIONS.Team
      : metadata &&
          readString(metadata.spendAttribution) ===
            VERCEL_KEY_SPEND_ATTRIBUTIONS.User
        ? VERCEL_KEY_SPEND_ATTRIBUTIONS.User
        : undefined
  return {
    id,
    name: name ?? "",
    partialKey,
    purpose,
    teamId,
    projectId: readString(value.projectId) ?? null,
    expiresAt,
    activeAt,
    createdAt,
    createdBy: createdBy ?? "",
    leakedAt,
    ...(spendAttribution ? { spendAttribution } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

const requireTeamId = (teamId: string | undefined): string => {
  const normalized = teamId?.trim() ?? ""
  if (!normalized) throw new VercelTeamRequiredError()
  return normalized
}

/**
 * Lists every AI Gateway key of one team. Verified 2026-10-24: without `limit`
 * the deployment returns the whole inventory with `pagination.next === null`.
 */
export async function listVercelAiGatewayKeys(
  request: ApiServiceRequest,
  teamId: string,
  options?: { signal?: AbortSignal },
): Promise<VercelAiGatewayKey[]> {
  const items = new Map<string, VercelAiGatewayKey>()
  const seen = new Set<number>()
  let cursor: number | undefined
  do {
    const body = await vercelRequests.payload<unknown>(
      {
        ...createVercelAccountRequest(request),
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      },
      {
        endpoint: withVercelQuery(VERCEL_ACCOUNT_ENDPOINTS.ApiKeys, {
          purpose: VERCEL_AI_GATEWAY_KEY_PURPOSE,
          [VERCEL_TEAM_ID_QUERY_PARAM]: requireTeamId(teamId),
          until: cursor,
        }),
        options: { method: "GET", cache: "no-store" },
        tempWindowFallback: { statusCodes: [], codes: [] },
      },
    )
    if (!isRecord(body) || !Array.isArray(body.apiKeys)) {
      throw new VercelKeyInventoryError()
    }
    for (const key of body.apiKeys
      .map(parseVercelAiGatewayKey)
      .filter((key): key is VercelAiGatewayKey => key !== null))
      items.set(key.id, key)
    const next = isRecord(body.pagination) ? body.pagination.next : undefined
    if (next === null || next === undefined) break
    if (typeof next !== "number" || !Number.isFinite(next) || seen.has(next))
      throw new VercelKeyInventoryError()
    seen.add(next)
    cursor = next
  } while (cursor !== undefined)
  return [...items.values()]
}

/** Reads one key by id; the list payload carries the same fields. */
export async function getVercelAiGatewayKey(
  request: ApiServiceRequest,
  teamId: string,
  id: string,
  options?: { signal?: AbortSignal },
): Promise<VercelAiGatewayKey> {
  const body = await vercelRequests.payload<unknown>(
    {
      ...createVercelAccountRequest(request),
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    },
    {
      endpoint: withVercelQuery(
        `${VERCEL_ACCOUNT_ENDPOINTS.ApiKeys}/${encodeURIComponent(id)}`,
        { [VERCEL_TEAM_ID_QUERY_PARAM]: requireTeamId(teamId) },
      ),
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  const key = isRecord(body) ? parseVercelAiGatewayKey(body.apiKey) : null
  if (!key) throw new VercelKeyInventoryError()
  return key
}

/**
 * Creates one AI Gateway key. The deployment answers with the plaintext
 * `apiKeyString` exactly once; every later read only exposes `partialKey`.
 */
export async function createVercelAiGatewayKey(
  request: ApiServiceRequest,
  teamId: string,
  input: VercelAiGatewayKeyCreateInput,
  options?: { signal?: AbortSignal },
): Promise<VercelAiGatewayKeyCreateResult> {
  const body = await vercelRequests.payload<unknown>(
    {
      ...createVercelAccountRequest(request),
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    },
    {
      endpoint: withVercelQuery(VERCEL_ACCOUNT_ENDPOINTS.ApiKeys, {
        [VERCEL_TEAM_ID_QUERY_PARAM]: requireTeamId(teamId),
      }),
      options: {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: VERCEL_AI_GATEWAY_KEY_PURPOSE,
          ...(input.aiGatewayQuota
            ? { aiGatewayQuota: input.aiGatewayQuota }
            : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(input.spendAttribution
            ? { metadata: { spendAttribution: input.spendAttribution } }
            : {}),
        }),
      },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  const secret = isRecord(body) ? readString(body.apiKeyString) : undefined
  const key = isRecord(body) ? parseVercelAiGatewayKey(body.apiKey) : null
  if (!secret || !key) throw new VercelKeyInventoryError()
  return { secret, key }
}

/** Native attribution edits replace metadata; never echo its read-only tokenPass field. */
export async function updateVercelKeyAttribution(
  request: ApiServiceRequest,
  teamId: string,
  key: VercelAiGatewayKey,
  spendAttribution: VercelKeySpendAttribution,
  options?: { signal?: AbortSignal },
) {
  const metadata = Object.fromEntries(
    Object.entries(key.metadata ?? {}).filter(
      ([field]) => field !== "tokenPass",
    ),
  )
  await vercelRequests.payload<unknown>(
    { ...createVercelAccountRequest(request), abortSignal: options?.signal },
    {
      endpoint: withVercelQuery(
        `${VERCEL_ACCOUNT_ENDPOINTS.ApiKeys}/${encodeURIComponent(key.id)}`,
        { teamId },
      ),
      options: {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { ...metadata, spendAttribution } }),
      },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  notifyApiTransportObserver(request.observer, "onMutationAccepted")
}

/** Deletes one key. The deployment answers `204` with no body. */
export async function deleteVercelAiGatewayKey(
  request: ApiServiceRequest,
  teamId: string,
  id: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const accountRequest = createVercelAccountRequest(request)
  const response = await fetchApiResponse<string>(
    {
      ...accountRequest,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
      observer: request.observer,
    },
    {
      endpoint: withVercelQuery(
        `${VERCEL_ACCOUNT_ENDPOINTS.ApiKeys}/${encodeURIComponent(id)}`,
        { [VERCEL_TEAM_ID_QUERY_PARAM]: requireTeamId(teamId) },
      ),
      responseType: "text",
      options: { method: "DELETE", cache: "no-store" },
      currentTabTransport: "disabled",
    },
  )
  if (!response.ok) {
    // The delete reads text so an empty 204 body stays valid; parse the error
    // envelope here so the deployment's own message survives.
    let parsed: unknown
    try {
      parsed =
        typeof response.body === "string"
          ? JSON.parse(response.body)
          : undefined
    } catch {
      parsed = undefined
    }
    throw createVercelHttpError(
      { ...response, body: parsed },
      VERCEL_ACCOUNT_ENDPOINTS.ApiKeys,
      `Vercel AI Gateway key deletion failed: ${response.status}`,
    )
  }
  notifyApiTransportObserver(request.observer, "onMutationAccepted")
}

/** The inventory payload did not match the verified contract. */
class VercelKeyInventoryError extends Error {
  constructor() {
    super("vercel_key_inventory_unreadable")
    this.name = "VercelKeyInventoryError"
  }
}
