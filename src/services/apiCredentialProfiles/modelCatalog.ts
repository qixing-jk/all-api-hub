import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
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
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
import { parseDelimitedList } from "~/utils/core/string"

type FetchApiCredentialModelCatalogParams = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
}

type LoadAccountTokenFallbackPricingParams = {
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >
  token: ApiToken
}

export const ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED =
  "ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED"

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
 * Loads a minimal model catalog for an account token by combining token-declared
 * model ids with an upstream-compatible key lookup against the same base URL.
 */
export async function loadAccountTokenFallbackPricingResponse(
  params: LoadAccountTokenFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = parseDelimitedList(params.token.models)
  let resolvedTokenKey = ""

  try {
    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      params.account,
      params.token,
    )
    resolvedTokenKey = resolvedToken.key

    let upstreamModelIds: string[] = []
    try {
      upstreamModelIds = await fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: params.account.baseUrl,
        apiKey: resolvedToken.key,
      })
    } catch (error) {
      if (declaredModelIds.length === 0) {
        throw error
      }
    }

    return buildApiCredentialProfilePricingResponse([
      ...declaredModelIds,
      ...upstreamModelIds,
    ])
  } catch (error) {
    const sanitizedMessage = toSanitizedErrorSummary(error, [
      params.account.baseUrl,
      params.token.key,
      resolvedTokenKey,
    ])

    throw new Error(sanitizedMessage || ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED)
  }
}

/**
 * Normalize and de-duplicate model ids returned by upstream model-list endpoints.
 */
export function normalizeApiCredentialModelIds(modelIds: unknown[]) {
  return Array.from(
    new Set(
      modelIds
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
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
