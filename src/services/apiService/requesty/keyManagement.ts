import type { RequestyManageRequest } from "~/services/apiService/requesty"
import {
  REQUESTY_ENDPOINTS,
  REQUESTY_KEY_PERMISSIONS,
  REQUESTY_RESPONSE_ERRORS,
} from "~/services/apiService/requesty/constants"
import { readDecimal, readString } from "~/services/apiService/requesty/parsing"
import {
  fetchRequestyManageData,
  readRequestyRecord,
} from "~/services/apiService/requesty/transport"
import { isRecord } from "~/utils/core/object"

/** One native API key record from the management API (list and detail share the shape). */
export interface RequestyApiKey {
  id: string
  name: string
  /** Monthly spend cap in USD; 0 means unlimited. */
  monthlyLimit: number
  /** Amount spent this month in USD. */
  monthlySpend: number
  /** RFC 3339 timestamp; undefined means the key never expires. */
  expiresAt?: string
  permissions: { manage: string; completions: string }
  labels: Record<string, string>
  createdAt: string
}

const parsePermissions = (
  value: unknown,
): { manage: string; completions: string } => {
  if (!isRecord(value))
    return {
      manage: REQUESTY_KEY_PERMISSIONS.None,
      completions: REQUESTY_KEY_PERMISSIONS.None,
    }
  return {
    manage: readString(value.manage) ?? REQUESTY_KEY_PERMISSIONS.None,
    completions: readString(value.completions) ?? REQUESTY_KEY_PERMISSIONS.None,
  }
}

const parseApiKey = (body: unknown): RequestyApiKey | undefined => {
  if (!isRecord(body)) return undefined
  const id = readString(body.id)
  const name = readString(body.name)
  const monthlyLimit = readDecimal(body.monthly_limit)
  const monthlySpend = readDecimal(body.monthly_spend)
  const createdAt = readString(body.created_at)
  if (
    id === undefined ||
    name === undefined ||
    monthlyLimit === undefined ||
    monthlySpend === undefined ||
    createdAt === undefined
  ) {
    return undefined
  }
  const expiresAt = readString(body.expires_at)
  const labels = isRecord(body.labels)
    ? Object.fromEntries(
        Object.entries(body.labels).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {}
  return {
    id,
    name,
    monthlyLimit,
    monthlySpend,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    permissions: parsePermissions(body.permissions),
    labels,
    createdAt,
  }
}

const parseApiKeyList = (body: unknown): RequestyApiKey[] => {
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.KeyList)
  }
  return body.keys.map((item) => {
    const key = parseApiKey(item)
    if (!key) throw new Error(REQUESTY_RESPONSE_ERRORS.Key)
    return key
  })
}

/**
 * Lists the organization's API keys. Requires a key with manage read
 * permission; ordinary keys can only use the self detail route.
 */
export async function fetchRequestyApiKeys(
  request: RequestyManageRequest,
): Promise<RequestyApiKey[]> {
  const body = await fetchRequestyManageData<unknown>(
    request,
    REQUESTY_ENDPOINTS.apiKeys,
  )
  return parseApiKeyList(body)
}

/**
 * Fetches one key by UUID. Requesty resolves the literal `self` to the
 * calling key.
 */
export async function fetchRequestyApiKey(
  request: RequestyManageRequest,
  id: string,
): Promise<RequestyApiKey> {
  const body = readRequestyRecord(
    await fetchRequestyManageData<unknown>(
      request,
      REQUESTY_ENDPOINTS.apiKey(id),
    ),
    REQUESTY_ENDPOINTS.apiKey(id),
  )
  const parsed = parseApiKey(body)
  if (!parsed) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.Key)
  }
  return parsed
}

export type RequestyCreateKeyInput = {
  name: string
  /** Monthly spend cap in USD; 0 or undefined means unlimited. */
  monthlyLimit?: number
  /** Whether the key may call management endpoints (write). */
  managePermission?: boolean
}

/** A write was acknowledged, but its resulting key could not be read back. */
export class RequestyMutationReadbackError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "requesty_readback_failed", {
      cause,
    })
    this.name = "RequestyMutationReadbackError"
  }
}

const readUpdatedKey = async (request: RequestyManageRequest, id: string) => {
  try {
    return await fetchRequestyApiKey(request, id)
  } catch (error) {
    throw new RequestyMutationReadbackError(error)
  }
}

/** Creates a key and returns its one-time plaintext secret. */
export async function createRequestyApiKey(
  request: RequestyManageRequest,
  input: RequestyCreateKeyInput,
): Promise<{ key: RequestyApiKey; plaintextKey: string }> {
  const body = {
    name: input.name,
    ...(input.monthlyLimit !== undefined && input.monthlyLimit > 0
      ? { monthly_limit: input.monthlyLimit }
      : {}),
    permissions: {
      manage: input.managePermission
        ? REQUESTY_KEY_PERMISSIONS.Write
        : REQUESTY_KEY_PERMISSIONS.None,
      completions: REQUESTY_KEY_PERMISSIONS.Write,
    },
  }
  const response = readRequestyRecord(
    await fetchRequestyManageData<unknown>(
      request,
      REQUESTY_ENDPOINTS.apiKeys,
      {
        method: "POST",
        body,
      },
    ),
    REQUESTY_ENDPOINTS.apiKeys,
  )
  const api_key_id = readString(response.api_key_id)
  const plaintextKey = readString(response.api_key)
  if (api_key_id === undefined || plaintextKey === undefined) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.CreatedKey)
  }
  return {
    key: {
      id: api_key_id,
      name: input.name,
      monthlyLimit: input.monthlyLimit ?? 0,
      monthlySpend: 0,
      permissions: {
        manage: input.managePermission
          ? REQUESTY_KEY_PERMISSIONS.Write
          : REQUESTY_KEY_PERMISSIONS.None,
        completions: REQUESTY_KEY_PERMISSIONS.Write,
      },
      labels: {},
      createdAt: new Date().toISOString(),
    },
    plaintextKey,
  }
}

/** Updates a key's monthly spend cap. Returns once the readback confirms it. */
export async function updateRequestyApiKeyLimit(
  request: RequestyManageRequest,
  id: string,
  monthlyLimit: number,
): Promise<RequestyApiKey> {
  await fetchRequestyManageData(request, REQUESTY_ENDPOINTS.apiKeyLimit(id), {
    method: "POST",
    body: { monthly_limit: monthlyLimit },
    emptyBody: true,
  })
  return await readUpdatedKey(request, id)
}

/**
 * Sets or clears a key's expiry. An undefined `expiresAt` removes the expiry,
 * making the key non-expiring.
 */
export async function updateRequestyApiKeyExpiry(
  request: RequestyManageRequest,
  id: string,
  expiresAt: string | undefined,
): Promise<RequestyApiKey> {
  await fetchRequestyManageData(request, REQUESTY_ENDPOINTS.apiKeyExpiry(id), {
    method: "POST",
    emptyBody: true,
    ...(expiresAt === undefined
      ? { body: { expires_at: null } }
      : { body: { expires_at: expiresAt } }),
  })
  return await readUpdatedKey(request, id)
}

/** Deletes a key. The console shows no name editing; this is the full lifecycle. */
export async function deleteRequestyApiKey(
  request: RequestyManageRequest,
  id: string,
): Promise<void> {
  await fetchRequestyManageData(request, REQUESTY_ENDPOINTS.apiKey(id), {
    method: "DELETE",
    emptyBody: true,
  })
}
