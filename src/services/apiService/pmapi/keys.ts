import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS, PMAPI_KEY_STATUSES } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

export type PmApiKeyStatus =
  (typeof PMAPI_KEY_STATUSES)[keyof typeof PMAPI_KEY_STATUSES]

export type PmApiKey = {
  id: number
  name: string
  /** Recoverable plaintext; the console list route returns the full secret. */
  key: string
  status: PmApiKeyStatus
  enabled: boolean
  unlimited: boolean
  /** Budget cap in the console's New API quota unit; `0` when unlimited. */
  remainQuota: number
  usedQuota: number
  /** Unix seconds; `-1` is the console's never-expires sentinel. */
  expiredAt: number
  /** Comma-separated model whitelist; empty string means every model. */
  models: string
  /** Comma-separated CIDR/IP whitelist; empty string means no restriction. */
  subnet: string
  /** Per-minute request cap; `0` means unlimited. */
  rpm: number
  /** Token group; empty string follows the account group. */
  grp: string
  createdAt: number
  accessedAt: number
  requestCount: number
  userId: number
}

/** Writable token fields shared by create and edit forms. */
export type PmApiKeyInput = {
  name: string
  unlimited: boolean
  remainQuota: number
  expiredAt: number
  models: string
  subnet: string
  rpm: number
  grp: string
}

const keyPath = (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Tokens)
  return `${PMAPI_ENDPOINTS.Tokens}/${id}`
}

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

const keyStatuses = new Set<unknown>(Object.values(PMAPI_KEY_STATUSES))

/** One native token record; the console's own field set is the contract. */
function parseKey(value: unknown): PmApiKey {
  const endpoint = PMAPI_ENDPOINTS.Tokens
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    typeof value.key !== "string" ||
    !value.key.trim() ||
    (value.name !== null && typeof value.name !== "string") ||
    !keyStatuses.has(value.status) ||
    typeof value.unlimited !== "boolean" ||
    !finiteNonNegative(value.remain_quota) ||
    !finiteNonNegative(value.used_quota) ||
    !Number.isFinite(value.expired_at) ||
    (value.models !== null && typeof value.models !== "string") ||
    (value.subnet !== null && typeof value.subnet !== "string") ||
    !finiteNonNegative(value.rpm) ||
    (value.grp !== null && typeof value.grp !== "string") ||
    !finiteNonNegative(value.request_count) ||
    !Number.isFinite(value.accessed_at) ||
    !Number.isFinite(value.created_at) ||
    !Number.isSafeInteger(value.user_id)
  )
    return invalidPmApiResponse(endpoint)
  return {
    id: value.id as number,
    name: value.name ?? "",
    key: value.key.trim(),
    status: value.status as PmApiKeyStatus,
    enabled: value.status === PMAPI_KEY_STATUSES.Enabled,
    unlimited: value.unlimited,
    remainQuota: value.remain_quota,
    usedQuota: value.used_quota,
    expiredAt: value.expired_at as number,
    models: value.models ?? "",
    subnet: value.subnet ?? "",
    rpm: value.rpm,
    grp: value.grp ?? "",
    createdAt: value.created_at as number,
    accessedAt: value.accessed_at as number,
    requestCount: value.request_count,
    userId: value.user_id as number,
  }
}

const KEY_PAGE_SIZE = 100

interface PmApiKeyPage {
  items: PmApiKey[]
  total: number
}

/** One inventory page; the console defaults to 20 rows and accepts `size`. */
async function fetchKeyPage(
  request: ApiServiceRequest,
  page: number,
): Promise<PmApiKeyPage> {
  const endpoint = PMAPI_ENDPOINTS.Tokens
  const data = await fetchPmApiData(
    request,
    `${endpoint}?p=${page}&size=${KEY_PAGE_SIZE}`,
  )
  if (!isRecord(data) || !Array.isArray(data.items))
    return invalidPmApiResponse(endpoint)
  const total = data.total
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0)
    return invalidPmApiResponse(endpoint)
  return { items: data.items.map(parseKey), total }
}

/** One inventory read across every page. */
export async function fetchPmApiKeys(
  request: ApiServiceRequest,
): Promise<PmApiKey[]> {
  await fetchPmApiIdentity(request)
  const first = await fetchKeyPage(request, 1)
  const pages = Math.ceil(first.total / KEY_PAGE_SIZE) || 1
  if (pages <= 1) return first.items
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchKeyPage(request, i + 2)),
  )
  return [...first.items, ...rest.flatMap((page) => page.items)]
}

/** The console exposes no per-token detail route; the list is the read model. */
export async function findPmApiKey(
  request: ApiServiceRequest,
  id: string,
): Promise<PmApiKey> {
  const numericId = Number(id)
  const keys = await fetchPmApiKeys(request)
  const found = keys.find((key) => key.id === numericId)
  if (!found) return invalidPmApiResponse(`${PMAPI_ENDPOINTS.Tokens}/${id}`)
  return found
}

/** Writable body shared by the create and edit forms. */
function keyInputBody(input: PmApiKeyInput): Record<string, unknown> {
  return {
    name: input.name,
    unlimited: input.unlimited,
    remain_quota: input.unlimited ? 0 : input.remainQuota,
    expired_at: input.expiredAt,
    models: input.models,
    subnet: input.subnet,
    rpm: input.rpm,
    grp: input.grp,
  }
}

