import { type QueryClient } from "@tanstack/react-query"

import {
  MODEL_LIST_QUERY_KEYS,
  MODEL_LIST_QUERY_SCOPE_VALUES,
} from "~/features/ModelList/catalog/modelDataStates"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/catalog/modelManagementSources"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import {
  createProviderModelCatalogCacheKey,
  isUnsupportedModelPricingError,
  type AllAccountsModelLoadTarget,
} from "~/services/modelCatalog/loader"
import { MODEL_LIST_ACCOUNT_SOURCE_ROUTES } from "~/services/modelList/accountSources"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import type { DisplaySiteData } from "~/types"

export const shouldRetryModelPricingQuery = (
  failureCount: number,
  error: Error,
) => !isUnsupportedModelPricingError(error) && failureCount < 1

/** Builds an account- or provider-scoped pricing query key. */
export function createModelPricingQueryKey(
  account?: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
  providerCatalog?: ProviderModelCatalogCapability,
) {
  if (account && providerCatalog) {
    return providerCatalog.personalized
      ? [
          ...createProviderModelCatalogQueryKeyPrefix(
            providerCatalog.source.id,
          ),
          MODEL_CATALOG_SCOPES.PERSONALIZED,
          account.id,
          account.baseUrl,
          account.userId,
          account.siteType,
          account.authType,
        ]
      : createProviderModelCatalogQueryKey(
          providerCatalog.source.id,
          MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
        )
  }

  return account
    ? [
        MODEL_LIST_QUERY_KEYS.PRICING,
        account.id,
        account.baseUrl,
        account.userId,
        account.siteType,
        account.authType,
      ]
    : [MODEL_LIST_QUERY_KEYS.PRICING, MODEL_LIST_QUERY_SCOPE_VALUES.NONE]
}

/** Prefix shared by every React Query scope for one provider-wide catalog. */
function createProviderModelCatalogQueryKeyPrefix(sourceId: string) {
  return [
    MODEL_LIST_QUERY_KEYS.PRICING,
    MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
    sourceId,
  ]
}

/** Keeps provider-catalog result shapes separate by management scope. */
function createProviderModelCatalogQueryKey(sourceId: string, scope: string) {
  return [...createProviderModelCatalogQueryKeyPrefix(sourceId), scope]
}

/** Builds an all-accounts pricing query key without changing persistence cache scope. */
function createAllAccountsModelPricingQueryKey(
  account: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
) {
  return [
    MODEL_LIST_QUERY_KEYS.PRICING,
    MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    account.id,
    account.baseUrl,
    account.userId,
    account.siteType,
    account.authType,
  ]
}

/** Builds a query key for one account or collapsed provider catalog target. */
export function createAllAccountsModelLoadTargetQueryKey(
  target: AllAccountsModelLoadTarget,
) {
  return target.readiness.route ===
    MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog &&
    !target.readiness.providerModelCatalog.personalized
    ? createProviderModelCatalogQueryKey(
        target.readiness.providerModelCatalog.source.id,
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    : createAllAccountsModelPricingQueryKey(target.account)
}

/** Marks every in-memory provider scope stale after a catalog refresh. */
export async function invalidateProviderModelCatalogCaches(params: {
  queryClient: QueryClient
  sourceId: string
}) {
  await Promise.all([
    modelPricingCache.invalidate(
      createProviderModelCatalogCacheKey(params.sourceId),
    ),
    params.queryClient.invalidateQueries({
      queryKey: createProviderModelCatalogQueryKeyPrefix(params.sourceId),
      refetchType: "none",
    }),
  ])
}

/** Builds the profile catalog query key from stable profile revision data. */
export function createProfileCatalogQueryKey(profile?: {
  id: string
  updatedAt: number
}) {
  return profile
    ? [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        profile.id,
        profile.updatedAt,
      ]
    : [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
      ]
}
