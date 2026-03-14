import { useEffect, useMemo } from "react"

import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"
import { useAccountData } from "~/hooks/useAccountData"

import {
  EMPTY_MODEL_MANAGEMENT_CAPABILITIES,
  isProfileSourceValue,
  resolveModelManagementSource,
  type ModelManagementSource,
} from "../modelManagementSources"
import { useFilteredModels } from "./useFilteredModels"
import { useModelData } from "./useModelData"
import { useModelListState } from "./useModelListState"

/**
 * Aggregates model list state, data loading, and filtering in one hook.
 * @returns Combined account data, UI state, model data, and filtered results.
 */
export function useModelListData() {
  // Single source of account data
  const { enabledDisplayData } = useAccountData()
  const accounts = useMemo(() => enabledDisplayData || [], [enabledDisplayData])
  const { profiles, isLoading: profilesLoading } = useApiCredentialProfiles()

  // UI state
  const state = useModelListState()
  const {
    selectedSourceValue,
    setSelectedSourceValue,
    selectedGroup,
    searchTerm,
    selectedProvider,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
  } = state

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
    if (allAccountsFilterAccountId === null) return
    setAllAccountsFilterAccountId(null)
  }, [
    allAccountsFilterAccountId,
    selectedSource?.kind,
    setAllAccountsFilterAccountId,
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

  const sourceCapabilities =
    selectedSource?.capabilities ?? EMPTY_MODEL_MANAGEMENT_CAPABILITIES

  const modelData = useModelData({
    selectedSource,
    accounts,
  })

  const filteredData = useFilteredModels({
    pricingData: modelData.pricingData,
    pricingContexts: modelData.pricingContexts,
    selectedSource,
    selectedGroup,
    searchTerm,
    selectedProvider,
    accountFilterAccountId: allAccountsFilterAccountId,
  })

  return {
    accounts,
    profiles,
    selectedSource,
    currentAccount,
    currentProfile,
    sourceCapabilities,

    ...state,
    ...modelData,
    ...filteredData,
  }
}