/**
 * The console's create form sends the shared fields plus `count`; the response
 * returns the plaintext keys only, so the created record is read back from the
 * authoritative list by its secret.
 */
export async function createPmApiKey(
  request: ApiServiceRequest,
  input: PmApiKeyInput,
): Promise<{ secret: string; item: PmApiKey }> {
  await fetchPmApiIdentity(request)
  const created = await fetchPmApiData(request, PMAPI_ENDPOINTS.Tokens, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...keyInputBody(input), count: 1 }),
  })
  if (
    !isRecord(created) ||
    !Array.isArray(created.keys) ||
    typeof created.keys[0] !== "string" ||
    !created.keys[0].trim()
  )
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Tokens)
  const secret = created.keys[0].trim()
  const item = (await fetchPmApiKeys(request)).find((key) => key.key === secret)
  if (!item) return invalidPmApiResponse(PMAPI_ENDPOINTS.Tokens)
  return { secret, item }
}

/**
 * The console ignores the update response and reloads the list, so the saved
 * record is read back from the same authoritative list.
 */
export async function updatePmApiKey(
  request: ApiServiceRequest,
  id: string,
  input: PmApiKeyInput,
): Promise<PmApiKey> {
  const path = keyPath(id)
  await fetchPmApiIdentity(request)
  await fetchPmApiData(request, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(keyInputBody(input)),
  })
  return findPmApiKey(request, id)
}

/** Rotates the secret; the old key stops working immediately. */
export async function regeneratePmApiKey(
  request: ApiServiceRequest,
  id: string,
): Promise<string> {
  const path = keyPath(id)
  await fetchPmApiIdentity(request)
  const secret = await fetchPmApiData(request, `${path}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  if (typeof secret !== "string" || !secret.trim())
    return invalidPmApiResponse(`${path}/regenerate`)
  return secret.trim()
}

/**
 * Lifecycle toggle using the console's own minimal `{status}` partial write;
 * other fields keep their server values.
 */
export async function setPmApiKeyStatus(
  request: ApiServiceRequest,
  id: string,
  status:
    | typeof PMAPI_KEY_STATUSES.Enabled
    | typeof PMAPI_KEY_STATUSES.Disabled,
): Promise<PmApiKey> {
  const path = keyPath(id)
  await fetchPmApiIdentity(request)
  await fetchPmApiData(request, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  return findPmApiKey(request, id)
}

/** Permanently removes the token record. */
export async function deletePmApiKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  await fetchPmApiIdentity(request)
  await fetchPmApiData(request, keyPath(id), { method: "DELETE" })
}

/**
 * Group metadata published by `/api/pricing` (name, description, ratio). The
 * token form's own `/api/token-groups` route answers bare names, so the
 * console's pricing page is the only source for the labels it renders.
 */
export async function fetchPmApiGroupCatalog(
  request: ApiServiceRequest,
): Promise<PmApiTokenGroup[]> {
  const data = await fetchPmApiData(request, PMAPI_ENDPOINTS.Pricing)
  if (!isRecord(data) || !Array.isArray(data.groups))
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Pricing)
  return data.groups.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      typeof value.ratio !== "number" ||
      !Number.isFinite(value.ratio)
    )
      return invalidPmApiResponse(PMAPI_ENDPOINTS.Pricing)
    return {
      name: value.name.trim(),
      ratio: value.ratio,
      ...(typeof value.desc === "string" && value.desc.trim()
        ? { description: value.desc.trim() }
        : {}),
    }
  })
}

/** One selectable token group, as published by the console. */
export type PmApiTokenGroup = {
  name: string
  /** Billing/routing multiplier shown by the console (e.g. ×0 free groups). */
  ratio: number
  /** Console-authored description; absent rows keep the bare name. */
  description?: string
}

/**
 * Selectable token groups for the editor and group-ratio evidence; the
 * catalogue's `/api/pricing` groups carry the same names with descriptions,
 * and the console's own form offers these bare names, so plain strings stay
 * accepted for older deployments.
 */
export async function fetchPmApiTokenGroups(
  request: ApiServiceRequest,
): Promise<PmApiTokenGroup[]> {
  await fetchPmApiIdentity(request)
  const groups = await fetchPmApiData(request, PMAPI_ENDPOINTS.TokenGroups)
  if (!Array.isArray(groups))
    return invalidPmApiResponse(PMAPI_ENDPOINTS.TokenGroups)
  return groups.map((value) => {
    if (typeof value === "string" && value.trim())
      return { name: value.trim(), ratio: 1 }
    if (
      isRecord(value) &&
      typeof value.name === "string" &&
      value.name.trim() &&
      typeof value.ratio === "number" &&
      Number.isFinite(value.ratio) &&
      value.ratio >= 0
    )
      return {
        name: value.name.trim(),
        ratio: value.ratio,
        ...(typeof value.description === "string" && value.description.trim()
          ? { description: value.description.trim() }
          : {}),
      }
    return invalidPmApiResponse(PMAPI_ENDPOINTS.TokenGroups)
  })
}
