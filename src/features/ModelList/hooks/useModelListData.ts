import { useEffect, useMemo } from "react"

import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"
import { useAccountData } from "~/hooks/useAccountData"

import {
  EMPTY_MODEL_MANAGEMENT_CAPABILITIES,
  isProfileSourceValue,
  resolveModelManagementSource,
  toAccountSourceValue,
  toCatalogOnlyCapabilities,
  toProfileSourceValue,
  type ModelManagementSource,
} from "../modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "../sortModes"
import { useFilteredModels } from "./useFilteredModels"
import { useModelData } from "./useModelData"
import { useModelListState } from "./useModelListState"

const ROUTE_SOURCE_PENDING = Symbol("route-source-pending")

/**
 * Aggregates model list state, data loading, and filtering in one hook.
 * Route-driven source selection lives here so it can wait for profile storage
 * before deciding whether a profile deep link is valid or stale.
 * @returns Combined account data, UI state, model data, and filtered results.
 */
export function useModelListData(routeParams?: Record<string, string>) {
  // Single source of account data
  const { enabledDisplayData } = useAccountData()
  const accounts = useMemo(() => enabledDisplayData || [], [enabledDisplayData])
  const { profiles, isLoading: profilesLoading } = useApiCredentialProfiles()

  // UI state
  const state = useModelListState()
  const {
    selectedSourceValue,
    setSelectedSourceValue,
    selectedBillingMode,
    selectedGroups,
    searchTerm,
    selectedProvider,
    sortMode,
    setSortMode,
    showRealPrice,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
  } = state

  const routeSelectedSourceValue = useMemo(() => {
    const requestedProfileId = routeParams?.profileId?.trim()
    const requestedAccountId = routeParams?.accountId?.trim()

    if (requestedProfileId) {
      const matchedProfile = profiles.find(
        (profile) => profile.id === requestedProfileId,
      )
      if (matchedProfile) {
        return toProfileSourceValue(matchedProfile.id)
      }

      // Profile deep links take precedence, so wait until profile storage
      // finishes loading before falling back to any account target.
      if (profilesLoading) {
        return ROUTE_SOURCE_PENDING
      }

      const matchedAccount = requestedAccountId
        ? accounts.find((account) => account.id === requestedAccountId)
        : null
      return matchedAccount ? toAccountSourceValue(matchedAccount.id) : ""
    }

    if (requestedAccountId) {
      const matchedAccount = accounts.find(
        (account) => account.id === requestedAccountId,
      )
      return matchedAccount ? toAccountSourceValue(matchedAccount.id) : null
    }

    return null
  }, [
    accounts,
    profiles,
    profilesLoading,
    routeParams?.accountId,
    routeParams?.profileId,
  ])

  useEffect(() => {
    if (
      routeSelectedSourceValue === null ||
      routeSelectedSourceValue === ROUTE_SOURCE_PENDING
    ) {
      return
    }

    setSelectedSourceValue(routeSelectedSourceValue)
  }, [routeSelectedSourceValue, setSelectedSourceValue])

  const selectedSource = useMemo<ModelManagementSource | null>(
    () =>
      resolveModelManagementSource({
        value: selectedSourceValue,
        accounts,
        profiles,
      }),
    [accounts, profiles, selectedSourceValue],
  )

  useEffect(() => {
    if (!selectedSourceValue) return
    // Keep unresolved profile-backed selections intact while profile storage is
    // still hydrating so a valid deep link is not cleared prematurely.
    if (profilesLoading && isProfileSourceValue(selectedSourceValue)) return
    if (selectedSource) return

    setSelectedSourceValue("")
  }, [
    profilesLoading,
    selectedSource,
    selectedSourceValue,
    setSelectedSourceValue,
  ])

  useEffect(() => {
    if (selectedSource?.kind === "all-accounts") return
    if (allAccountsFilterAccountIds.length === 0) return
    setAllAccountsFilterAccountIds([])
  }, [
    allAccountsFilterAccountIds,
    selectedSource?.kind,
    setAllAccountsFilterAccountIds,
  ])

  const currentAccount = useMemo(
    () =>
      selectedSource?.kind === "account" ? selectedSource.account : undefined,
    [selectedSource],
  )

  const currentProfile = useMemo(
    () =>
      selectedSource?.kind === "profile" ? selectedSource.profile : undefined,
    [selectedSource],
  )

  const modelData = useModelData({
    selectedSource,
    accounts,
  })

  const isFallbackCatalogActive = modelData.accountFallback?.isActive === true

  const sourceCapabilities = useMemo(() => {
    const baseCapabilities =
      selectedSource?.capabilities ?? EMPTY_MODEL_MANAGEMENT_CAPABILITIES

    // Account-key fallback keeps the same owning account selected, but the
    // rendered catalog is no longer pricing-authoritative.
    return isFallbackCatalogActive
      ? toCatalogOnlyCapabilities(baseCapabilities)
      : baseCapabilities
  }, [isFallbackCatalogActive, selectedSource?.capabilities])

  useEffect(() => {
    if (!sourceCapabilities.supportsPricing) {
      if (sortMode !== MODEL_LIST_SORT_MODES.DEFAULT) {
        setSortMode(MODEL_LIST_SORT_MODES.DEFAULT)
      }
      return
    }

    if (
      sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST &&
      selectedSource?.kind !== "all-accounts"
    ) {
      setSortMode(MODEL_LIST_SORT_MODES.DEFAULT)
    }
  }, [
    selectedSource?.kind,
    setSortMode,
    sortMode,
    sourceCapabilities.supportsPricing,
  ])

  const filteredData = useFilteredModels({
    pricingData: modelData.pricingData,
    pricingContexts: modelData.pricingContexts,
    selectedSource,
    selectedBillingMode,
    selectedGroups,
    searchTerm,
    selectedProvider,
    sortMode,
    showRealPrice,
    accountFilterAccountIds: allAccountsFilterAccountIds,
  })

  return {
    accounts,
    profiles,
    selectedSource,
    currentAccount,
    currentProfile,
    sourceCapabilities,
    isFallbackCatalogActive,
    fallbackTokenName: modelData.accountFallback?.activeTokenName ?? null,

    ...state,
    ...modelData,
    ...filteredData,
  }
}
