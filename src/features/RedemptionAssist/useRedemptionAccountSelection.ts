import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { useAccountSearch } from "~/features/AccountManagement/components/AccountList/filtering/useAccountSearch"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "~/services/redemption/contracts"

/** Owns the searchable picker selection, keyboard navigation and row scrolling. */
export function useRedemptionAccountSelection(
  accounts: RedemptionAccountCandidate[],
  onSelect: (account: RedemptionAccountCandidate | null) => void,
) {
  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(accounts)

  const displayedAccounts = useMemo<RedemptionAccountCandidate[]>(() => {
    const matches = !inSearchMode
      ? accounts
      : searchResults
          .map((result) =>
            accounts.find((account) => account.id === result.account.id),
          )
          .filter((account): account is RedemptionAccountCandidate =>
            Boolean(account),
          )
    return [...matches].sort(
      (a, b) =>
        Number(
          a.automaticRedemptionSupport.status ===
            REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
        ) -
        Number(
          b.automaticRedemptionSupport.status ===
            REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
        ),
    )
  }, [accounts, inSearchMode, searchResults])

  const selectableAccounts = useMemo(
    () =>
      displayedAccounts.filter(
        (account) =>
          account.automaticRedemptionSupport.status ===
          REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
      ),
    [displayedAccounts],
  )

  const [selectedId, setSelectedId] = useState<string | null>(
    selectableAccounts[0]?.id ?? null,
  )

  const selectedAccount = useMemo(() => {
    if (!selectedId) return selectableAccounts[0] ?? null
    return (
      selectableAccounts.find((account) => account.id === selectedId) ??
      selectableAccounts[0] ??
      null
    )
  }, [selectableAccounts, selectedId])

  const accountRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!selectableAccounts.some((account) => account.id === selectedId)) {
      setSelectedId(selectableAccounts[0]?.id ?? null)
    }
  }, [selectableAccounts, selectedId])

  useEffect(() => {
    if (!selectedAccount) return
    const el = accountRefs.current.get(selectedAccount.id)
    el?.scrollIntoView?.({ block: "nearest" })
  }, [selectedAccount])

  const moveSelection = (direction: -1 | 1) => {
    if (selectableAccounts.length === 0) return

    const currentIndex = selectableAccounts.findIndex(
      (account) => account.id === selectedAccount?.id,
    )
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex =
      (startIndex + direction + selectableAccounts.length) %
      selectableAccounts.length

    setSelectedId(selectableAccounts[nextIndex]?.id ?? null)
  }

  const handleKeyDownCapture = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.altKey || e.ctrlKey || e.metaKey) return

    if (
      e.key === "Enter" &&
      e.target instanceof HTMLElement &&
      e.target.closest("a, button")
    ) {
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      e.stopPropagation()
      moveSelection(1)
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      e.stopPropagation()
      moveSelection(-1)
      return
    }

    if (e.key === "Enter" && selectedAccount) {
      e.preventDefault()
      e.stopPropagation()
      onSelect(selectedAccount)
    }
  }

  return {
    query,
    setQuery,
    clearSearch,
    displayedAccounts,
    selectableAccounts,
    selectedAccount,
    setSelectedId,
    accountRefs,
    handleKeyDownCapture,
  }
}
