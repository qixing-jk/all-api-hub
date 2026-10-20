import {
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import {
  EMRANK_ENDPOINTS,
  EMRANK_KEY_EXPIRATION_MODES as expirationModes,
} from "./constants"
import { fetchEmRankIdentity } from "./identity"
import {
  emRankCount,
  invalidEmRankResponse,
  readEmRank,
  withEmRankSession,
} from "./transport"

export const EMRANK_KEY_STATUS = {
  Enabled: "enabled",
  Disabled: "disabled",
  Expired: "expired",
  Exhausted: "exhausted",
  MigrationBlocked: "migration_blocked",
} as const

export type EmRankKeyStatus =
  (typeof EMRANK_KEY_STATUS)[keyof typeof EMRANK_KEY_STATUS]

const keyStatuses: readonly string[] = Object.values(EMRANK_KEY_STATUS)
const KEY_INVENTORY_PAGINATION = { PageSize: 50, MaxPages: 20 } as const

export type EmRankKey = {
  id: string
  name: string
  suffix: string
  canCopy: boolean
  enabled: boolean
  status: EmRankKeyStatus
  createdAt: number
  expiresAt: number | null
  totalQuota: number | null
  remainingQuota: number | null
  usedQuota: number
}

/** Validate native key metadata; ids are snowflake integers kept as strings. */
function parseKey(value: unknown, endpoint: string): EmRankKey {
  if (
    !isRecord(value) ||
    (typeof value.id !== "number" && typeof value.id !== "string") ||
    String(value.id).trim() === "" ||
    typeof value.name !== "string" ||
    typeof value.suffix !== "string" ||
    typeof value.can_copy !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    !keyStatuses.includes(String(value.status)) ||
    typeof value.created_at !== "number" ||
    (value.expires_at !== null && typeof value.expires_at !== "number")
  )
    invalidEmRankResponse(endpoint)
  const quotaCount = (field: "total_quota" | "remaining_quota") =>
    value[field] === null || value[field] === undefined
      ? null
      : emRankCount(value[field], endpoint)
  return {
    id: String(value.id),
    name: value.name,
    suffix: value.suffix,
    canCopy: value.can_copy,
    enabled: value.enabled,
    status: value.status as EmRankKeyStatus,
    createdAt: value.created_at,
    expiresAt: value.expires_at ?? null,
    totalQuota: quotaCount("total_quota"),
    remainingQuota: quotaCount("remaining_quota"),
    usedQuota: emRankCount(value.used_quota, endpoint),
  }
}

/** One page of the paginated inventory; page starts at 1 in the console. */
async function keysPage(
  request: ApiServiceRequest,
  page: number,
  pageSize: number = KEY_INVENTORY_PAGINATION.PageSize,
): Promise<{ keys: EmRankKey[]; total: number }> {
  const endpoint = `${EMRANK_ENDPOINTS.Keys}?page=${page}&page_size=${pageSize}`
  const body = await readEmRank(request, endpoint)
  if (
    !Array.isArray(body.data) ||
    typeof body.total !== "number" ||
    !Number.isSafeInteger(body.total) ||
    body.total < 0
  )
    invalidEmRankResponse(endpoint)
  return {
    keys: body.data.map((value) => parseKey(value, endpoint)),
    total: body.total,
  }
}

/** Read the complete inventory across pages, rejecting duplicates. */
export async function fetchKeys(
  request: ApiServiceRequest,
): Promise<EmRankKey[]> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const collected: EmRankKey[] = []
    const seen = new Set<string>()
    for (let page = 1; page <= KEY_INVENTORY_PAGINATION.MaxPages; page++) {
      const { keys, total } = await keysPage(scoped, page)
      for (const key of keys) {
        if (seen.has(key.id)) invalidEmRankResponse(EMRANK_ENDPOINTS.Keys)
        seen.add(key.id)
        collected.push(key)
      }
      if (collected.length >= total || keys.length === 0) return collected
    }
    throw new AccountKeyResourceError({ code: failures.Unavailable })
  })
}

export type EmRankKeyExpiration =
  | { mode: typeof expirationModes.Never }
  | { mode: typeof expirationModes.Month }
  | { mode: typeof expirationModes.Day }
  | { mode: typeof expirationModes.Hour }
  | { mode: typeof expirationModes.Custom; at: number }

export type EmRankKeyCreateInput = {
  name: string
  totalQuotaTokens: number | null
  expiration: EmRankKeyExpiration
}

