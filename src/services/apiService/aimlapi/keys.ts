import {
  AIMLAPI_ENDPOINTS,
  AIMLAPI_KEY_LIMIT_RETENTIONS,
  AIMLAPI_KEY_SCOPES,
  type AimlApiKeyLimitRetention,
  type AimlApiKeyScope,
} from "~/services/apiService/aimlapi/constants"
import {
  fetchAimlApiJson,
  invalidAimlApiResponse,
} from "~/services/apiService/aimlapi/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/** Number of leading characters the dashboard shows and the routes address. */
export const AIMLAPI_KEY_PREFIX = 8

export type AimlApiKeyLimit = {
  /** `null` means the limit never resets (created with `retention: "never"`). */
  retention: AimlApiKeyLimitRetention | null
  thresholdUsd: number
  /** Absent counters remain unknown; the limit configuration does not prove spend. */
  spentUsd?: number
  remainingUsd?: number
  windowStart: string | null
}

export type AimlApiKey = {
  prefix: string
  name: string | null
  disabled: boolean
  scopes: readonly AimlApiKeyScope[] | null
  limit: AimlApiKeyLimit | null
  expiresAt: string | null
  allowedModels: readonly string[] | null
  allowedTools?: readonly string[] | null
  createdAt: string
  updatedAt: string
  /** Whole-key lifetime spend in USD. */
  totalUsageUsd: number
  monthlyUsageUsd: number
}

/** A created key also carries its one-time plaintext secret. */
export type AimlApiCreatedKey = AimlApiKey & { key: string }

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const optionalStringOrNull = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === "string" ? value : undefined

const finiteNonNegative = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

const parseScopes = (
  value: unknown,
  endpoint: string,
): readonly AimlApiKeyScope[] | null => {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) invalidAimlApiResponse(endpoint)
  const known = new Set<string>(AIMLAPI_KEY_SCOPES)
  return value.map((item) => {
    if (typeof item !== "string" || !known.has(item))
      invalidAimlApiResponse(endpoint)
    return item as AimlApiKeyScope
  })
}

const parseStringList = (
  value: unknown,
  endpoint: string,
): readonly string[] | null => {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) invalidAimlApiResponse(endpoint)
  return value.map((item) => {
    if (typeof item !== "string") invalidAimlApiResponse(endpoint)
    return item
  })
}

const parseLimit = (
  value: unknown,
  endpoint: string,
): AimlApiKeyLimit | null => {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) invalidAimlApiResponse(endpoint)
  const threshold = finiteNonNegative(value.threshold)
  if (threshold === undefined) invalidAimlApiResponse(endpoint)
  const retention =
    value.retention === null || value.retention === undefined
      ? null
      : AIMLAPI_KEY_LIMIT_RETENTIONS.includes(
            value.retention as AimlApiKeyLimitRetention,
          )
        ? (value.retention as AimlApiKeyLimitRetention)
        : invalidAimlApiResponse(endpoint)
  const spent = finiteNonNegative(value.spent_usd)
  const remaining = finiteNonNegative(value.remaining_usd)
  const windowStart = optionalStringOrNull(value.window_start)
  if (windowStart === undefined) invalidAimlApiResponse(endpoint)
  return {
    retention,
    thresholdUsd: threshold,
    ...(spent === undefined ? {} : { spentUsd: spent }),
    ...(remaining === undefined ? {} : { remainingUsd: remaining }),
    windowStart,
  }
}

/** Parses one key record; the create response adds `key`. */
function parseAimlApiKey(value: unknown, endpoint: string): AimlApiCreatedKey {
  if (!isRecord(value)) invalidAimlApiResponse(endpoint)
  const prefix = optionalString(value.prefix)?.trim()
  if (!prefix || prefix.length !== AIMLAPI_KEY_PREFIX)
    invalidAimlApiResponse(endpoint)
  const createdAt = optionalString(value.created_at)
  const updatedAt = optionalString(value.updated_at)
  if (!createdAt || !updatedAt) invalidAimlApiResponse(endpoint)
  if (typeof value.disabled !== "boolean") invalidAimlApiResponse(endpoint)

  const totalUsageUsd = finiteNonNegative(value.total_usage_usd)
  const monthlyUsageUsd = finiteNonNegative(value.monthly_usage_usd)
  if (totalUsageUsd === undefined || monthlyUsageUsd === undefined)
    invalidAimlApiResponse(endpoint)

  const expiresAt = optionalStringOrNull(value.expires_at)
  if (expiresAt === undefined) invalidAimlApiResponse(endpoint)

  return {
    prefix,
    name: value.name === null ? null : optionalString(value.name) ?? null,
    disabled: value.disabled,
    scopes: parseScopes(value.scopes, endpoint),
    limit: parseLimit(value.limit, endpoint),
    expiresAt,
    allowedModels: parseStringList(value.allowed_models, endpoint),
    allowedTools: parseStringList(value.allowed_tools, endpoint),
    createdAt,
    updatedAt,
    totalUsageUsd,
    monthlyUsageUsd,
    key: typeof value.key === "string" ? value.key : "",
  }
}

const readData = (body: unknown, endpoint: string): unknown => {
  if (!isRecord(body) || !("data" in body)) invalidAimlApiResponse(endpoint)
  return body.data
}

