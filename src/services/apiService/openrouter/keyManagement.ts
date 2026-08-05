import { z } from "zod"

import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { t } from "~/utils/i18n/core"

import {
  OPENROUTER_KEYS_ENDPOINT,
  OPENROUTER_WORKSPACES_ENDPOINT,
} from "./constants"
import { OpenRouterManagementKeyRequiredError } from "./errors"
import {
  openRouterCreateKeyInputSchema,
  openRouterCreateKeyResponseSchema,
  openRouterDeleteKeyResponseSchema,
  openRouterKeyListInputSchema,
  openRouterKeyListResponseSchema,
  openRouterKeyResponseSchema,
  openRouterUpdateKeyInputSchema,
  openRouterWorkspaceListResponseSchema,
  openRouterWorkspaceMemberListResponseSchema,
  openRouterWorkspaceMemberPaginationInputSchema,
  openRouterWorkspacePaginationInputSchema,
  openRouterWorkspaceResponseSchema,
  type OpenRouterCreateKeyInput,
  type OpenRouterKeyInfo,
  type OpenRouterKeyListInput,
  type OpenRouterPaginatedResult,
  type OpenRouterUpdateKeyInput,
  type OpenRouterWorkspace,
  type OpenRouterWorkspaceMember,
  type OpenRouterWorkspaceMemberPaginationInput,
  type OpenRouterWorkspacePaginationInput,
} from "./keyManagementSchemas"
import { createOpenRouterManagementRequest } from "./request"

const managementFetchOptions = {
  currentTabTransport: "disabled" as const,
  tempWindowFallback: { statusCodes: [], codes: [] },
}

type RawResponse = unknown

const KEY_RESOURCE_ENDPOINT_TEMPLATE = `${OPENROUTER_KEYS_ENDPOINT}/{hash}`
const WORKSPACE_MEMBER_ENDPOINT_TEMPLATE = `${OPENROUTER_WORKSPACES_ENDPOINT}/{id}/members`
const REDACTED_PROVIDER_VALUE = "[REDACTED]"

interface ProviderFailureContext {
  safeEndpoint: string
  sensitiveValues?: Array<string | null | undefined>
}

const redactProviderValues = (message: string, values: string[]): string =>
  values.reduce((sanitized, value) => {
    const variants = new Set([value, encodeURIComponent(value)])
    return [...variants].reduce(
      (current, variant) =>
        variant
          ? current.split(variant).join(REDACTED_PROVIDER_VALUE)
          : current,
      sanitized,
    )
  }, message)

const getBoundedUpstreamCode = (
  value: string | undefined,
  sensitiveValues: string[],
): string | undefined => {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_.-]+$/.test(value)) {
    return undefined
  }
  return redactProviderValues(value, sensitiveValues) === value
    ? value
    : undefined
}

const getProviderErrorDetails = (
  body: unknown,
): { message: string; upstreamCode?: string } | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== "object" || Array.isArray(error)) return null

  const messageValue = (error as { message?: unknown }).message
  const message =
    typeof messageValue === "string" ? messageValue.trim() : undefined
  if (!message) return null

  const codeValue = (error as { code?: unknown }).code
  const upstreamCode =
    typeof codeValue === "string" || typeof codeValue === "number"
      ? getBoundedUpstreamCode(String(codeValue).trim(), [])
      : undefined
  return { message, upstreamCode }
}

const getHttpErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

const normalizeProviderFailure = (
  error: unknown,
  request: ApiServiceRequest,
  context: ProviderFailureContext,
): Error => {
  const sensitiveValues = [
    request.auth.accessToken?.trim(),
    ...(context.sensitiveValues ?? []).map((value) => value?.trim()),
  ].filter((value): value is string => Boolean(value))
  const message =
    error instanceof Error
      ? redactProviderValues(error.message, sensitiveValues)
      : t("messages:errors.api.invalidResponseFormat")

  if (error instanceof OpenRouterManagementKeyRequiredError) return error
  if (error instanceof ApiError) {
    return new ApiError(
      message,
      error.statusCode,
      context.safeEndpoint,
      error.code,
      getBoundedUpstreamCode(error.upstreamCode, sensitiveValues),
    )
  }
  if (error instanceof TypeError) return new TypeError(message)

  const normalized = new Error(message)
  if (error instanceof Error) normalized.name = error.name
  return normalized
}

const invalidResponse = (endpoint: string): ApiError =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/**
 * Validates an unwrapped Management API response without exposing schema details.
 */
function parseResponse<T>(
  schema: z.ZodType<T>,
  body: unknown,
  endpoint: string,
): T {
  const result = schema.safeParse(body)
  if (!result.success) throw invalidResponse(endpoint)
  return result.data
}

/**
 * Adds validated offset pagination to a Management API URL.
 */
function appendPagination(
  params: URLSearchParams,
  input: OpenRouterWorkspacePaginationInput | undefined,
): void {
  const parsed = openRouterWorkspacePaginationInputSchema.safeParse(input ?? {})
  if (!parsed.success) throw invalidResponse(OPENROUTER_WORKSPACES_ENDPOINT)
  if (parsed.data.offset !== undefined)
    params.set("offset", String(parsed.data.offset))
  if (parsed.data.limit !== undefined)
    params.set("limit", String(parsed.data.limit))
}

