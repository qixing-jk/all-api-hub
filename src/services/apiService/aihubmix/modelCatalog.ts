import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { t } from "~/utils/i18n/core"

import { extractAIHubMixData, fetchAIHubMixData } from "./transport"

const AIHUBMIX_MODEL_CATALOG_ENDPOINT = "/api/v1/models"
const AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT = "/api/user/available_models"
const AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT = "/call/usr/avail_mdls"

type AIHubMixUserAvailableModel = {
  model: string
  developer_id?: number
  order?: number
}

export type AIHubMixModelCatalogItem = {
  promotion?: unknown
  model_id?: string
  id?: string
  name?: string
  desc?: string
  description?: string
  developer_id?: number | string
  developer_name?: string
  developer?: string
  owner_by?: string
  type?: string
  types?: string
  endpoints?: string[] | string
  pricing?: {
    cache_write?: number | string
    cache_read?: number | string
    input?: number | string
    output?: number | string
  }
}

export type AIHubMixWebsiteModel = {
  model: string
  desc?: unknown
  desc_en?: unknown
  billing_config?: unknown
  display_input?: unknown
  img_price_config?: unknown
  display_output?: unknown
}

const normalizeModelIds = (payload: unknown): string[] => {
  if (Array.isArray(payload)) {
    return Array.from(
      new Set(
        payload.flatMap((item) => {
          if (typeof item === "string") {
            const normalized = item.trim()
            return normalized ? [normalized] : []
          }
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>
            const id = record.id ?? record.model ?? record.name
            if (typeof id === "string") {
              const normalized = id.trim()
              return normalized ? [normalized] : []
            }
            return []
          }
          return []
        }),
      ),
    )
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    return Array.from(
      new Set(
        Object.values(record).flatMap((value) => {
          if (Array.isArray(value)) return normalizeModelIds(value)
          if (typeof value === "string") {
            const normalized = value.trim()
            return normalized ? [normalized] : []
          }
          return []
        }),
      ),
    )
  }

  return []
}

const normalizeUserScopedModelIds = (
  payload: unknown,
  endpoint: string,
): string[] => {
  if (Array.isArray(payload)) {
    return normalizeModelIds(payload)
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    for (const field of ["data", "items", "models"]) {
      const value = record[field]
      if (Array.isArray(value)) {
        return normalizeModelIds(value)
      }
    }
  }

  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
  )
}

export const fetchAIHubMixModelCatalog = async (): Promise<
  AIHubMixModelCatalogItem[]
> => {
  const payload = await fetchAIHubMixPublicData(AIHUBMIX_MODEL_CATALOG_ENDPOINT)

  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is AIHubMixModelCatalogItem =>
        !!item && typeof item === "object",
    )
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.data)) {
      return record.data.filter(
        (item): item is AIHubMixModelCatalogItem =>
          !!item && typeof item === "object",
      )
    }
  }

  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    AIHUBMIX_MODEL_CATALOG_ENDPOINT,
  )
}

/**
 * Public website catalog supplies bilingual descriptions and billing_config.
 * Verified /call/mdl_info against /model/qwen-flash on 2026-09-09. Fetch once
 * for all rows; this enrichment never changes the account's available models.
 */
export async function fetchAIHubMixWebsiteModels(): Promise<
  Map<string, AIHubMixWebsiteModel>
> {
  const payload = await fetchAIHubMixPublicData("/call/mdl_info")
  if (!Array.isArray(payload))
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      "/call/mdl_info",
    )
  return new Map(
    payload
      .filter(
        (item): item is AIHubMixWebsiteModel =>
          !!item && typeof item === "object" && typeof item.model === "string",
      )
      .map((item) => [item.model, item]),
  )
}

/**
 * Both public catalogs are anonymous, including accounts imported from console.
 * Verified https://aihubmix.com/api/v1/models and /call/mdl_info on 2026-09-09.
 * Never share an authenticated response as provider-wide data.
 */
async function fetchAIHubMixPublicData(endpoint: string): Promise<unknown> {
  const response = await fetch(`${AIHUBMIX_API_ORIGIN}${endpoint}`, {
    credentials: "omit",
    redirect: "error",
    cache: "no-cache",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok)
    throw new ApiError(
      t("messages:errors.api.requestFailed", { status: response.status }),
      response.status,
      endpoint,
    )
  return extractAIHubMixData<unknown>(await response.json(), endpoint)
}
/** Parse each native user-model endpoint independently; adapters choose fallback order. */
export async function fetchAIHubMixApiUserModelIds(
  request: ApiServiceRequest,
): Promise<string[]> {
  return normalizeUserScopedModelIds(
    await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT,
    ),
    AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT,
  )
}
/** Fetch and parse the native website user-model endpoint. */
export async function fetchAIHubMixWebUserModelIds(
  request: ApiServiceRequest,
): Promise<string[]> {
  return normalizeUserScopedModelIds(
    await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT,
    ),
    AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT,
  )
}
