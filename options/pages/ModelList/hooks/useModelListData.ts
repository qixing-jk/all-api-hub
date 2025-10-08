import { useMemo } from "react"

import { useAccountData } from "~/hooks/useAccountData"

import { useFilteredModels } from "./useFilteredModels"
import { useModelData } from "./useModelData"
import { useModelListState } from "./useModelListState"


export function useModelListData() {
  // Single source of account data
  const { displayData } = useAccountData()
  const accounts = useMemo(() => displayData || [], [displayData])

  // UI state
  const state = useModelListState()

  // Compute current account
  const currentAccount = useMemo(
    () => accounts.find((acc) => acc.id === state.selectedAccount),
    [accounts, state.selectedAccount]
  )

  // Data loading (no longer calls useAccountData internally)
  const modelData = useModelData({
    selectedAccount: state.selectedAccount,
    accounts,
    selectedGroup: state.selectedGroup
  })

  // Filtering
  const filteredData = useFilteredModels({
    pricingData: modelData.pricingData,
    currentAccount,
    selectedGroup: state.selectedGroup,
    searchTerm: state.searchTerm,
    selectedProvider: state.selectedProvider
  })

  // Return unified state
  return {
    // Account data
    accounts,
    currentAccount,

    // Spread UI state
    ...state,

    // Spread model data
    ...modelData,

    // Spread filtered data
    ...filteredData
  }
}