/**
 * Encodes one non-empty opaque key hash for a path segment.
 */
function keyEndpoint(hash: string): string {
  const normalizedHash = hash.trim()
  if (!normalizedHash) throw invalidResponse(KEY_RESOURCE_ENDPOINT_TEMPLATE)
  return `${OPENROUTER_KEYS_ENDPOINT}/${encodeURIComponent(normalizedHash)}`
}

/**
 * Sends one raw Management API request; mutation callers must never replay it.
 */
async function fetchRaw(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit,
  failureContext?: ProviderFailureContext,
): Promise<RawResponse> {
  const context = failureContext ?? { safeEndpoint: endpoint }
  try {
    const response = await fetchApiResponse<RawResponse>(
      createOpenRouterManagementRequest(request),
      { endpoint, options, ...managementFetchOptions },
    )
    if (!response.ok) {
      const providerError = getProviderErrorDetails(response.body)
      throw new ApiError(
        providerError?.message ?? `请求失败: ${response.status}`,
        response.status,
        context.safeEndpoint,
        getHttpErrorCode(response.status),
        providerError?.upstreamCode,
      )
    }
    return response.body
  } catch (error) {
    throw normalizeProviderFailure(error, request, context)
  }
}

/**
 * Lists keys. OpenRouter documents these under `/api/v1/keys` for Management Keys.
 */
export async function fetchOpenRouterKeys(
  request: ApiServiceRequest,
  input: OpenRouterKeyListInput = {},
): Promise<OpenRouterKeyInfo[]> {
  const parsed = openRouterKeyListInputSchema.safeParse(input)
  if (!parsed.success) throw invalidResponse(OPENROUTER_KEYS_ENDPOINT)
  const params = new URLSearchParams()
  if (parsed.data.includeDisabled !== undefined) {
    params.set("include_disabled", String(parsed.data.includeDisabled))
  }
  if (parsed.data.offset !== undefined) {
    params.set("offset", String(parsed.data.offset))
  }
  if (parsed.data.workspaceId !== undefined) {
    params.set("workspace_id", parsed.data.workspaceId)
  }
  const endpoint = params.size
    ? `${OPENROUTER_KEYS_ENDPOINT}?${params}`
    : OPENROUTER_KEYS_ENDPOINT
  return parseResponse(
    openRouterKeyListResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      { method: "GET", cache: "no-store" },
      {
        safeEndpoint: OPENROUTER_KEYS_ENDPOINT,
        sensitiveValues: [parsed.data.workspaceId],
      },
    ),
    OPENROUTER_KEYS_ENDPOINT,
  ).data
}

/**
 * OpenRouter documents `name`, limits, expiry, workspace, creator, and BYOK-limit fields
 * for creation; its plaintext `key` is returned only by this response.
 * https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
 */
export async function createOpenRouterKey(
  request: ApiServiceRequest,
  input: OpenRouterCreateKeyInput,
): Promise<{ key: OpenRouterKeyInfo; plaintextKey: string }> {
  const parsed = openRouterCreateKeyInputSchema.safeParse(input)
  if (!parsed.success) throw invalidResponse(OPENROUTER_KEYS_ENDPOINT)
  const {
    limitReset,
    includeByokInLimit,
    expiresAt,
    workspaceId,
    creatorUserId,
    ...rest
  } = parsed.data
  const body = {
    ...rest,
    ...(limitReset !== undefined ? { limit_reset: limitReset } : {}),
    ...(includeByokInLimit !== undefined
      ? { include_byok_in_limit: includeByokInLimit }
      : {}),
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
    ...(workspaceId !== undefined ? { workspace_id: workspaceId } : {}),
    ...(creatorUserId !== undefined ? { creator_user_id: creatorUserId } : {}),
  }
  const response = parseResponse(
    openRouterCreateKeyResponseSchema,
    await fetchRaw(
      request,
      OPENROUTER_KEYS_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      {
        safeEndpoint: OPENROUTER_KEYS_ENDPOINT,
        sensitiveValues: [workspaceId, creatorUserId],
      },
    ),
    OPENROUTER_KEYS_ENDPOINT,
  )
  return { key: response.data, plaintextKey: response.key }
}

/**
 * Fetches one key by its opaque hash.
 */
export async function fetchOpenRouterKey(
  request: ApiServiceRequest,
  hash: string,
): Promise<OpenRouterKeyInfo> {
  const endpoint = keyEndpoint(hash)
  return parseResponse(
    openRouterKeyResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      { method: "GET", cache: "no-store" },
      { safeEndpoint: KEY_RESOURCE_ENDPOINT_TEMPLATE, sensitiveValues: [hash] },
    ),
    KEY_RESOURCE_ENDPOINT_TEMPLATE,
  ).data
}

/**
 * OpenRouter's key update accepts mutable name, disabled, limit, limit reset,
 * and BYOK-limit fields.
 * https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
 */
