import {
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
} from "~/services/accounts/accountSiteProfile"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ModelCatalogRequest } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import {
  buildSub2ApiRuntimePricingResponse,
  loadSub2ApiEstimatedPricingResponse,
} from "~/services/modelList/accountSources/sub2apiEstimates"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import { buildModelListCatalogPricingResponse } from "~/services/modelList/pricingResponse"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import { parseDelimitedList } from "~/utils/core/string"

interface LoadAccountRuntimeKeyFallbackPricingParams {
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
  runtimeKey: AccountRuntimeKey
  abortSignal?: AbortSignal
}

export const ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED =
  "ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED"

const createMissingModelCatalogCapabilityError = (siteType: string) =>
  new Error(`modelCatalog is not implemented for ${siteType}`)

const createMissingModelPricingCapabilityError = (siteType: string) =>
  new Error(`modelPricing is not implemented for ${siteType}`)

const createAccountModelPricingRequest = (
  account: LoadAccountRuntimeKeyFallbackPricingParams["account"],
  abortSignal?: AbortSignal,
): ModelPricingRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  abortSignal,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

const createRuntimeCatalogRequest = (
  account: LoadAccountRuntimeKeyFallbackPricingParams["account"],
  runtimeKey: AccountRuntimeKey,
  apiKey: string,
  abortSignal?: AbortSignal,
): ModelCatalogRequest => ({
  baseUrl: runtimeKey.baseUrl || account.baseUrl,
  accountId: account.id,
  abortSignal,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey,
  },
})

const buildRuntimeModelCatalogPricingResponse = (
  account: LoadAccountRuntimeKeyFallbackPricingParams["account"],
  models: readonly ModelDescriptor[],
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): PricingResponse =>
  buildModelListCatalogPricingResponse({
    models,
    unavailableReason,
    source: {
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: account.siteType,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    },
  })

const resolveFallbackRuntimeKeySecret = async (
  params: LoadAccountRuntimeKeyFallbackPricingParams,
  readiness: ReturnType<typeof resolveModelListAccountSourceReadiness>,
) => {
  if (
    readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog &&
    !readiness.requiresTokenKeyResolution &&
    params.runtimeKey.secret.trim()
  ) {
    return params.runtimeKey
  }

  return params.abortSignal
    ? resolveDisplayAccountRuntimeKeySecret(params.account, params.runtimeKey, {
        abortSignal: params.abortSignal,
      })
    : resolveDisplayAccountRuntimeKeySecret(params.account, params.runtimeKey)
}

/**
 * Loads a minimal model catalog for a runtime key by combining selected-key
 * visibility with the source account's Model List readiness route.
 */
export async function loadAccountRuntimeKeyFallbackPricingResponse(
  params: LoadAccountRuntimeKeyFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = isAccountTokenRuntimeKey(params.runtimeKey)
    ? parseDelimitedList(params.runtimeKey.token.models)
    : []
  const readiness = resolveModelListAccountSourceReadiness(params.account)
  let resolvedRuntimeKeySecret = ""
  let resolvedRuntimeKeySecrets: string[] = []

  try {
    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing &&
      readiness.displayCapabilitiesSource ===
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
    ) {
      return await readiness.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account, params.abortSignal),
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

    const resolvedRuntimeKey = await resolveFallbackRuntimeKeySecret(
      params,
      readiness,
    )
    resolvedRuntimeKeySecret = resolvedRuntimeKey.secret
    resolvedRuntimeKeySecrets = collectAccountRuntimeKeySecrets([
      resolvedRuntimeKey,
    ])

    if (
      readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
    ) {
      const runtimeModels = await readiness.modelCatalog.fetchModels(
        createRuntimeCatalogRequest(
          params.account,
          resolvedRuntimeKey,
          resolvedRuntimeKey.secret,
          params.abortSignal,
        ),
      )

      if (
        readiness.dashboardEstimateLoader ===
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api
      ) {
        const modelOnlyResponse =
          buildSub2ApiRuntimePricingResponse(runtimeModels)

        if (!isAccountTokenRuntimeKey(resolvedRuntimeKey)) {
          return modelOnlyResponse
        }

        return await loadSub2ApiEstimatedPricingResponse({
          account: params.account,
          selectedToken: resolvedRuntimeKey.token,
          resolvedKey: resolvedRuntimeKey.secret,
          runtimeModels,
          abortSignal: params.abortSignal,
        })
      }

      return buildRuntimeModelCatalogPricingResponse(
        params.account,
        runtimeModels,
      )
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
        apiKey: resolvedRuntimeKey.secret,
        abortSignal: params.abortSignal,
      })
    } catch (error) {
      if (isAbortError(error, params.abortSignal)) {
        throw error
      }

      if (declaredModelIds.length === 0) {
        throw error
      }
    }

    return buildApiCredentialProfilePricingResponse([
      ...declaredModelIds,
      ...upstreamModelIds,
    ])
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const sanitizedMessage = toSanitizedErrorSummary(error, [
      params.account.baseUrl,
      params.account.token,
      params.account.cookieAuthSessionCookie ?? "",
      params.runtimeKey.secret,
      resolvedRuntimeKeySecret,
      ...resolvedRuntimeKeySecrets,
    ])

    throw new Error(
      sanitizedMessage || ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED,
      {
        cause: error,
      },
    )
  }
}
