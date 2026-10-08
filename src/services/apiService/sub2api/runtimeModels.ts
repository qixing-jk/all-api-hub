import {
  DEPLOYMENT_API_ROLES,
  resolveDeploymentApiOrigin,
} from "~/constants/deploymentApiOrigins"
import { normalizeSub2ApiAccessToken as normalizeAccessToken } from "~/services/apiService/sub2api/authLifecycle"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

const SUB2API_RUNTIME_MODELS_ENDPOINT = "/v1/models"

const normalizeRuntimeApiKey = (request: ApiServiceRequest): string => {
  const auth = request.auth as typeof request.auth & { apiKey?: unknown }
  return normalizeAccessToken(auth.apiKey)
}

const createInvalidRuntimeModelsPayloadError = () =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.BUSINESS_ERROR,
  )

const createRuntimeApiKeyAuthError = () =>
  new ApiError(
    t("messages:sub2api.loginRequired"),
    401,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.HTTP_401,
  )

const createSub2ApiRuntimeBusinessError = (
  payload: unknown,
): ApiError | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }

  const code = (payload as { code?: unknown }).code
  if (
    (typeof code !== "string" || !code.trim()) &&
    (typeof code !== "number" || code === 0)
  ) {
    return null
  }

  const message = (payload as { message?: unknown }).message
  if (typeof message !== "string" || !message.trim()) {
    return null
  }

  return new ApiError(
    message.trim(),
    undefined,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.BUSINESS_ERROR,
  )
}

const normalizeRuntimeModelId = (item: unknown): string => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  const id = (item as { id?: unknown }).id
  if (typeof id !== "string" || !id.trim()) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  return id.trim()
}

const parseSub2ApiRuntimeModelIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  return data.map(normalizeRuntimeModelId)
}

const readRuntimeModelsPayload = async (
  response: Response,
): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    throw createInvalidRuntimeModelsPayloadError()
  }
}

const readRuntimeModelsBusinessError = async (
  response: Response,
): Promise<ApiError | null> => {
  try {
    return createSub2ApiRuntimeBusinessError(await response.clone().json())
  } catch {
    return null
  }
}

/**
 * The runtime model list bypasses the shared transport, so it resolves the
 * deployment's API origin itself instead of assuming the account URL answers it.
 * It is a gateway endpoint reached with an API key, so it resolves the
 * inference role; both roles name the same origin until a deployment splits them.
 */
const createRuntimeModelsUrl = (baseUrl: string): string =>
  `${resolveDeploymentApiOrigin(baseUrl, DEPLOYMENT_API_ROLES.Inference).replace(/\/+$/, "")}${SUB2API_RUNTIME_MODELS_ENDPOINT}`

/**
 * Source: https://github.com/Wei-Shaw/sub2api - gateway /v1/models uses
 * runtime API-key auth and returns models visible to that key's group/platform.
 */
export async function fetchSub2ApiRuntimeModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const apiKey = normalizeRuntimeApiKey(request)
  if (!apiKey) {
    throw createRuntimeApiKeyAuthError()
  }

  const endpointUrl = createRuntimeModelsUrl(request.baseUrl)

  try {
    const response = await fetch(endpointUrl, {
      method: "GET",
      cache: "no-store",
      signal: request.abortSignal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (response.status === 401 || response.status === 403) {
      const businessError = await readRuntimeModelsBusinessError(response)
      if (businessError) {
        throw businessError
      }

      throw createRuntimeApiKeyAuthError()
    }

    if (!response.ok) {
      throw new ApiError(
        response.statusText || "Sub2API runtime model request failed",
        response.status,
        SUB2API_RUNTIME_MODELS_ENDPOINT,
        API_ERROR_CODES.HTTP_OTHER,
      )
    }

    return parseSub2ApiRuntimeModelIds(await readRuntimeModelsPayload(response))
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    logger.error("Failed to fetch Sub2API runtime models", {
      accountId: request.accountId,
      endpoint: SUB2API_RUNTIME_MODELS_ENDPOINT,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}