export async function updateOpenRouterKey(
  request: ApiServiceRequest,
  hash: string,
  input: OpenRouterUpdateKeyInput,
): Promise<OpenRouterKeyInfo> {
  const endpoint = keyEndpoint(hash)
  const parsed = openRouterUpdateKeyInputSchema.safeParse(input)
  if (!parsed.success) throw invalidResponse(KEY_RESOURCE_ENDPOINT_TEMPLATE)
  const { limitReset, includeByokInLimit, ...rest } = parsed.data
  const body = {
    ...rest,
    ...(limitReset !== undefined ? { limit_reset: limitReset } : {}),
    ...(includeByokInLimit !== undefined
      ? { include_byok_in_limit: includeByokInLimit }
      : {}),
  }
  return parseResponse(
    openRouterKeyResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
      { safeEndpoint: KEY_RESOURCE_ENDPOINT_TEMPLATE, sensitiveValues: [hash] },
    ),
    KEY_RESOURCE_ENDPOINT_TEMPLATE,
  ).data
}

/**
 * Deletes one key and returns OpenRouter's deletion acknowledgement.
 */
export async function deleteOpenRouterKey(
  request: ApiServiceRequest,
  hash: string,
): Promise<{ deleted: true }> {
  const endpoint = keyEndpoint(hash)
  return parseResponse(
    openRouterDeleteKeyResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      { method: "DELETE" },
      {
        safeEndpoint: KEY_RESOURCE_ENDPOINT_TEMPLATE,
        sensitiveValues: [hash],
      },
    ),
    KEY_RESOURCE_ENDPOINT_TEMPLATE,
  )
}

/**
 * OpenRouter's hosted Management API resolves its default workspace through the
 * `default` slug. Its public OpenAPI documents `/workspaces/{id}` accepting IDs or
 * slugs; if a compatible deployment does not resolve this provider-owned slug,
 * this request fails closed rather than guessing a workspace from inventory.
 * https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
 */
export async function fetchOpenRouterDefaultWorkspace(
  request: ApiServiceRequest,
): Promise<OpenRouterWorkspace> {
  const endpoint = `${OPENROUTER_WORKSPACES_ENDPOINT}/default`
  return parseResponse(
    openRouterWorkspaceResponseSchema,
    await fetchRaw(request, endpoint, { method: "GET", cache: "no-store" }),
    endpoint,
  ).data
}

/**
 * Lists workspaces using OpenRouter's offset pagination.
 */
export async function fetchOpenRouterWorkspaces(
  request: ApiServiceRequest,
  input?: OpenRouterWorkspacePaginationInput,
): Promise<OpenRouterPaginatedResult<OpenRouterWorkspace>> {
  const params = new URLSearchParams()
  appendPagination(params, input)
  const endpoint = params.size
    ? `${OPENROUTER_WORKSPACES_ENDPOINT}?${params}`
    : OPENROUTER_WORKSPACES_ENDPOINT
  const response = parseResponse(
    openRouterWorkspaceListResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      { method: "GET", cache: "no-store" },
      { safeEndpoint: OPENROUTER_WORKSPACES_ENDPOINT },
    ),
    OPENROUTER_WORKSPACES_ENDPOINT,
  )
  return { data: response.data, totalCount: response.total_count }
}

/**
 * Lists members for one workspace using OpenRouter's offset pagination.
 */
export async function fetchOpenRouterWorkspaceMembers(
  request: ApiServiceRequest,
  workspaceId: string,
  input?: OpenRouterWorkspaceMemberPaginationInput,
): Promise<OpenRouterPaginatedResult<OpenRouterWorkspaceMember>> {
  const normalizedWorkspaceId = workspaceId.trim()
  if (!normalizedWorkspaceId)
    throw invalidResponse(WORKSPACE_MEMBER_ENDPOINT_TEMPLATE)
  const baseEndpoint = `${OPENROUTER_WORKSPACES_ENDPOINT}/${encodeURIComponent(normalizedWorkspaceId)}/members`
  const params = new URLSearchParams()
  const parsed = openRouterWorkspaceMemberPaginationInputSchema.safeParse(
    input ?? {},
  )
  if (!parsed.success) throw invalidResponse(WORKSPACE_MEMBER_ENDPOINT_TEMPLATE)
  if (parsed.data.offset !== undefined) {
    params.set("offset", String(parsed.data.offset))
  }
  if (parsed.data.limit !== undefined) {
    params.set("limit", String(parsed.data.limit))
  }
  const endpoint = params.size ? `${baseEndpoint}?${params}` : baseEndpoint
  const response = parseResponse(
    openRouterWorkspaceMemberListResponseSchema,
    await fetchRaw(
      request,
      endpoint,
      { method: "GET", cache: "no-store" },
      {
        safeEndpoint: WORKSPACE_MEMBER_ENDPOINT_TEMPLATE,
        sensitiveValues: [normalizedWorkspaceId],
      },
    ),
    WORKSPACE_MEMBER_ENDPOINT_TEMPLATE,
  )
  return { data: response.data, totalCount: response.total_count }
}
