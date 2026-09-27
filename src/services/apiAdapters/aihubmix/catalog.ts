import { createAIHubMixPublicCatalogCache } from "~/services/apiAdapters/aihubmix/publicCatalogCache"
import { getAIHubMixPricingSource } from "~/services/apiAdapters/aihubmix/websitePricing"
import {
  fetchAIHubMixApiUserModelIds,
  fetchAIHubMixModelCatalog,
  fetchAIHubMixWebsiteModels,
  fetchAIHubMixWebUserModelIds,
} from "~/services/apiService/aihubmix/modelCatalog"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
} from "~/services/modelPricing/pricingConstants"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"
import { createLogger } from "~/utils/core/logger"

import {
  buildAIHubMixPricingResponse,
  getAIHubMixCatalogModelId,
} from "./catalogMapping"

const logger = createLogger("ApiAdapter.AIHubMix.Catalog")

const publicModelCatalog = createAIHubMixPublicCatalogCache(
  fetchAIHubMixModelCatalog,
)
const publicWebsiteModels = createAIHubMixPublicCatalogCache(
  fetchAIHubMixWebsiteModels,
)

/** Clear public snapshots once before a manual single/all-account refresh. */
export function invalidateAIHubMixPublicCatalogs(): void {
  publicModelCatalog.invalidate()
  publicWebsiteModels.invalidate()
}

const fetchAIHubMixUserScopedModelIds = async (
  request: ApiServiceRequest,
): Promise<string[] | null> => {
  try {
    return await fetchAIHubMixApiUserModelIds(request)
  } catch (error) {
    if (isAbortError(error, request.abortSignal)) throw error
    logger.warn(
      "Failed to fetch AIHubMix API user available models; trying web available models",
      error,
    )
  }

  try {
    return await fetchAIHubMixWebUserModelIds(request)
  } catch (error) {
    if (isAbortError(error, request.abortSignal)) throw error
    logger.warn(
      "Failed to fetch AIHubMix web available models; using catalog fallback",
      error,
    )
    return null
  }
}

/**
 * Fetch AIHubMix model pricing from the complete catalog and current user scope.
 */
export async function fetchModelPricing(
  request: ApiServiceRequest,
): Promise<ModelCatalogSnapshot> {
  return runAbortableTask(
    async () => {
      const [catalog, userScopedModelIds, websiteModels] = await Promise.all([
        publicModelCatalog.get(),
        fetchAIHubMixUserScopedModelIds(request),
        publicWebsiteModels.get().catch(() => undefined),
      ])

      const response = buildAIHubMixPricingResponse({
        catalog,
        userScopedModelIds,
        websiteModels: websiteModels ?? new Map(),
      })
      if (!websiteModels) {
        // Transport failure is distinct from an unsupported published rule. Preserve
        // source prices for inspection without certifying an incomplete catalog.
        for (const model of response.data) {
          model.pricingPlan = {
            rates: {},
            rules: [],
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
            ...model.pricingPlan,
            source: {
              ...getAIHubMixPricingSource(model.model_name),
              ...model.pricingPlan?.source,
              rulesUnavailable: true,
            },
            issues: [{ code: PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE }],
          }
        }
      }
      return response
    },
    { signals: [request.abortSignal] },
  )
}

/**
 * Fetch AIHubMix model ids available to the current account.
 */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  return runAbortableTask(
    async () => {
      const userScopedModelIds = await fetchAIHubMixUserScopedModelIds(request)
      if (userScopedModelIds !== null) {
        return userScopedModelIds
      }

      return fetchAllModels(request)
    },
    { signals: [request.abortSignal] },
  )
}

/**
 * Fetch all AIHubMix model ids when a caller needs the global model catalog.
 */
export async function fetchAllModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  return runAbortableTask(
    async () => {
      const catalog = await publicModelCatalog.get()
      return Array.from(
        new Set(catalog.map(getAIHubMixCatalogModelId).filter(Boolean)),
      )
    },
    { signals: [request.abortSignal] },
  )
}
