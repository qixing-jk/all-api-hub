import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { readCubenceUser } from "./identity"
import { withCubenceSession } from "./session"
import {
  cubenceNumber,
  invalidCubenceResponse,
  readCubenceResponse,
} from "./transport"

const KEYS = "/api/v1/user/apikeys"
export type CubenceKey = {
  id: number
  user_id: number
  key: string
  name: string
  status: "active" | "disabled"
  share_type: string
  share_group_id: number
  quota_limit: number
  quota_used: number
  usage_count: number
  last_used_at: string | null
}
export type CubenceGroup = {
  id: number
  name: string
  is_active: boolean
  multiplier: number
  supported_protocols: string[]
}
export type CubenceKeyInput = {
  name: string
  quota_limit: number
  share_group_id: number
}
export type CubenceKeyUpdate = Omit<CubenceKeyInput, "name"> & {
  status: "active" | "disabled"
}

/** The live inventory exposes plaintext and all editable fields; no reveal/detail route is used. */
function parseKey(value: unknown, userId: number): CubenceKey {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    typeof value.key !== "string" ||
    typeof value.name !== "string" ||
    (value.status !== "active" && value.status !== "disabled") ||
    typeof value.share_type !== "string" ||
    !Number.isSafeInteger(value.share_group_id) ||
    Number(value.share_group_id) <= 0
  )
    return invalidCubenceResponse(KEYS)
  if (value.user_id !== userId)
    throw new ApiError(
      "Cubence key identity mismatch",
      undefined,
      KEYS,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  const quotaLimit = cubenceNumber(value.quota_limit, KEYS)
  const quotaUsed = cubenceNumber(value.quota_used, KEYS)
  const usageCount = cubenceNumber(value.usage_count, KEYS)
  if (
    (quotaLimit !== -1 && quotaLimit < 0) ||
    quotaUsed < 0 ||
    usageCount < 0 ||
    !Number.isSafeInteger(usageCount)
  )
    invalidCubenceResponse(KEYS)
  return {
    id: Number(value.id),
    user_id: userId,
    key: value.key,
    name: value.name,
    status: value.status,
    share_type: value.share_type,
    share_group_id: Number(value.share_group_id),
    quota_limit: quotaLimit,
    quota_used: quotaUsed,
    usage_count: usageCount,
    last_used_at:
      typeof value.last_used_at === "string" ? value.last_used_at : null,
  }
}

/** One full unpaginated inventory, as used by the official console. */
export async function fetchKeys(
  request: ApiServiceRequest,
): Promise<CubenceKey[]> {
  return withCubenceSession(request, async (request) => {
    const user = await readCubenceUser(request)
    const body = await readCubenceResponse(request, KEYS)
    if (body.success !== true || !Array.isArray(body.data))
      return invalidCubenceResponse(KEYS)
    return body.data.map((value) => parseKey(value, user.id))
  })
}

/** Fetch current native choices; required group selection must never use a guessed default. */
export async function fetchGroups(
  request: ApiServiceRequest,
): Promise<CubenceGroup[]> {
  return withCubenceSession(request, async (request) => {
    await readCubenceUser(request)
    const endpoint = "/api/v1/share-groups/available"
    const body = await readCubenceResponse(request, endpoint)
    if (!Array.isArray(body.data)) return invalidCubenceResponse(endpoint)
    return body.data.map((value) => {
      if (
        !isRecord(value) ||
        !Number.isSafeInteger(value.id) ||
        Number(value.id) <= 0 ||
        typeof value.name !== "string" ||
        typeof value.is_active !== "boolean" ||
        !Array.isArray(value.supported_protocols) ||
        value.supported_protocols.some((p) => typeof p !== "string")
      )
        return invalidCubenceResponse(endpoint)
      const multiplier = cubenceNumber(value.multiplier, endpoint)
      if (multiplier < 0) return invalidCubenceResponse(endpoint)
      return {
        id: Number(value.id),
        name: value.name,
        is_active: value.is_active,
        multiplier,
        supported_protocols: value.supported_protocols as string[],
      }
    })
  })
}

/** Validate resource ids before embedding them in a path. */
function resourcePath(id: string): string {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return invalidCubenceResponse(KEYS)
  return `${KEYS}/${id}`
}

/** Native create uses microcredit quota and exactly one public share group. */
export async function createKey(
  request: ApiServiceRequest,
  input: CubenceKeyInput,
): Promise<CubenceKey> {
  return withCubenceSession(request, async (request) => {
    const user = await readCubenceUser(request)
    const body = await readCubenceResponse(request, KEYS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        quota_limit: input.quota_limit,
        share_group_id: input.share_group_id,
        share_type: "public",
      }),
    })
    if (body.success !== true) return invalidCubenceResponse(KEYS)
    return parseKey(body.data, user.id)
  })
}

/** Native fields use separate PATCH routes; confirm writes and retain untouched settings. */
export async function updateKey(
  request: ApiServiceRequest,
  baseline: CubenceKey,
  next: CubenceKeyUpdate,
  prepared?: CubenceKey,
): Promise<CubenceKey> {
  return withCubenceSession(request, async (request) => {
    const path = resourcePath(String(baseline.id))
    const owner = await readCubenceUser(request)
    const current =
      prepared ??
      (await fetchKeys(request)).find((key) => key.id === baseline.id)
    if (current && (current.id !== baseline.id || current.user_id !== owner.id))
      throw new AccountKeyResourceError({ code: "not_found" })
    if (!current) throw new AccountKeyResourceError({ code: "not_found" })
    const fields = [
      ["quota_limit", "quota"],
      ["share_group_id", "share-group"],
      ["status", "status"],
    ] as const
    const changed = fields.filter(([field]) => next[field] !== baseline[field])
    for (const [field] of changed)
      if (current[field] !== baseline[field] && current[field] !== next[field])
        throw new AccountKeyResourceError({ code: "resource_changed" })
    for (const [field, route] of changed) {
      if (current[field] === next[field]) continue
      await readCubenceResponse(request, `${path}/${route}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next[field] }),
      })
    }
    return {
      ...current,
      ...Object.fromEntries(changed.map(([field]) => [field, next[field]])),
    }
  })
}

/** Delete once after verifying the saved Cookie account identity. */
export async function deleteKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  const path = resourcePath(id)
  return withCubenceSession(request, async (request) => {
    await readCubenceUser(request)
    await readCubenceResponse(request, path, { method: "DELETE" })
  })
}
