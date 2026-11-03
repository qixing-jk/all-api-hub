import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  NANOGPT_KEY_POLICIES,
  NANOGPT_KEY_STATUSES,
  NANOGPT_MANAGEMENT_TOKEN_PREFIX,
} from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import { fetchNanoGptManagementData } from "~/services/apiService/nanogpt/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/** Writable fields from Management OpenAPI 2026-09-09-beta; null means unlimited. */
export const NANOGPT_KEY_LIMIT_FIELDS = [
  "daily_rpd_limit",
  "daily_input_token_limit",
  "daily_usd_limit",
  "weekly_usd_limit",
  "monthly_usd_limit",
  "weekly_request_limit",
  "monthly_request_limit",
  "weekly_input_token_limit",
  "monthly_input_token_limit",
  "daily_subscription_input_token_limit",
  "weekly_subscription_input_token_limit",
  "monthly_subscription_input_token_limit",
] as const
export type NanoGptLimitField = (typeof NANOGPT_KEY_LIMIT_FIELDS)[number]
export type NanoGptKeyWrite = {
  name: string
  expires_at: string | null
  zdr_policy: (typeof NANOGPT_KEY_POLICIES)[keyof typeof NANOGPT_KEY_POLICIES]
} & Record<NanoGptLimitField, number | null>
export type NanoGptKey = NanoGptKeyWrite & {
  id: string
  object: string
  status: (typeof NANOGPT_KEY_STATUSES)[keyof typeof NANOGPT_KEY_STATUSES]
  created_at: string
}

const invalid = () =>
  new ApiError(
    "Invalid NanoGPT management response",
    undefined,
    undefined,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
/** Projects strict native metadata without retaining returned plaintext. */
function parseNanoGptKey(value: unknown): NanoGptKey {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^[1-9]\d*$/.test(value.id) ||
    typeof value.name !== "string" ||
    typeof value.object !== "string" ||
    !(Object.values(NANOGPT_KEY_STATUSES) as readonly string[]).includes(
      String(value.status),
    ) ||
    typeof value.created_at !== "string" ||
    (value.expires_at !== null && typeof value.expires_at !== "string") ||
    !(Object.values(NANOGPT_KEY_POLICIES) as readonly string[]).includes(
      String(value.zdr_policy),
    )
  )
    throw invalid()
  const key = {
    id: value.id,
    object: value.object,
    name: value.name,
    status: value.status,
    created_at: value.created_at,
    expires_at: value.expires_at,
    zdr_policy: value.zdr_policy,
  } as NanoGptKey
  for (const field of NANOGPT_KEY_LIMIT_FIELDS) {
    const limit = value[field]
    if (
      limit !== null &&
      (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0)
    )
      throw invalid()
    key[field] = limit as number | null
  }
  return key // Ignore any accidental secret in inventory/detail responses.
}

/** Rejects missing management credentials before dispatch. */
function requireNanoGptManagementToken(request: ApiServiceRequest): void {
  if (!parseNanoGptCredentials(request.auth.accessToken).managementToken)
    throw new ApiError(
      "NanoGPT management token required",
      undefined,
      undefined,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
}
/** Reads the non-paginated native key inventory. */
export async function fetchNanoGptKeys(
  request: ApiServiceRequest,
): Promise<NanoGptKey[]> {
  requireNanoGptManagementToken(request)
  const body = await fetchNanoGptManagementData<unknown>(request, "/api-keys")
  if (!isRecord(body) || !Array.isArray(body.data)) throw invalid()
  return body.data.map(parseNanoGptKey)
}

const keyPath = (id: string) => {
  if (!/^[1-9]\d*$/.test(id)) throw invalid()
  return `/api-keys/${id}`
}
/** Reads one numeric resource identity and rejects mismatched responses. */
export async function fetchNanoGptKey(
  request: ApiServiceRequest,
  id: string,
): Promise<NanoGptKey> {
  requireNanoGptManagementToken(request)
  const key = parseNanoGptKey(
    await fetchNanoGptManagementData(request, keyPath(id)),
  )
  if (key.id !== id) throw invalid()
  return key
}
/** Dispatches one idempotent creation and retains its one-time inference secret. */
export async function createNanoGptKey(
  request: ApiServiceRequest,
  body: Partial<NanoGptKeyWrite>,
) {
  requireNanoGptManagementToken(request)
  const result = await fetchNanoGptManagementData<unknown>(
    request,
    "/api-keys",
    { method: "POST", body, idempotencyKey: crypto.randomUUID() },
  )
  request.observer?.onMutationAccepted?.()
  const key = parseNanoGptKey(result)
  if (
    !isRecord(result) ||
    typeof result.key !== "string" ||
    !hasUsableApiTokenKey(result.key) ||
    result.key.trim().startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX)
  )
    throw invalid()
  return { key, secret: result.key.trim() }
}
/** Applies only the supplied patch and verifies the response identity. */
export async function updateNanoGptKey(
  request: ApiServiceRequest,
  id: string,
  body: Partial<NanoGptKeyWrite>,
): Promise<NanoGptKey> {
  requireNanoGptManagementToken(request)
  const result = await fetchNanoGptManagementData(request, keyPath(id), {
    method: "PATCH",
    body,
  })
  request.observer?.onMutationAccepted?.()
  const key = parseNanoGptKey(result)
  if (key.id !== id) throw invalid()
  return key
}
/** Revokes one key; only a successful 204 response confirms the write. */
export async function deleteNanoGptKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  requireNanoGptManagementToken(request)
  await fetchNanoGptManagementData(request, keyPath(id), { method: "DELETE" })
  request.observer?.onMutationAccepted?.()
}
