import { type ModelListAccountErrorType } from "~/features/ModelList/catalog/modelDataStates"
import { type ModelManagementSource } from "~/features/ModelList/catalog/modelManagementSources"
import { type AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import type { AccountPricingContext } from "~/services/modelCatalog/loader"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { type ModelCatalogFailureCategory } from "~/services/modelList/pricingModel"
import type { DisplaySiteData } from "~/types"

export interface UseModelDataProps {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}

export interface AccountQueryState {
  account: DisplaySiteData
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorType?: ModelListAccountErrorType
  errorMessage?: string
}

export const MODEL_LIST_FALLBACK_STATUS_SCOPES = {
  Account: "account",
  RuntimeKey: "runtime-key",
} as const

export type ModelListFallbackStatusScope =
  (typeof MODEL_LIST_FALLBACK_STATUS_SCOPES)[keyof typeof MODEL_LIST_FALLBACK_STATUS_SCOPES]

export interface AccountFallbackControls {
  isAvailable: boolean
  isActive: boolean
  statusScope: ModelListFallbackStatusScope
  runtimeKeys: AccountRuntimeKey[]
  selectedRuntimeKeyId: string | null
  setSelectedRuntimeKeyId: (runtimeKeyId: string | null) => void
  isLoadingRuntimeKeys: boolean
  hasLoadedRuntimeKeys: boolean
  runtimeKeyLoadErrorMessage: string | null
  catalogLoadErrorMessage: string | null
  isLoadingCatalog: boolean
  activeRuntimeKeyName: string | null
  loadRuntimeKeys: () => Promise<void>
  loadCatalog: () => Promise<void>
}

export interface PersonalizedCatalogFallbackControls {
  affectedAccountCount: number
  /** In all-account views, this represents the first affected account. */
  failureCategory: ModelCatalogFailureCategory
  message: string
  retry: () => Promise<void>
}

export interface UseModelDataReturn {
  pricingData: ModelCatalogSnapshot | null
  pricingContexts: AccountPricingContext[]
  isLoading: boolean
  hasAuthoritativePricingData: boolean
  dataFormatError: boolean
  unsupportedSource: boolean
  accountQueryStates: AccountQueryState[]
  loadPricingData: () => Promise<void>
  loadErrorMessage: string | null
  accountFallback: AccountFallbackControls | null
  personalizedCatalogFallback: PersonalizedCatalogFallbackControls | null
}