export type EmRankKeyUpdateInput = Partial<EmRankKeyCreateInput> & {
  enabled?: boolean
}

const expirationJson = (expiration: EmRankKeyExpiration) =>
  expiration.mode === expirationModes.Custom
    ? { mode: expiration.mode, at: expiration.at }
    : { mode: expiration.mode }

/**
 * Create answers with a thinner row than the inventory list: no `status` and
 * no `suffix`. Both are recoverable — status from the enabled toggle, suffix
 * from the one-time secret the inventory masks.
 */
function parseCreatedKey(
  value: unknown,
  secret: string,
  endpoint: string,
): EmRankKey {
  return parseKey(
    isRecord(value)
      ? {
          ...value,
          status:
            typeof value.status === "string" && value.status
              ? value.status
              : value.enabled === true
                ? EMRANK_KEY_STATUS.Enabled
                : EMRANK_KEY_STATUS.Disabled,
          suffix:
            typeof value.suffix === "string" && value.suffix
              ? value.suffix
              : secret.slice(-4),
        }
      : value,
    endpoint,
  )
}

/**
 * Create once; the plaintext `sk-emr-…` secret is returned only in this
 * response and cannot be read from the inventory (suffix-only there).
 */
export async function createKey(
  request: ApiServiceRequest,
  input: EmRankKeyCreateInput,
): Promise<{ key: EmRankKey; secret: string }> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const body = await readEmRank(scoped, EMRANK_ENDPOINTS.Keys, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name.trim(),
        ...(input.totalQuotaTokens === null
          ? {}
          : { total_quota: String(input.totalQuotaTokens) }),
        expiration: expirationJson(input.expiration),
      }),
    })
    if (
      !isRecord(body.key) ||
      typeof body.secret !== "string" ||
      !body.secret.trim()
    )
      invalidEmRankResponse(EMRANK_ENDPOINTS.Keys)
    const secret = body.secret
    return {
      key: parseCreatedKey(body.key, secret, EMRANK_ENDPOINTS.Keys),
      secret,
    }
  })
}

/**
 * Update is a merge: only the sent fields change (verified 2026-10-16 — an
 * edit sending only `name` kept quota and expiry intact).
 */
export async function updateKey(
  request: ApiServiceRequest,
  id: string,
  input: EmRankKeyUpdateInput,
): Promise<void> {
  if (!/^\d{1,20}$/.test(id))
    throw new AccountKeyResourceError({ code: failures.NotFound })
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name.trim()
    if (input.totalQuotaTokens !== undefined)
      body.total_quota =
        input.totalQuotaTokens === null ? null : String(input.totalQuotaTokens)
    if (input.expiration !== undefined)
      body.expiration = expirationJson(input.expiration)
    if (input.enabled !== undefined) body.enabled = input.enabled
    await readEmRank(scoped, `${EMRANK_ENDPOINTS.Keys}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  })
}

/**
 * Id lists reach the console as integer arrays; a string id is rejected as an
 * unreadable body, so locators serialize as numbers rather than text.
 */
const nativeIdList = (ids: readonly string[]): number[] =>
  ids.map((id) => {
    if (!/^\d{1,20}$/.test(id))
      throw new AccountKeyResourceError({ code: failures.NotFound })
    const native = Number(id)
    if (!Number.isSafeInteger(native))
      throw new AccountKeyResourceError({ code: failures.NotFound })
    return native
  })

/** Reveal plaintext on demand; only `can_copy` keys answer with a secret. */
export async function revealKeySecrets(
  request: ApiServiceRequest,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const nativeIds = nativeIdList(ids)
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const secrets = new Map<string, string>()
    if (nativeIds.length === 0) return secrets
    const body = await readEmRank(scoped, EMRANK_ENDPOINTS.KeySecrets, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: nativeIds }),
    })
    if (!Array.isArray(body.data))
      invalidEmRankResponse(EMRANK_ENDPOINTS.KeySecrets)
    for (const value of body.data) {
      if (
        !isRecord(value) ||
        (typeof value.id !== "number" && typeof value.id !== "string") ||
        typeof value.secret !== "string" ||
        !value.secret.trim()
      )
        invalidEmRankResponse(EMRANK_ENDPOINTS.KeySecrets)
      secrets.set(String(value.id), value.secret)
    }
    return secrets
  })
}

/** Batch delete is the console's only removal route. */
export async function deleteKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const nativeIds = nativeIdList([id])
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    await readEmRank(scoped, EMRANK_ENDPOINTS.KeyBatchDelete, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: nativeIds }),
    })
  })
}
