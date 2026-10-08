import { useCallback, useMemo } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { isProviderCatalogFallback } from "~/features/ModelList/catalog/catalogFallback"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  resolveModelManagementSource,
} from "~/features/ModelList/catalog/modelManagementSources"
import type { useModelListData } from "~/features/ModelList/catalog/useModelListData"
import { sortModelListAccounts } from "~/features/ModelList/filtering/accountOrdering"
import { MODEL_LIST_GROUP_SELECTION_SCOPES } from "~/features/ModelList/groups/groupSelectionScopes"
import {
  canEnableModelPriceComparison,
  enableModelPriceComparison,
} from "~/features/ModelList/pricing/priceComparisonActivation"
import {
  canCreateAccountKeyResources,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { replaceWithinOptionsPage } from "~/utils/navigation/optionsPage"

type SourcePresentationInput = Pick<
  ReturnType<typeof useModelListData>,
  | "accounts"
  | "profiles"
  | "selectedSource"
  | "currentAccount"
  | "sourceCapabilities"
  | "setSelectedSourceValue"
  | "setSelectedGroups"
  | "sortMode"
  | "setSortMode"
  | "selectedBillingMode"
  | "setSelectedBillingMode"
  | "selectedGroups"
  | "showRealPrice"
  | "setShowRealPrice"
  | "searchTerm"
  | "pricingData"
  | "pricingContexts"
  | "isFallbackCatalogActive"
  | "accountQueryStates"
  | "accountSummaryCountsByAccountId"
  | "allAccountsFilterAccountIds"
  | "setAllAccountsFilterAccountIds"
>

/** Keep catalog scope, comparison activation and source disclosures together. */
export function useModelListSourcePresentation({
  accounts,
  profiles,
  selectedSource,
  currentAccount,
  sourceCapabilities,
  setSelectedSourceValue,
  setSelectedGroups,
  sortMode,
  setSortMode,
  selectedBillingMode,
  setSelectedBillingMode,
  selectedGroups,
  showRealPrice,
  setShowRealPrice,
  searchTerm,
  pricingData,
  pricingContexts,
  isFallbackCatalogActive,
  accountQueryStates,
  accountSummaryCountsByAccountId,
  allAccountsFilterAccountIds,
  setAllAccountsFilterAccountIds,
}: SourcePresentationInput) {
  const hasAnySources = accounts.length > 0 || profiles.length > 0
  const sortedAccounts = useMemo(
    () =>
      sortModelListAccounts({
        accounts,
        accountQueryStates,
        accountSummaryCountsByAccountId,
      }),
    [accountQueryStates, accountSummaryCountsByAccountId, accounts],
  )

  const handleSelectedSourceValueChange = useCallback(
    (sourceValue: string) => {
      setSelectedSourceValue(sourceValue)

      const source = resolveModelManagementSource({
        value: sourceValue,
        accounts,
        profiles,
      })
      const searchParams =
        source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
          ? { accountId: source.account.id }
          : source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? { profileId: source.profile.id }
            : source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
              ? { accountId: ALL_ACCOUNTS_SOURCE_VALUE }
              : undefined

      replaceWithinOptionsPage(`#${MENU_ITEM_IDS.MODELS}`, searchParams)
    },
    [accounts, profiles, setSelectedSourceValue],
  )

  const handleGroupClick = (group: string) => {
    setSelectedGroups([group])
  }

  const isAllAccountsScope =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const canStartUnselectedPriceComparison =
    !selectedSource && accounts.length > 0
  const shouldShowPriceComparisonAction =
    canStartUnselectedPriceComparison ||
    canEnableModelPriceComparison({
      selectedSource,
      sourceCapabilities,
      isAllAccountsSource: isAllAccountsScope,
      sortMode,
      selectedBillingMode,
      selectedGroups,
      showRealPrice,
    })
  const handleEnablePriceComparison = useCallback(() => {
    enableModelPriceComparison({
      isAllAccountsSource: isAllAccountsScope,
      setSelectedSourceValue: handleSelectedSourceValueChange,
      setSortMode,
      setSelectedBillingMode,
      setSelectedGroups,
      setShowRealPrice,
      searchTerm,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
    })
  }, [
    handleSelectedSourceValueChange,
    isAllAccountsScope,
    searchTerm,
    setSelectedBillingMode,
    setSelectedGroups,
    setShowRealPrice,
    setSortMode,
  ])
  const modelDisplayGroupSelectionScope = isAllAccountsScope
    ? MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
    : MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE
  const isModelGroupSelectionInteractive = !isAllAccountsScope

  const handleAccountSummaryClick = (accountId: string) => {
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectModelListFilterScope,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  const hasModelData =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
      ? pricingContexts && pricingContexts.length > 0
      : !!pricingData
  const shouldShowRefreshAction = Boolean(selectedSource && hasModelData)
  const shouldShowHeaderActions =
    shouldShowRefreshAction || shouldShowPriceComparisonAction
  const isRuntimeKeyOnlyFallbackCatalog =
    isFallbackCatalogActive &&
    !!currentAccount &&
    canListAccountRuntimeKeys(currentAccount) &&
    !canCreateAccountKeyResources(currentAccount)
  const hasInferenceRouteFallback = Boolean(
    pricingData?.model_list_source?.inferenceRouteFallback ||
      pricingContexts.some(
        ({ pricing }) => pricing.model_list_source?.inferenceRouteFallback,
      ),
  )
  const showCatalogOnlyNotice =
    isFallbackCatalogActive && !sourceCapabilities.supportsPricing
  const shouldShowSourceSetupEmptyState = !hasAnySources
  const shouldShowSourceSelectionEmptyState =
    !shouldShowSourceSetupEmptyState && !selectedSource

  const providerCatalogFallbackAccounts = useMemo(
    () =>
      Array.from(
        new Map(
          pricingContexts
            .filter(({ pricing }) => isProviderCatalogFallback(pricing))
            .map(({ account }) => [account.id, account]),
        ).values(),
      ),
    [pricingContexts],
  )

  const accountSummaryItems = useMemo(() => {
    const stateByAccountId = new Map(
      (accountQueryStates ?? []).map((state) => [state.account.id, state]),
    )

    return accounts.flatMap((account) => {
      const state = stateByAccountId.get(account.id)
      if (!state) {
        return []
      }
      const count = accountSummaryCountsByAccountId.get(state.account.id)
      if (
        count === undefined &&
        !state.isLoading &&
        !state.errorType &&
        !allAccountsFilterAccountIds.includes(account.id)
      ) {
        return []
      }

      return [
        {
          accountId: state.account.id,
          name: state.account.name,
          count: count ?? 0,
          hasData: state.hasData,
          isLoading: state.isLoading,
          errorType: state.errorType,
          errorMessage: state.errorMessage,
        },
      ]
    })
  }, [
    accountQueryStates,
    accountSummaryCountsByAccountId,
    accounts,
    allAccountsFilterAccountIds,
  ])

  const totalModels = useMemo(() => {
    if (selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      return pricingContexts.reduce((count, context) => {
        const models = context.pricing?.data
        return count + (Array.isArray(models) ? models.length : 0)
      }, 0)
    }

    return Array.isArray(pricingData?.data) ? pricingData.data.length : 0
  }, [pricingContexts, pricingData, selectedSource?.kind])

  return {
    sortedAccounts,
    handleSelectedSourceValueChange,
    handleGroupClick,
    isAllAccountsScope,
    shouldShowPriceComparisonAction,
    handleEnablePriceComparison,
    modelDisplayGroupSelectionScope,
    isModelGroupSelectionInteractive,
    handleAccountSummaryClick,
    hasModelData,
    shouldShowRefreshAction,
    shouldShowHeaderActions,
    isRuntimeKeyOnlyFallbackCatalog,
    hasInferenceRouteFallback,
    showCatalogOnlyNotice,
    shouldShowSourceSetupEmptyState,
    shouldShowSourceSelectionEmptyState,
    providerCatalogFallbackAccounts,
    accountSummaryItems,
    totalModels,
  }
}
