import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS, DAYA_KEY_STATUSES } from "./constants"
import { fetchDayaIdentity } from "./identity"
import {
  fetchDayaData,
  invalidDayaResponse,
  withDayaSession,
} from "./transport"

export type DayaGroup = {
  description?: string
  id: number
  name: string
  platform: string
  /** Billing multiplier relative to the base price, e.g. 0.24. */
  rateMultiplier: number
}

export type DayaKeyStatus =
  (typeof DAYA_KEY_STATUSES)[keyof typeof DAYA_KEY_STATUSES]

export type DayaKey = {
  allowFast: boolean
  id: number
  /** Recoverable plaintext; the console list and detail both carry it. */
  key: string
  name: string
  groupIds: readonly number[]
  status: DayaKeyStatus
  /** Total spending cap in USD; `0` is the console's unlimited sentinel. */
  quotaUsd: number
  quotaUsedUsd: number
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  ipWhitelist: readonly string[] | null
  ipBlacklist: readonly string[] | null
  rateLimits: {
    hours5Usd: number
    dayUsd: number
    days7Usd: number
  }
}

const keyPath = (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return invalidDayaResponse(DAYA_ENDPOINTS.Keys)
  return `${DAYA_ENDPOINTS.Keys}/${id}`
}

/** One selectable billing group; a malformed catalogue entry aborts the read. */
function parseGroup(value: unknown): DayaGroup {
  const endpoint = DAYA_ENDPOINTS.GroupsAvailable
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.platform !== "string" ||
    typeof value.rate_multiplier !== "number" ||
    !Number.isFinite(value.rate_multiplier)
  )
    return invalidDayaResponse(endpoint)
  return {
    id: value.id as number,
    name: value.name.trim(),
    platform: value.platform,
    rateMultiplier: value.rate_multiplier as number,
    ...(typeof value.description === "string" && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
  }
}

/** Group selection is required: the console rejects an empty `group_ids`. */
export async function fetchDayaGroups(
  request: ApiServiceRequest,
): Promise<DayaGroup[]> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const groups = await fetchDayaData(scoped, DAYA_ENDPOINTS.GroupsAvailable)
    if (!Array.isArray(groups))
      return invalidDayaResponse(DAYA_ENDPOINTS.GroupsAvailable)
    return groups.map(parseGroup)
  })
}

/** Ordered defaults configured by the console, independently of catalogue order. */
export async function fetchDayaDefaultKeyGroups(
  request: ApiServiceRequest,
): Promise<DayaGroup[]> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const data = await fetchDayaData(scoped, DAYA_ENDPOINTS.DefaultKeyGroups)
    if (!Array.isArray(data))
      return invalidDayaResponse(DAYA_ENDPOINTS.DefaultKeyGroups)
    return data.map(parseGroup)
  })
}

const keyStatuses = new Set<unknown>(Object.values(DAYA_KEY_STATUSES))

/** One native key record; the console's own field set is the contract. */
function parseKey(value: unknown): DayaKey {
  const endpoint = DAYA_ENDPOINTS.Keys
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    typeof value.key !== "string" ||
    !value.key.trim() ||
    (value.name !== null && typeof value.name !== "string") ||
    !Array.isArray(value.group_ids) ||
    !keyStatuses.has(value.status) ||
    typeof value.quota !== "number" ||
    !Number.isFinite(value.quota) ||
    typeof value.quota_used !== "number" ||
    !Number.isFinite(value.quota_used) ||
    (value.expires_at !== null && typeof value.expires_at !== "string") ||
    (value.last_used_at !== null && typeof value.last_used_at !== "string") ||
    typeof value.created_at !== "string" ||
    (value.ip_whitelist !== null && !Array.isArray(value.ip_whitelist)) ||
    (value.ip_blacklist !== null && !Array.isArray(value.ip_blacklist)) ||
    (value.allow_fast !== undefined && typeof value.allow_fast !== "boolean")
  )
    return invalidDayaResponse(endpoint)
  const groupIds = value.group_ids.map((id) => {
    if (!Number.isSafeInteger(id) || Number(id) <= 0)
      return invalidDayaResponse(endpoint)
    return Number(id)
  })
  const ipList = (field: "ip_whitelist" | "ip_blacklist") => {
    const entries = value[field]
    if (entries === null) return null
    if (!Array.isArray(entries)) return invalidDayaResponse(endpoint)
    const list = entries.map((entry) => {
      if (typeof entry !== "string") return invalidDayaResponse(endpoint)
      return entry
    })
    return list
  }
  const rateLimit = (field: string) => {
    const amount = value[field]
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
      return invalidDayaResponse(endpoint)
    return amount
  }
  return {
    id: value.id as number,
    // The native editor treats absent values from older responses as enabled.
    allowFast: value.allow_fast !== false,
    key: value.key,
    name: value.name ?? "",
    groupIds,
    status: value.status as DayaKeyStatus,
    quotaUsd: value.quota,
    quotaUsedUsd: value.quota_used,
    expiresAt: value.expires_at,
    lastUsedAt: value.last_used_at,
    createdAt: value.created_at,
    ipWhitelist: ipList("ip_whitelist"),
    ipBlacklist: ipList("ip_blacklist"),
    rateLimits: {
      hours5Usd: rateLimit("rate_limit_5h"),
      dayUsd: rateLimit("rate_limit_1d"),
      days7Usd: rateLimit("rate_limit_7d"),
    },
  }
}

interface DayaKeyPage {
  items: DayaKey[]
  total: number
}

