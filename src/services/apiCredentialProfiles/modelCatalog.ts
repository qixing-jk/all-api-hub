import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  buildModelListCatalogPricingResponse,
  normalizeModelListModelIds,
} from "~/services/modelList/pricingResponse"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

interface FetchApiCredentialModelCatalogParams {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  abortSignal?: AbortSignal
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
      abortSignal: params.abortSignal,
    })
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return fetchAnthropicModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      abortSignal: params.abortSignal,
    })
  }

  if (params.apiType === API_TYPES.GOOGLE) {
    return fetchGoogleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      abortSignal: params.abortSignal,
    })
  }

  throw new Error("Unsupported apiType")
}

export const normalizeApiCredentialModelIds = normalizeModelListModelIds

/**
 * Build catalog facts for model ids discovered using a credential.
 */
export function buildApiCredentialProfilePricingResponse(
  modelIds: string[],
): ModelCatalogSnapshot {
  return buildModelListCatalogPricingResponse({
    models: modelIds.map((id) => ({ id })),
  })
}
