import type { ModelListAccountErrorType } from "~/features/ModelList/modelDataStates"
import type { DisplaySiteData } from "~/types"

type AccountQueryStateLike = {
  account: Pick<DisplaySiteData, "id">
  isLoading?: boolean
  hasError?: boolean
  errorType?: ModelListAccountErrorType
}

interface SortModelListAccountsParams {
  accounts: DisplaySiteData[]
  accountQueryStates: AccountQueryStateLike[]
  accountSummaryCountsByAccountId: Map<string, number>
}

/** Returns true once every all-accounts query has settled. */
function hasAccountLoadingCompleted(
  accounts: DisplaySiteData[],
  accountQueryStates: AccountQueryStateLike[],
) {
  if (accounts.length === 0) {
    return false
  }

  return accounts.every((account) =>
    accountQueryStates.some(
      (state) => state.account.id === account.id && !state.isLoading,
    ),
  )
}

/** Normalizes account failures across explicit flags and typed error states. */
function hasAccountLoadError(state?: AccountQueryStateLike) {
  return Boolean(state?.hasError || state?.errorType)
}

/**
 * Sorts model-list accounts once all all-accounts refreshes have settled.
 * Successful accounts are ordered by model count descending, while failed
 * accounts are always pushed to the end. Until every account finishes loading,
 * the original account order is preserved to avoid a jumping selector.
 */
export function sortModelListAccounts({
  accounts,
  accountQueryStates,
  accountSummaryCountsByAccountId,
}: SortModelListAccountsParams) {
  if (!hasAccountLoadingCompleted(accounts, accountQueryStates)) {
    return accounts
  }

  const originalIndexByAccountId = new Map(
    accounts.map((account, index) => [account.id, index]),
  )
  const queryStateByAccountId = new Map(
    accountQueryStates.map((state) => [state.account.id, state]),
  )

  return [...accounts].sort((leftAccount, rightAccount) => {
    const leftState = queryStateByAccountId.get(leftAccount.id)
    const rightState = queryStateByAccountId.get(rightAccount.id)
    const leftHasError = hasAccountLoadError(leftState)
    const rightHasError = hasAccountLoadError(rightState)

    if (leftHasError !== rightHasError) {
      return leftHasError ? 1 : -1
    }

    const countDifference =
      (accountSummaryCountsByAccountId.get(rightAccount.id) ?? 0) -
      (accountSummaryCountsByAccountId.get(leftAccount.id) ?? 0)

    if (countDifference !== 0) {
      return countDifference
    }

    return (
      (originalIndexByAccountId.get(leftAccount.id) ?? 0) -
      (originalIndexByAccountId.get(rightAccount.id) ?? 0)
    )
  })
}
