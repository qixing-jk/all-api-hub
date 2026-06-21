import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
} from "~/services/accounts/accountSiteProfile"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ModelCatalogRequest } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { type PricingResponse } from "~/services/apiService/common/type"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import {
  buildSub2ApiRuntimePricingResponse,
  loadSub2ApiEstimatedPricingResponse,
} from "~/services/modelList/accountSources/sub2apiEstimates"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { parseDelimitedList } from "~/utils/core/string"

interface LoadAccountTokenFallbackPricingParams {
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

const createMissingModelCatalogCapabilityError = (siteType: string) =>
  new Error(`modelCatalog is not implemented for ${siteType}`)

const createMissingModelPricingCapabilityError = (siteType: string) =>
  new Error(`modelPricing is not implemented for ${siteType}`)

const createAccountModelPricingRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
): ModelPricingRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

const createRuntimeCatalogRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
  apiKey: string,
): ModelCatalogRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey,
  },
})

/**
 * Loads a minimal model catalog for an account token by combining selected-token
 * visibility with the source account's Model List readiness route.
 */
export async function loadAccountTokenFallbackPricingResponse(
  params: LoadAccountTokenFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = parseDelimitedList(params.token.models)
  const readiness = resolveModelListAccountSourceReadiness(params.account)
  let resolvedTokenKey = ""

  try {
    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing &&
      readiness.displayCapabilitiesSource ===
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
    ) {
      return await readiness.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account),
      )
    }

    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported &&
      readiness.reason ===
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability &&
      readiness.displayCapabilitiesSource ===
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
    ) {
      throw createMissingModelPricingCapabilityError(params.account.siteType)
    }

    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      params.account,
      params.token,
    )
    resolvedTokenKey = resolvedToken.key

    if (
      readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
    ) {
      const runtimeModelIds = await readiness.modelCatalog.fetchModels(
        createRuntimeCatalogRequest(params.account, resolvedToken.key),
      )
      const modelOnlyResponse =
        buildSub2ApiRuntimePricingResponse(runtimeModelIds)

      if (
        readiness.dashboardEstimateLoader ===
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api
      ) {
        return await loadSub2ApiEstimatedPricingResponse({
          account: params.account,
          selectedToken: params.token,
          resolvedKey: resolvedToken.key,
          runtimeModelIds,
          fallbackResponse: modelOnlyResponse,
        })
      }

      return modelOnlyResponse
    }

    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported &&
      readiness.reason ===
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability
    ) {
      throw createMissingModelCatalogCapabilityError(params.account.siteType)
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
      params.account.token,
      params.account.cookieAuthSessionCookie ?? "",
      params.token.key,
      resolvedTokenKey,
    ])

    throw new Error(sanitizedMessage || ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED, {
      cause: error,
    })
  }
}
