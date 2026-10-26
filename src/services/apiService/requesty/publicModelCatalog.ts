import { REQUESTY_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { REQUESTY_RESPONSE_ERRORS } from "~/services/apiService/requesty/constants"
import { readDecimal } from "~/services/apiService/requesty/parsing"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types/auth"
import { isRecord } from "~/utils/core/object"

const REQUESTY_MODELS_ENDPOINT = "/models"

/** One row of Requesty's public, unauthenticated priced model catalog. */
export interface RequestyPublicModel {
  id: string
  /** USD per token; multiply by 1e6 for USD/M. -1 denotes unavailable pricing. */
  inputPrice: number
  outputPrice: number
  cachedPrice?: number
  contextWindow?: number
  supportsCaching: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  supportsToolCalling: boolean
  description?: string
}

const readCapability = (record: Record<string, unknown>, key: string) =>
  record[key] === true

/** Retains unpriced models without coercing null/blank quotes to free prices. */
function parseModel(record: Record<string, unknown>): RequestyPublicModel {
  const id = typeof record.id === "string" ? record.id : ""
  const inputPrice = readDecimal(record.input_price) ?? -1
  const outputPrice = readDecimal(record.output_price) ?? -1
  if (!id) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.Model)
  }
  const cachedPrice = readDecimal(record.cached_price)
  const contextWindow = Number(record.context_window)
  const description =
    typeof record.description === "string" && record.description.trim() !== ""
      ? // Upstream descriptions may carry trailing whitespace; the provider
        // catalog admission boundary requires trimmed strings.
        record.description.trim()
      : undefined
  return {
    id,
    inputPrice,
    outputPrice,
    ...(cachedPrice !== undefined && cachedPrice >= 0 ? { cachedPrice } : {}),
    ...(Number.isInteger(contextWindow) && contextWindow > 0
      ? { contextWindow }
      : {}),
    supportsCaching: readCapability(record, "supports_caching"),
    supportsVision: readCapability(record, "supports_vision"),
    supportsReasoning: readCapability(record, "supports_reasoning"),
    supportsToolCalling: readCapability(record, "supports_tool_calling"),
    ...(description !== undefined ? { description } : {}),
  }
}

/**
 * Fetches Requesty's public model catalog. The endpoint is unauthenticated
 * (verified live 2026-10-21) and returns one row per model with per-token
 * USD pricing.
 */
export async function fetchRequestyPublicModelCatalog(): Promise<
  RequestyPublicModel[]
> {
  // The catalog is a fixed provider origin with no account credential; the
  // request is unauthenticated, so it needs no console binding.
  const response = await fetchApiResponse<unknown>(
    {
      baseUrl: REQUESTY_API_BASE_URL,
      auth: { authType: AuthTypeEnum.None },
    },
    {
      endpoint: REQUESTY_MODELS_ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  if (!response.ok) {
    throw new ApiError(
      "Failed to load Requesty model catalog",
      response.status,
      REQUESTY_MODELS_ENDPOINT,
    )
  }
  const body = response.body
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new ApiError(
      "Invalid Requesty model catalog response",
      undefined,
      REQUESTY_MODELS_ENDPOINT,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return body.data
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map(parseModel)
}
