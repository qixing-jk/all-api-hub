import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import type {
  ModelPricing,
  PricingResponse,
} from "~/services/apiService/common/type"
import { fetchGoogleModelIds } from "~/services/apiService/google"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

type FetchApiCredentialModelCatalogParams = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
}

/**
 * Fetch raw model ids using a stored API credential profile.
 */
export async function fetchApiCredentialModelIds(
  params: FetchApiCredentialModelCatalogParams,
): Promise<string[]> {
  if (
    params.apiType === API_TYPES.OPENAI_COMPATIBLE ||
    params.apiType === API_TYPES.OPENAI
  ) {
    return fetchOpenAICompatibleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return fetchAnthropicModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  if (params.apiType === API_TYPES.GOOGLE) {
    return fetchGoogleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  throw new Error("Unsupported apiType")
}

/**
 * Normalize and de-duplicate model ids returned by upstream model-list endpoints.
 */
export function normalizeApiCredentialModelIds(modelIds: string[]) {
  return Array.from(
    new Set(
      modelIds
        .filter((id) => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  )
}

/**
 * Convert a raw model id into the minimal pricing-model shape used by Model List.
 */
function createProfileCatalogModel(modelId: string): ModelPricing {
  return {
    model_name: modelId,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

/**
 * Build a minimal model-pricing response shim for profile-backed catalogs.
 */
export function buildApiCredentialProfilePricingResponse(
  modelIds: string[],
): PricingResponse {
  return {
    data: normalizeApiCredentialModelIds(modelIds).map((modelId) =>
      createProfileCatalogModel(modelId),
    ),
    group_ratio: {},
    success: true,
    usable_group: {},
  }
}
