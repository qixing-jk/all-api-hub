import { useCallback, useEffect, useMemo, useState } from "react"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_CUSTOM_CHECK_IN_URL,
  DATA_TYPE_CUSTOM_REDEEM_URL,
  DATA_TYPE_INCOME,
} from "~/constants"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { replaceIdListSubset } from "~/services/accounts/accountEntryLayoutPolicy"
import { accountEntryLayout } from "~/services/accounts/accountStorage/accountEntryLayout"
import {
  createAccountContextBoostResolver,
  createDynamicSortComparator,
  type OpenTabMatchTiers,
} from "~/services/preferences/utils/sortingPriority"
import type {
  ActiveSortField,
  DisplaySiteData,
  SiteAccount,
  SiteBookmark,
  SortField,
  SortOrder,
} from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDataContext")
/** Own visible ordering, optimistic layout updates and persisted pinning. */
export function useAccountEntryLayout({
  displayData,
  bookmarks,
  detectedAccount,
  matchedTabTiers,
  snapshot,
}: {
  displayData: DisplaySiteData[]
  bookmarks: SiteBookmark[]
  detectedAccount: SiteAccount | null
  matchedTabTiers: OpenTabMatchTiers
  snapshot?: { orderedIds: string[]; pinnedIds: string[] }
}) {
  const {
    currencyType,
    showTodayCashflow,
    sortField: initialSortField,
    sortOrder: initialSortOrder,
    updateSortConfig,
    sortingPriorityConfig,
  } = useUserPreferencesContext()
  const [orderedAccountIds, setOrderedAccountIds] = useState<string[]>(
    snapshot?.orderedIds ?? [],
  )
  const [pinnedAccountIds, setPinnedAccountIds] = useState<string[]>(
    snapshot?.pinnedIds ?? [],
  )
  const [appliedSnapshot, setAppliedSnapshot] = useState(snapshot)
  // Reconcile before children commit: account facts and their persisted layout
  // must appear together, while optimistic edits survive unrelated renders.
  if (snapshot !== appliedSnapshot) {
    setAppliedSnapshot(snapshot)
    if (snapshot) {
      setOrderedAccountIds(snapshot.orderedIds)
      setPinnedAccountIds(snapshot.pinnedIds)
    }
  }

  const [selectedSortField, setSortField] =
    useState<ActiveSortField>(initialSortField)
  const sortField =
    showTodayCashflow === false &&
    (selectedSortField === DATA_TYPE_CONSUMPTION ||
      selectedSortField === DATA_TYPE_INCOME)
      ? DATA_TYPE_BALANCE
      : selectedSortField
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const handleSort = useCallback(
    (field: SortField) => {
      if (
        showTodayCashflow === false &&
        (field === DATA_TYPE_CONSUMPTION || field === DATA_TYPE_INCOME)
      ) {
        return
      }

      let newOrder: SortOrder
      if (sortField === field) {
        newOrder = sortOrder === "asc" ? "desc" : "asc"
        setSortOrder(newOrder)
      } else {
        newOrder =
          field === DATA_TYPE_CREATED_AT ||
          field === DATA_TYPE_CHECK_IN_REQUIREMENT ||
          field === DATA_TYPE_CUSTOM_CHECK_IN_URL ||
          field === DATA_TYPE_CUSTOM_REDEEM_URL
            ? "desc"
            : "asc"
        setSortField(field)
        setSortOrder(newOrder)
      }
      updateSortConfig(field, newOrder)
    },
    [showTodayCashflow, sortField, sortOrder, updateSortConfig],
  )

  const clearSortConfig = useCallback(() => {
    setSortField(null)
    void updateSortConfig(null, sortOrder)
  }, [sortOrder, updateSortConfig])

  useEffect(() => {
    if (showTodayCashflow !== false) return

    if (
      selectedSortField !== DATA_TYPE_CONSUMPTION &&
      selectedSortField !== DATA_TYPE_INCOME
    ) {
      return
    }

    const fallbackField: SortField = DATA_TYPE_BALANCE
    setSortField(fallbackField)
    void updateSortConfig(fallbackField, sortOrder)
  }, [showTodayCashflow, selectedSortField, sortOrder, updateSortConfig])

  const handleReorder = useCallback(
    async (ids: string[]) => {
      // Preserve the fixed pinned segment while saving the visible manual order.
      const pinnedSet = new Set(pinnedAccountIds)
      const visibleAccountIdSet = new Set(ids)
      const allAccountIdSet = new Set(displayData.map((account) => account.id))
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]
      const previousPinnedIds = pinnedAccountIds
      const previousOrderedIds = orderedAccountIds

      // Check if pinned order has changed
      const pinnedAccountsInState = pinnedAccountIds.filter((id) =>
        visibleAccountIdSet.has(id),
      )
      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedAccountsInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedAccountsInState[index])

      const optimisticPinnedIds = shouldUpdatePinnedOrder
        ? replaceIdListSubset({
            existingIds: previousPinnedIds,
            subsetIdSet: visibleAccountIdSet,
            nextSubsetIds: pinnedSegment,
          })
        : previousPinnedIds
      const optimisticOrderedIds = replaceIdListSubset({
        existingIds: previousOrderedIds,
        subsetIdSet: visibleAccountIdSet,
        nextSubsetIds: merged,
      })

      setPinnedAccountIds(optimisticPinnedIds)
      setOrderedAccountIds(optimisticOrderedIds)

      try {
        const didPersistOrder = await accountEntryLayout.setAccountListOrder({
          pinnedIds: optimisticPinnedIds.filter((id) =>
            allAccountIdSet.has(id),
          ),
          orderedIds: optimisticOrderedIds.filter((id) =>
            allAccountIdSet.has(id),
          ),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist account order")
        }
      } catch (error) {
        logger.error("Failed to persist account reorder", { ids, error })
        setPinnedAccountIds(previousPinnedIds)
        setOrderedAccountIds(previousOrderedIds)
        throw error
      }

      try {
        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountEntryLayout.getPinnedList(),
          accountEntryLayout.getOrderedList(),
        ])

        setPinnedAccountIds(nextPinnedIds)
        setOrderedAccountIds(nextOrderedIds)
      } catch (error) {
        logger.warn("Persisted account reorder but failed to refresh order", {
          error,
        })
      }
    },
    [displayData, orderedAccountIds, pinnedAccountIds],
  )

  const handleBookmarkReorder = useCallback(
    async (ids: string[]) => {
      const pinnedSet = new Set(pinnedAccountIds)
      const visibleBookmarkIdSet = new Set(ids)
      const allBookmarkIdSet = new Set(bookmarks.map((bookmark) => bookmark.id))
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]
      const previousPinnedIds = pinnedAccountIds
      const previousOrderedIds = orderedAccountIds

      const pinnedBookmarksInState = pinnedAccountIds.filter((id) =>
        visibleBookmarkIdSet.has(id),
      )

      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedBookmarksInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedBookmarksInState[index])

      const optimisticPinnedIds = shouldUpdatePinnedOrder
        ? replaceIdListSubset({
            existingIds: previousPinnedIds,
            subsetIdSet: visibleBookmarkIdSet,
            nextSubsetIds: pinnedSegment,
          })
        : previousPinnedIds
      const optimisticOrderedIds = replaceIdListSubset({
        existingIds: previousOrderedIds,
        subsetIdSet: visibleBookmarkIdSet,
        nextSubsetIds: merged,
      })

      setPinnedAccountIds(optimisticPinnedIds)
      setOrderedAccountIds(optimisticOrderedIds)

      try {
        if (shouldUpdatePinnedOrder) {
          const didPersistPinned = await accountEntryLayout.setPinnedListSubset(
            {
              entryType: "bookmark",
              ids: optimisticPinnedIds.filter((id) => allBookmarkIdSet.has(id)),
            },
          )

          if (!didPersistPinned) {
            throw new Error("Failed to persist pinned bookmark order")
          }
        }

        const didPersistOrder = await accountEntryLayout.setOrderedListSubset({
          entryType: "bookmark",
          ids: optimisticOrderedIds.filter((id) => allBookmarkIdSet.has(id)),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist bookmark order")
        }

        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountEntryLayout.getPinnedList(),
          accountEntryLayout.getOrderedList(),
        ])

        setPinnedAccountIds(nextPinnedIds)
        setOrderedAccountIds(nextOrderedIds)
      } catch (error) {
        logger.error("Failed to persist bookmark reorder", { ids, error })
        setPinnedAccountIds(previousPinnedIds)
        setOrderedAccountIds(previousOrderedIds)
      }
    },
    [bookmarks, orderedAccountIds, pinnedAccountIds],
  )

  const isAccountPinned = useCallback(
    (id: string) => pinnedAccountIds.includes(id),
    [pinnedAccountIds],
  )

  const pinAccount = useCallback(async (id: string) => {
    const success = await accountEntryLayout.pinAccount(id)
    if (success) {
      setPinnedAccountIds((prev) => [
        id,
        ...prev.filter((pinnedId) => pinnedId !== id),
      ])
    }
    return success
  }, [])

  const unpinAccount = useCallback(async (id: string) => {
    const success = await accountEntryLayout.unpinAccount(id)
    if (success) {
      setPinnedAccountIds((prev) => prev.filter((pinnedId) => pinnedId !== id))
    }
    return success
  }, [])

  const togglePinAccount = useCallback(
    async (id: string) => {
      if (isAccountPinned(id)) {
        return unpinAccount(id)
      }
      return pinAccount(id)
    },
    [isAccountPinned, pinAccount, unpinAccount],
  )

  const getAccountContextBoost = useMemo(
    () =>
      createAccountContextBoostResolver(
        sortingPriorityConfig,
        detectedAccount?.id,
        matchedTabTiers,
      ),
    [sortingPriorityConfig, detectedAccount?.id, matchedTabTiers],
  )

  const sortedData = useMemo(() => {
    const manualOrderIndices: Record<string, number> = {}
    orderedAccountIds.forEach((id, index) => {
      manualOrderIndices[id] = index
    })
    const comparator = createDynamicSortComparator(
      sortingPriorityConfig,
      detectedAccount,
      sortField,
      currencyType,
      sortOrder,
      matchedTabTiers,
      pinnedAccountIds,
      manualOrderIndices,
    )
    return [...displayData].sort(comparator)
  }, [
    displayData,
    sortingPriorityConfig,
    detectedAccount,
    sortField,
    currencyType,
    sortOrder,
    matchedTabTiers,
    pinnedAccountIds,
    orderedAccountIds,
  ])

  return {
    orderedAccountIds,
    pinnedAccountIds,
    sortedData,
    getAccountContextBoost,
    sortField,
    sortOrder,
    handleSort,
    clearSortConfig,
    handleReorder,
    handleBookmarkReorder,
    isAccountPinned,
    pinAccount,
    unpinAccount,
    togglePinAccount,
  }
}