/** One inventory page; the console pages keys instead of returning them all. */
async function fetchKeyPage(
  request: ApiServiceRequest,
  page: number,
): Promise<DayaKeyPage> {
  const endpoint = DAYA_ENDPOINTS.Keys
  const data = await fetchDayaData(
    request,
    `${endpoint}?page=${page}&page_size=100`,
  )
  if (!isRecord(data) || !Array.isArray(data.items))
    return invalidDayaResponse(endpoint)
  const total = data.total
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0)
    return invalidDayaResponse(endpoint)
  return { items: data.items.map(parseKey), total }
}

/** One inventory read; the console defaults to 20 rows and the API allows 100. */
export async function fetchDayaKeys(
  request: ApiServiceRequest,
): Promise<DayaKey[]> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const first = await fetchKeyPage(scoped, 1)
    const pages = Math.ceil(first.total / 100) || 1
    if (pages <= 1) return first.items
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchKeyPage(scoped, i + 2)),
    )
    return [...first.items, ...rest.flatMap((page) => page.items)]
  })
}

/** The detail route answers 404 (`reason:"API_KEY_NOT_FOUND"`) for removed keys. */
export async function fetchDayaKey(
  request: ApiServiceRequest,
  id: string,
): Promise<DayaKey> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    try {
      return parseKey(await fetchDayaData(scoped, keyPath(id)))
    } catch (error) {
      if (error instanceof Error && /api key not found/i.test(error.message))
        throw new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
        })
      throw error
    }
  })
}

/**
 * The console's create form sends only the fields the operator set. Quota and
 * rate limits arrive in USD; expiry arrives as whole `expires_in_days` and the
 * server derives the timestamp. Optional custom secrets and restrictions follow
 * the ordinary console create form.
 */
export async function createDayaKey(
  request: ApiServiceRequest,
  input: {
    allowFast?: boolean
    customKey?: string
    ipWhitelist?: readonly string[]
    ipBlacklist?: readonly string[]
    rateLimits?: DayaKey["rateLimits"]
    name: string
    groupIds: readonly number[]
    quotaUsd: number | null
    expiresInDays: number | null
  },
): Promise<{ secret: string; item: DayaKey }> {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const body: Record<string, unknown> = {
      allow_fast: input.allowFast ?? true,
    }
    if (input.customKey) body.custom_key = input.customKey
    if (input.ipWhitelist?.length) body.ip_whitelist = input.ipWhitelist
    if (input.ipBlacklist?.length) body.ip_blacklist = input.ipBlacklist
    if (input.rateLimits) {
      if (input.rateLimits.hours5Usd > 0)
        body.rate_limit_5h = input.rateLimits.hours5Usd
      if (input.rateLimits.dayUsd > 0)
        body.rate_limit_1d = input.rateLimits.dayUsd
      if (input.rateLimits.days7Usd > 0)
        body.rate_limit_7d = input.rateLimits.days7Usd
    }
    const name = input.name.trim()
    if (name) body.name = name
    const groupIds = [...new Set(input.groupIds.filter((id) => id > 0))]
    body.group_ids = groupIds
    body.group_id = groupIds[0]
    if (input.quotaUsd !== null && input.quotaUsd > 0)
      body.quota = input.quotaUsd
    if (input.expiresInDays !== null && input.expiresInDays > 0)
      body.expires_in_days = input.expiresInDays
    const created = await fetchDayaData(scoped, DAYA_ENDPOINTS.Keys, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (
      !isRecord(created) ||
      typeof created.key !== "string" ||
      !created.key.trim()
    )
      return invalidDayaResponse(DAYA_ENDPOINTS.Keys)
    return { secret: created.key, item: parseKey(created) }
  })
}

/**
 * The update route replaces the writable fields it receives. The console's own
 * edit sends the full accepted set. Lifecycle-only callers may omit restrictions
 * and budgets; these retain the fresh baseline rather than being dropped.
 */
export async function updateDayaKey(
  request: ApiServiceRequest,
  baseline: DayaKey,
  next: {
    allowFast?: boolean
    name: string
    groupIds: readonly number[]
    quotaUsd: number
    ipWhitelist?: readonly string[]
    ipBlacklist?: readonly string[]
    rateLimits?: DayaKey["rateLimits"]
    status: DayaKeyStatus
    expiresAt: string | null
  },
): Promise<DayaKey> {
  const path = keyPath(String(baseline.id))
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    const groupIds = [...new Set(next.groupIds.filter((id) => id > 0))]
    if (groupIds.length === 0) return invalidDayaResponse(path)
    const name = next.name.trim()
    const body: Record<string, unknown> = {
      allow_fast: next.allowFast ?? baseline.allowFast,
      ...(name ? { name } : {}),
      group_ids: groupIds,
      status: next.status,
      ip_whitelist: next.ipWhitelist ?? baseline.ipWhitelist ?? [],
      ip_blacklist: next.ipBlacklist ?? baseline.ipBlacklist ?? [],
      quota: next.quotaUsd,
      expires_at: next.expiresAt ?? "",
      rate_limit_5h:
        next.rateLimits?.hours5Usd ?? baseline.rateLimits.hours5Usd,
      rate_limit_1d: next.rateLimits?.dayUsd ?? baseline.rateLimits.dayUsd,
      rate_limit_7d: next.rateLimits?.days7Usd ?? baseline.rateLimits.days7Usd,
    }
    const updated = await fetchDayaData(scoped, path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    // Successful acknowledgments are authoritative; a malformed echo stays out
    // of the inventory until the next read.
    return isRecord(updated) ? parseKey(updated) : baseline
  })
}

/** Permanently removes the key record. */
export async function deleteDayaKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const path = keyPath(id)
  await withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    await fetchDayaData(scoped, path, { method: "DELETE" })
  })
}
