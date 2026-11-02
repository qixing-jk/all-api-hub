import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { AIMLAPI_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

/**
 * AI/ML API answers account errors as an RFC7807-style problem body:
 * `{ title, status, message, instance, requestId, error: { name, message } }`.
 * It is not a `{ success, data }` envelope, so every read parses the raw body.
 */
/**
 * A read that the account's saved credential class cannot perform. AI/ML API
 * splits key management and billing between two credential kinds, so this is an
 * expected configuration state rather than an upstream failure.
 */
export class AimlApiCredentialScopeError extends Error {
  readonly code = "aimlapi_api_key_required"

  constructor(readonly scope: "regular-api-key" | "management-key") {
    super(
      scope === "regular-api-key"
        ? "aimlapi_api_key_required"
        : "aimlapi_management_key_required",
    )
    this.name = "AimlApiCredentialScopeError"
  }
}

/** Reads the supplemental regular API key already attached to a request. */
function readAimlApiKey(request: ApiServiceRequest): string | undefined {
  return typeof request.aimlApiKey === "string" && request.aimlApiKey.trim()
    ? request.aimlApiKey.trim()
    : undefined
}

const savedApiKeys = new WeakMap<ApiServiceRequest, string | undefined>()

/**
 * Resolves the account's regular API key, falling back to its saved account.
 *
 * The key is a second static credential, so a caller that only has an account id
 * (background refresh, model list) still reads the right one instead of asking
 * the user again.
 */
export async function ensureAimlApiKey(
  request: ApiServiceRequest,
): Promise<string | undefined> {
  const attached = readAimlApiKey(request)
  if (attached) return attached
  if (savedApiKeys.has(request)) return savedApiKeys.get(request)

  const accountId = request.accountId?.trim()
  if (!accountId) {
    savedApiKeys.set(request, undefined)
    return undefined
  }
  const account = await accountQueries.getAccountById(accountId)
  const key =
    account?.site_type === undefined
      ? undefined
      : account.aimlApiAuth?.apiKey?.trim() || undefined
  savedApiKeys.set(request, key)
  return key
}

const statusToErrorCode = (status: number): ApiErrorCode => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/** Reads the problem message without trusting the rest of the body shape. */
function readProblemMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  if (typeof body.message === "string" && body.message.trim())
    return body.message.trim()
  const nested = body.error
  if (
    isRecord(nested) &&
    typeof nested.message === "string" &&
    nested.message.trim()
  )
    return nested.message.trim()
  return undefined
}

/** Builds one API error from a failure response. */
function createHttpError(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
): ApiError {
  const problem = readProblemMessage(response.body)
  return new ApiError(
    getErrorMessage(
      problem,
      t("messages:errors.api.requestFailed", { status: response.status }),
    ),
    response.status,
    endpoint,
    statusToErrorCode(response.status),
  )
}

/** Rejects a body that does not match the documented shape. */
export function invalidAimlApiResponse(endpoint: string): never {
  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

export type AimlApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /**
   * Credential class the route requires. Billing routes only accept a regular
   * API key; key management only accepts a management key.
   */
  credential?: "primary" | "regular-api-key"
  /** Skip the `Authorization` header for public routes. */
  anonymous?: boolean
}

const buildQuery = (query: AimlApiRequestOptions["query"]): string => {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const search = params.toString()
  return search ? `?${search}` : ""
}

/**
 * Dispatches one saved-key request against `api.aimlapi.com`.
 *
 * The account's browser origin never becomes the API base: the console host
 * serves a Nuxt app and rejects these routes, so the declared API origin is
 * always used (mirroring the OpenRouter management-key transport).
 */
export async function fetchAimlApiJson<T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: AimlApiRequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET"
  const headers = new Headers()
  headers.set("Accept", "application/json")

  if (!options.anonymous) {
    const credential =
      options.credential === "regular-api-key"
        ? await ensureAimlApiKey(request)
        : request.auth.accessToken?.trim()
    if (!credential) {
      throw new AimlApiCredentialScopeError(
        options.credential === "regular-api-key"
          ? "regular-api-key"
          : "management-key",
      )
    }
    headers.set("Authorization", `Bearer ${credential}`)
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetchApiResponse<unknown>(
    {
      ...request,
      baseUrl: AIMLAPI_API_BASE_URL,
      managementApiBaseUrl: AIMLAPI_API_BASE_URL,
      auth: options.anonymous
        ? { authType: AuthTypeEnum.None }
        : {
            ...request.auth,
            authType: AuthTypeEnum.AccessToken,
            userId: undefined,
          },
      ...(method === "GET" ? {} : { observer: request.observer }),
    },
    {
      endpoint: `${endpoint}${buildQuery(options.query)}`,
      responseType: "json",
      options: {
        method,
        headers,
        cache: "no-store",
        credentials: "omit",
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      },
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )

  if (!response.ok) throw createHttpError(response, endpoint)
  if (method !== "GET")
    notifyApiTransportObserver(request.observer, "onMutationAccepted")
  return response.body as T
}
