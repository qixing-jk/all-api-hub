import { SITE_TYPES } from "~/constants/siteType"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  type ModelListSourceInfo,
} from "~/services/modelList/pricingModel"

/** Fixture for the normalized policy published by the AIHubMix pricing adapter. */
export function buildAIHubMixModelListSource(
  kind: ModelListSourceInfo["kind"],
): ModelListSourceInfo {
  const isFallback = kind === MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
  return {
    kind,
    provider: SITE_TYPES.AIHUBMIX,
    catalogScope: isFallback
      ? MODEL_CATALOG_SCOPES.PROVIDER
      : MODEL_CATALOG_SCOPES.PERSONALIZED,
    supportsPricing: true,
    actionPolicy: {
      supportsGroupFiltering: false,
      supportsAccountSummary: !isFallback,
      supportsTokenCompatibility: false,
      supportsCredentialVerification: false,
      supportsBatchCredentialVerification: false,
      supportsCliVerification: false,
    },
  }
}
