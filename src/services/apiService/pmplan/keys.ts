import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS, PMPLAN_KEY_STATUSES } from "./constants"
import { fetchPmplan } from "./index"

export type PmplanKeyInput = { expires_at: string | null; models: string[] }
export type PmplanKeyModelInput = Pick<PmplanKeyInput, "models">
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
const optionalTimestamp = (value: unknown) =>
  value === null || value === undefined || timestamp(value)
/** Creation is the only observed source of plaintext; inventory prefixes are not runtime secrets. */
export async function createPmplanKey(
  request: ApiServiceRequest,
  input: PmplanKeyInput,
) {
  const result = await fetchPmplan(request, PMPLAN_ENDPOINTS.Keys, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (
    !isRecord(result) ||
    !positiveId(result.id) ||
    typeof result.key !== "string" ||
    !result.key.startsWith("sk-pm-")
  )
    throw new ApiError(
      "Invalid PM-Plan key creation response",
      undefined,
      PMPLAN_ENDPOINTS.Keys,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return { id: result.id, key: result.key }
}

export interface PmplanKey {
  id: number
  key_prefix: string
  status: string
  all_models: boolean
  models: string[]
  expires_at: string | null
  created_at?: string | null
  last_used_at?: string | null
  revoked_at?: string | null
}

/** Validates inventory facts while retaining unknown statuses and nullable timestamps. */
function isPmplanKey(key: unknown): key is PmplanKey {
  return (
    isRecord(key) &&
    positiveId(key.id) &&
    typeof key.key_prefix === "string" &&
    typeof key.status === "string" &&
    typeof key.all_models === "boolean" &&
    Array.isArray(key.models) &&
    key.models.every((model) => typeof model === "string") &&
    (key.expires_at === null || timestamp(key.expires_at)) &&
    optionalTimestamp(key.created_at) &&
    optionalTimestamp(key.last_used_at) &&
    optionalTimestamp(key.revoked_at)
  )
}

/** Native revoked records remain visible and are never promoted into usable keys. */
export async function fetchPmplanKeys(
  request: ApiServiceRequest,
): Promise<PmplanKey[]> {
  const result = await fetchPmplan(request, PMPLAN_ENDPOINTS.Keys)
  if (
    !isRecord(result) ||
    !Array.isArray(result.keys) ||
    !result.keys.every(isPmplanKey) ||
    new Set(result.keys.map((key) => key.id)).size !== result.keys.length
  )
    throw new ApiError(
      "Invalid PM-Plan key inventory",
      undefined,
      PMPLAN_ENDPOINTS.Keys,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return result.keys
}

/** This native route changes only model restrictions; expiry and plaintext stay untouched. */
export async function updatePmplanKeyModels(
  request: ApiServiceRequest,
  id: number,
  input: PmplanKeyModelInput,
): Promise<PmplanKey> {
  if (!positiveId(id))
    throw new ApiError(
      "Invalid PM-Plan key id",
      undefined,
      undefined,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  const result = await fetchPmplan(
    request,
    `${PMPLAN_ENDPOINTS.Keys}/${id}/models`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: input.models }),
    },
  )
  if (!isRecord(result) || result.ok !== true)
    throw new ApiError(
      "Invalid PM-Plan model update response",
      undefined,
      undefined,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  request.observer?.onMutationAccepted?.()
  const key = (await fetchPmplanKeys(request)).find((item) => item.id === id)
  if (
    !key ||
    key.all_models !== (input.models.length === 0) ||
    JSON.stringify([...key.models].sort()) !==
      JSON.stringify([...new Set(input.models)].sort())
  )
    throw new ApiError(
      "PM-Plan model update unconfirmed",
      undefined,
      PMPLAN_ENDPOINTS.Keys,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return key
}

/** Revoke is irreversible; only inventory readback proves the credential is no longer active. */
export async function revokePmplanKey(
  request: ApiServiceRequest,
  id: number,
): Promise<PmplanKey> {
  if (!positiveId(id))
    throw new ApiError(
      "Invalid PM-Plan key id",
      undefined,
      undefined,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  await fetchPmplan(request, `${PMPLAN_ENDPOINTS.Keys}/${id}`, {
    method: "DELETE",
  })
  request.observer?.onMutationAccepted?.()
  const key = (await fetchPmplanKeys(request)).find((key) => key.id === id)
  if (!key || key.status !== PMPLAN_KEY_STATUSES.Revoked)
    throw new ApiError(
      "PM-Plan revocation unconfirmed",
      undefined,
      PMPLAN_ENDPOINTS.Keys,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return key
}
