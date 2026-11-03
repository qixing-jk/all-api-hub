import { SITE_TYPES } from "~/constants/siteType"
import { NANOGPT_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { createNanoGptCatalogModel } from "~/services/apiAdapters/nanogpt/modelPresentation"
import { fetchNanoGptDetailedModelCatalog } from "~/services/apiService/nanogpt/catalog"
import { ApiError } from "~/services/apiTransport/errors"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"

const NANOGPT_PROVIDER_MODEL_CATALOG_SOURCE_ID = "nanogpt-detailed"
/** The catalog moves when the platform adds or reprices models, not per request. */
const NANOGPT_PROVIDER_MODEL_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000

/** Catalog errors surface for fallback disclosure, so credentials are scrubbed. */
const toCatalogDisclosureError = (
  error: unknown,
  abortSignal?: AbortSignal,
): unknown => {
  if (isAbortError(error)) return error
  if (abortSignal?.aborted) {
    return new DOMException("The operation was aborted", "AbortError")
  }
  const message = toSanitizedErrorSummary(error, [])
  if (error instanceof ApiError) {
    return new ApiError(
      message,
      error.statusCode,
      error.endpoint,
      error.code,
      error.upstreamCode,
    )
  }
  if (error instanceof TypeError) return new TypeError(message)
  return new Error(message)
}

/**
 * Provider-wide NanoGPT catalog with published list prices.
 *
 * The endpoint is public and identical for every key, so this is a provider
 * catalog (not a key-scoped runtime list): NanoGPT returns the same models for
 * any credential and publishes no per-key availability.
 * https://docs.nano-gpt.com/api-reference/endpoint/models
 */
export const nanoGptProviderModelCatalog: ProviderModelCatalogCapability = {
  source: {
    id: NANOGPT_PROVIDER_MODEL_CATALOG_SOURCE_ID,
    provider: SITE_TYPES.NANOGPT,
    displayName: NANOGPT_DISPLAY_NAME,
    cacheTtlMs: NANOGPT_PROVIDER_MODEL_CATALOG_CACHE_TTL_MS,
  },
  async fetchPricing(request) {
    try {
      const models = await fetchNanoGptDetailedModelCatalog(request.abortSignal)
      return {
        data: models.map(createNanoGptCatalogModel),
        groupRatios: {},
        success: true,
        groupAccess: { kind: "not-applicable" },
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
          provider: SITE_TYPES.NANOGPT,
          catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
          supportsRuntimeModelList: false,
          supportsPricing: true,
          actionPolicy: {
            supportsGroupFiltering: false,
            supportsAccountSummary: false,
            supportsTokenCompatibility: false,
            // Public membership does not prevent probing with an account runtime key.
            supportsCredentialVerification: true,
            supportsBatchCredentialVerification: true,
            supportsCliVerification: true,
          },
        },
      }
    } catch (error) {
      throw toCatalogDisclosureError(error, request.abortSignal)
    }
  },
}
