import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ModelListItem } from "~/features/ModelList/modelListItems"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import { prepareModelListSource } from "~/features/ModelList/sourcePreparation"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  type ModelListSourceInfo,
} from "~/services/modelList/pricingModel"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

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

/** Stable account facts shared by Model List domain tests. */
export const buildModelListAccountFixture = (
  siteType: AccountSiteType,
): DisplaySiteData => ({
  id: `account-${siteType}`,
  name: "Example Account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
})

/** Prepare a model row with explicit access evidence for filtering and pricing. */
export function buildModelListItemFixture(
  id: string,
  ratios: Record<string, number>,
  usableGroups = ["a", "b"],
): ModelListItem {
  const account = { ...buildModelListAccountFixture(SITE_TYPES.NEW_API), id }
  const prepared = prepareModelListSource({
    source: createAccountSource(account),
    pricing: {
      success: true,
      data: [
        {
          model_name: "model",
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          quota_type: 0,
          enable_groups: ["a", "b"],
          supported_endpoint_types: [],
        },
      ],
      groupAccess: {
        kind: "authoritative",
        usableGroups,
      },
      groupRatios: ratios,
    },
  })
  return {
    ...prepared.items[0],
    comparableModelIdentity: { key: "exact:model", displayName: "model" },
    resolvedVendor: { state: "unknown" },
  }
}