/** `GET /v1/keys` — every key the management key owns, oldest first. */
export async function fetchAimlApiKeys(
  request: ApiServiceRequest,
): Promise<AimlApiKey[]> {
  const endpoint = AIMLAPI_ENDPOINTS.Keys
  const body = await fetchAimlApiJson<unknown>(request, endpoint)
  const data = readData(body, endpoint)
  if (!Array.isArray(data)) invalidAimlApiResponse(endpoint)
  return data.map((item) => parseAimlApiKey(item, endpoint))
}

/** `GET /v1/keys/{prefix}` — one key's current settings. */
export async function fetchAimlApiKey(
  request: ApiServiceRequest,
  prefix: string,
): Promise<AimlApiKey> {
  const endpoint = `${AIMLAPI_ENDPOINTS.Keys}/${encodeURIComponent(prefix)}`
  const body = await fetchAimlApiJson<unknown>(request, endpoint)
  return parseAimlApiKey(readData(body, endpoint), endpoint)
}

/**
 * `GET /v1/key` — parameters of the most recently used key.
 *
 * This is the only credential probe that works for both key classes, so it is
 * what onboarding uses to prove a pasted credential before saving it.
 */
export async function fetchAimlApiLatestKey(
  request: ApiServiceRequest,
): Promise<AimlApiKey> {
  const endpoint = AIMLAPI_ENDPOINTS.LatestKey
  const body = await fetchAimlApiJson<unknown>(request, endpoint)
  return parseAimlApiKey(readData(body, endpoint), endpoint)
}

export type AimlApiKeyLimitInput = {
  retention: AimlApiKeyLimitRetention
  thresholdUsd: number
}

export type AimlApiCreateKeyInput = {
  name: string
  limit?: AimlApiKeyLimitInput | null
  scopes?: readonly AimlApiKeyScope[] | null
  expiresAt?: string | null
  allowedModels?: readonly string[] | null
  allowedTools?: readonly string[] | null
}

export type AimlApiUpdateKeyInput = {
  name?: string
  disabled?: boolean
  /** `null` clears the spending limit. */
  limit?: AimlApiKeyLimitInput | null
  scopes?: readonly AimlApiKeyScope[] | null
  allowedModels?: readonly string[] | null
  allowedTools?: readonly string[] | null
}

const toWireLimit = (limit: AimlApiKeyLimitInput | null | undefined) =>
  limit === undefined
    ? undefined
    : limit === null
      ? null
      : { retention: limit.retention, threshold: limit.thresholdUsd }

type AimlApiKeyCommonMutationInput = {
  limit?: AimlApiKeyLimitInput | null
  allowedModels?: readonly string[] | null
  allowedTools?: readonly string[] | null
}

/** Shared wire fields; create and update intentionally handle their other fields separately. */
const toWireCommonMutationFields = (input: AimlApiKeyCommonMutationInput) => ({
  ...(input.allowedTools !== undefined
    ? { allowed_tools: input.allowedTools }
    : {}),
  ...(input.limit !== undefined ? { limit: toWireLimit(input.limit) } : {}),
  ...(input.allowedModels !== undefined
    ? { allowed_models: input.allowedModels }
    : {}),
})

/** `POST /v1/keys` — returns the one-time plaintext secret. */
export async function createAimlApiKey(
  request: ApiServiceRequest,
  input: AimlApiCreateKeyInput,
): Promise<AimlApiCreatedKey> {
  const endpoint = AIMLAPI_ENDPOINTS.Keys
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    method: "POST",
    body: {
      name: input.name,
      ...toWireCommonMutationFields(input),
      // The create route validates `scopes` as an array and answers
      // `400 Body validation error!` for an explicit `null`, while every other
      // field accepts `null`. Omit it instead: absent and null read back alike.
      ...(input.scopes ? { scopes: input.scopes } : {}),
      ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
    },
  })
  const created = parseAimlApiKey(readData(body, endpoint), endpoint)
  if (!created.key.trim()) invalidAimlApiResponse(endpoint)
  return created
}

/**
 * `PATCH /v1/keys/{prefix}`.
 *
 * Only the fields the deployment accepts are sent. `expires_at` is deliberately
 * absent: the route ignores it and answers `400 No changes provided.` when it is
 * the only field, so an edited key keeps its original expiry.
 */
export async function updateAimlApiKey(
  request: ApiServiceRequest,
  prefix: string,
  input: AimlApiUpdateKeyInput,
): Promise<AimlApiKey> {
  const endpoint = `${AIMLAPI_ENDPOINTS.Keys}/${encodeURIComponent(prefix)}`
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    method: "PATCH",
    body: {
      ...toWireCommonMutationFields(input),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
    },
  })
  return parseAimlApiKey(readData(body, endpoint), endpoint)
}

/** `DELETE /v1/keys/{prefix}` — the record is removed, not merely disabled. */
export async function deleteAimlApiKey(
  request: ApiServiceRequest,
  prefix: string,
): Promise<void> {
  const endpoint = `${AIMLAPI_ENDPOINTS.Keys}/${encodeURIComponent(prefix)}`
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    method: "DELETE",
  })
  const data = readData(body, endpoint)
  if (!isRecord(data) || data.deleted !== true) invalidAimlApiResponse(endpoint)
}
