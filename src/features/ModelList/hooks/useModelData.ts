import { useMemo } from "react"

import type {
  UseModelDataProps,
  UseModelDataReturn,
} from "~/features/ModelList/hooks/modelDataTypes"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/catalog/modelManagementSources"
import { useAllAccountsModelData } from "~/features/ModelList/hooks/useAllAccountsModelData"
import { useProfileModelData } from "~/features/ModelList/hooks/useProfileModelData"
import { useSingleAccountModelData } from "~/features/ModelList/hooks/useSingleAccountModelData"

/**
 * Provides model pricing data for either a single account or all accounts.
 * @param params Hook input parameters.
 * @param params.selectedSource Selected model-management source.
 * @param params.accounts Available accounts list.
 * @returns Pricing data, contexts, loading state, and query summaries.
 */
export function useModelData(params: UseModelDataProps): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const safeDisplayData = useMemo(() => accounts || [], [accounts])
  const isAllAccounts =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const isProfileSource =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE

  const singleAccountResult = useSingleAccountModelData({
    selectedSource: isAllAccounts || isProfileSource ? null : selectedSource,
    accounts: safeDisplayData,
  })

  const allAccountsResult = useAllAccountsModelData(
    safeDisplayData,
    isAllAccounts,
  )

  const profileResult = useProfileModelData(
    isProfileSource ? selectedSource : null,
  )

  if (isAllAccounts) return allAccountsResult
  if (isProfileSource) return profileResult
  return singleAccountResult
}
