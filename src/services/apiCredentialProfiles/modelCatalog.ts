import { SITE_TYPES } from "~/constants/siteType"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { loadModelPriceTable } from "~/services/apiCredentialProfiles/modelPriceTable"
import {
  applySub2ApiPriceEstimates,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/apiCredentialProfiles/sub2apiPriceEstimation"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/apiService/common/type"
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
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

const createMissingModelCatalogCapabilityError = () =>
  new Error("modelCatalog is not implemented for sub2api")

const createMissingModelPricingCapabilityError = (siteType: string) =>
  new Error(`modelPricing is not implemented for ${siteType}`)

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
    if (params.account.siteType === SITE_TYPES.AIHUBMIX) {
      const adapter = getSiteAdapter(params.account.siteType)
      if (!adapter.modelPricing) {
        throw createMissingModelPricingCapabilityError(params.account.siteType)
      }

      return await adapter.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account),
      )
    }

    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      params.account,
      params.token,
    )
    resolvedTokenKey = resolvedToken.key

    if (params.account.siteType === SITE_TYPES.SUB2API) {
      const adapter = getSiteAdapter(SITE_TYPES.SUB2API)
      if (!adapter.modelCatalog) {
        throw createMissingModelCatalogCapabilityError()
      }

      const runtimeModelIds = await adapter.modelCatalog.fetchModels({
        baseUrl: params.account.baseUrl,
        accountId: params.account.id,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: resolvedToken.key,
        },
      })

      const modelOnlyResponse =
        buildSub2ApiRuntimePricingResponse(runtimeModelIds)

      return await loadSub2ApiEstimatedPricingResponse({
        account: params.account,
        selectedToken: params.token,
        resolvedKey: resolvedToken.key,
        runtimeModelIds,
        fallbackResponse: modelOnlyResponse,
      })
    }

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

    throw new Error(sanitizedMessage || ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED, {
      cause: error,
    })
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
function createProfileCatalogModel(
  modelId: string,
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): ModelPricing {
  return {
    model_name: modelId,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.NONE,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason: unavailableReason,
    },
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
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      supportsPricing: false,
    },
    success: true,
    usable_group: {},
  }
}

/**
 * Build a Sub2API runtime-key model catalog where model visibility is known
 * but no JWT/group pricing estimate has been applied yet.
 */
function buildSub2ApiRuntimePricingResponse(
  modelIds: string[],
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): PricingResponse {
  return {
    data: normalizeApiCredentialModelIds(modelIds).map((modelId) =>
      createProfileCatalogModel(modelId, unavailableReason),
    ),
    group_ratio: {},
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    },
    success: true,
    usable_group: {},
  }
}

const hasSub2ApiDashboardAuth = (
  account: LoadAccountTokenFallbackPricingParams["account"],
): boolean => {
  return (
    account.authType === AuthTypeEnum.AccessToken &&
    typeof account.token === "string" &&
    account.token.trim().length > 0
  )
}

const createSub2ApiDashboardRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

const createAccountModelPricingRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

const loadSub2ApiEstimatedPricingResponse = async (params: {
  account: LoadAccountTokenFallbackPricingParams["account"]
  selectedToken: ApiToken
  resolvedKey: string
  runtimeModelIds: string[]
  fallbackResponse: PricingResponse
}): Promise<PricingResponse> => {
  if (!hasSub2ApiDashboardAuth(params.account)) {
    return params.fallbackResponse
  }

  try {
    const dashboardRequest = createSub2ApiDashboardRequest(params.account)
    const [groups, groupRates, accountTokens, priceTable] = await Promise.all([
      fetchSub2ApiAvailableGroups(dashboardRequest),
      fetchSub2ApiGroupRates(dashboardRequest),
      fetchAccountTokens(dashboardRequest),
      loadModelPriceTable(),
    ])
    const group = resolveSub2ApiKeyGroupForPriceEstimation({
      selectedToken: params.selectedToken,
      resolvedKey: params.resolvedKey,
      accountTokens,
      groups,
    })

    return applySub2ApiPriceEstimates({
      modelIds: params.runtimeModelIds,
      group,
      groupRates,
      priceTable,
    })
  } catch {
    return buildSub2ApiRuntimePricingResponse(
      params.runtimeModelIds,
      MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    )
  }
}
