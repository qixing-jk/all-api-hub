import {
  collectAccountRuntimeKeySecrets,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ModelCatalogRequest } from "~/services/apiAdapters/contracts/modelCatalog"
import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { createAccountModelPricingRequest } from "~/services/modelCatalog/accountRequest"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { buildModelListCatalogPricingResponse } from "~/services/modelList/pricingResponse"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

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

const createUnsupportedModelListSourceError = (siteType: string) =>
  new Error(`No model-list source capability is registered for ${siteType}`)

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
): ModelCatalogSnapshot =>
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
): Promise<ModelCatalogSnapshot> {
  const declaredModelIds = params.runtimeKey.modelAccess.suggestedModelIds
  const readiness = resolveModelListAccountSourceReadiness(params.account)
  let resolvedRuntimeKeySecret = ""
  let resolvedRuntimeKeySecrets: string[] = []

  try {
    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing &&
      readiness.modelPricing.runtimeKeyFallback ===
        MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING
    ) {
      return await readiness.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account, params.abortSignal),
      )
    }

    if (readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported) {
      throw createUnsupportedModelListSourceError(params.account.siteType)
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

      if (readiness.modelCatalog.enrichPricing) {
        return await readiness.modelCatalog.enrichPricing({
          accountRequest: createAccountModelPricingRequest(
            params.account,
            params.abortSignal,
          ),
          runtimeKey: resolvedRuntimeKey,
          models: runtimeModels,
        })
      }

      return buildRuntimeModelCatalogPricingResponse(
        params.account,
        runtimeModels,
      )
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
