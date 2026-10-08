import type { DragEndEvent } from "@dnd-kit/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  moveAccountId,
  projectAccountsByIdOrder,
  replaceVisibleAccountOrder,
  type AccountListDisplayItem,
} from "~/features/AccountManagement/components/AccountList/ordering/accountListOrdering"
import * as accountListDndRuntimeLoader from "~/features/AccountManagement/components/AccountList/ordering/loadAccountListDndRuntime"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import toast from "~/lib/notify"
import { getAccountSortGroup } from "~/services/preferences/utils/sortingPriority"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { SortField } from "~/types"

export const DND_LOAD_STATES = {
  Inactive: "inactive",
  Loading: "loading",
  Ready: "ready",
} as const

export type DndLoadState =
  (typeof DND_LOAD_STATES)[keyof typeof DND_LOAD_STATES]
type AccountListDndRuntime = Awaited<
  ReturnType<typeof accountListDndRuntimeLoader.loadAccountListDndRuntime>
>
const ACCOUNT_REORDER_TOAST_ID = "account-reorder"
const ACCOUNT_REORDER_BOUNDARY_TOAST_ID = "account-reorder-boundary"

/** Keeps DND loading, group constraints and optimistic order in one owner. */
export function useAccountListReordering({
  inSearchMode,
  isBulkMode,
  reorderUnavailableReason,
}: {
  inSearchMode: boolean
  isBulkMode: boolean
  reorderUnavailableReason?: string
}) {
  const { t } = useTranslation(["account", "common"])
  const {
    displayData,
    sortedData,
    pinnedAccountIds,
    isManualSortFeatureEnabled,
    handleSort,
    handleReorder,
    clearSortConfig,
    sortField,
  } = useAccountDataContext()
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [isReorderSaving, setIsReorderSaving] = useState(false)
  const [reorderAccountIds, setReorderAccountIds] = useState<string[] | null>(
    null,
  )
  const [dndLoadState, setDndLoadState] = useState<DndLoadState>(
    DND_LOAD_STATES.Inactive,
  )
  const dndLoadPromiseRef = useRef<Promise<AccountListDndRuntime> | null>(null)
  const dndRuntimeRef = useRef<AccountListDndRuntime | null>(null)
  const isReorderSavingRef = useRef(false)
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const accountsInDisplayOrder = useMemo(
    () =>
      reorderAccountIds === null
        ? sortedData
        : projectAccountsByIdOrder(displayData, reorderAccountIds),
    [displayData, reorderAccountIds, sortedData],
  )
  const pinnedAccountIdSet = useMemo(
    () => new Set(pinnedAccountIds),
    [pinnedAccountIds],
  )

  useEffect(() => {
    if (displayData.length === 0) {
      setIsReorderMode(false)
      setReorderAccountIds(null)
    }
  }, [displayData.length])

  useEffect(() => {
    if (inSearchMode || !isManualSortFeatureEnabled) {
      setIsReorderMode(false)
      setReorderAccountIds(null)
    }
  }, [inSearchMode, isManualSortFeatureEnabled])

  const dragDisabled =
    !isReorderMode ||
    inSearchMode ||
    !isManualSortFeatureEnabled ||
    isBulkMode ||
    isReorderSaving
  const shouldRenderSortableList =
    isReorderMode &&
    isManualSortFeatureEnabled &&
    dndLoadState === DND_LOAD_STATES.Ready &&
    dndRuntimeRef.current !== null

  const resolvedReorderDisabledReason = isReorderMode
    ? null
    : reorderUnavailableReason ??
      (isBulkMode
        ? t("account:list.reorderUnavailableWhileBulk")
        : inSearchMode
          ? t("account:list.reorderUnavailableWhileSearch")
          : !isManualSortFeatureEnabled
            ? t("account:list.reorderUnavailableInSettings")
            : null)

  const accountListAnalyticsBaseContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  }

  const onDragEnd = (
    event: DragEndEvent,
    groupedDisplayItems: AccountListDisplayItem[],
  ) => {
    const sortedIds = groupedDisplayItems.map((item) => item.result.account.id)
    if (
      dragDisabled ||
      reorderAccountIds === null ||
      isReorderSavingRef.current
    ) {
      return
    }
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedIds.indexOf(active.id as string)
    const newIndex = sortedIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const activeAccount = groupedDisplayItems[oldIndex]?.result.account
    const overAccount = groupedDisplayItems[newIndex]?.result.account
    const crossedGroupBoundary =
      activeAccount !== undefined &&
      overAccount !== undefined &&
      getAccountSortGroup(activeAccount, pinnedAccountIdSet) !==
        getAccountSortGroup(overAccount, pinnedAccountIdSet)

    if (crossedGroupBoundary) {
      toast.warning(t("account:list.reorderGroupBoundary"), {
        id: ACCOUNT_REORDER_BOUNDARY_TOAST_ID,
      })
      return
    }

    const itemCount = sortedIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ReorderAccounts,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)
    const previousAccountIds = accountsInDisplayOrder.map(
      (account) => account.id,
    )
    const nextVisibleIds = moveAccountId(sortedIds, oldIndex, newIndex)
    const nextAccountIds = replaceVisibleAccountOrder(
      previousAccountIds,
      nextVisibleIds,
    )
    const clearsFieldSort = sortField !== null

    isReorderSavingRef.current = true
    setIsReorderSaving(true)
    setReorderAccountIds(nextAccountIds)

    void Promise.resolve(handleReorder(nextVisibleIds))
      .then(() => {
        if (clearsFieldSort) {
          clearSortConfig()
        }
        toast.success(
          t(
            clearsFieldSort
              ? "account:list.reorderSuccessFieldSortCleared"
              : "account:list.reorderSuccess",
          ),
          {
            id: ACCOUNT_REORDER_TOAST_ID,
          },
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            itemCount,
          },
        })
      })
      .catch(() => {
        setReorderAccountIds(previousAccountIds)
        toast.error(t("account:list.reorderFailed"), {
          id: ACCOUNT_REORDER_TOAST_ID,
        })
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            itemCount,
          },
        })
      })
      .finally(() => {
        isReorderSavingRef.current = false
        if (isMountedRef.current) {
          setIsReorderSaving(false)
        }
      })
  }

  const ensureDndReady = useCallback(() => {
    if (!isManualSortFeatureEnabled) {
      return Promise.resolve(null)
    }

    if (dndRuntimeRef.current !== null) {
      if (dndLoadState !== DND_LOAD_STATES.Ready) {
        setDndLoadState(DND_LOAD_STATES.Ready)
      }
      return Promise.resolve(dndRuntimeRef.current)
    }

    if (dndLoadPromiseRef.current !== null) {
      if (dndLoadState === DND_LOAD_STATES.Inactive) {
        setDndLoadState(DND_LOAD_STATES.Loading)
      }
      return dndLoadPromiseRef.current
    }

    setDndLoadState(DND_LOAD_STATES.Loading)

    const loadPromise = accountListDndRuntimeLoader
      .loadAccountListDndRuntime()
      .then((runtime) => {
        dndRuntimeRef.current = runtime
        dndLoadPromiseRef.current = Promise.resolve(runtime)
        if (isMountedRef.current) {
          setDndLoadState(DND_LOAD_STATES.Ready)
        }
        return runtime
      })
      .catch((error) => {
        dndLoadPromiseRef.current = null
        if (isMountedRef.current) {
          setDndLoadState(DND_LOAD_STATES.Inactive)
        }
        throw error
      })

    dndLoadPromiseRef.current = loadPromise
    return loadPromise
  }, [dndLoadState, isManualSortFeatureEnabled])

  const handleReorderModeEnter = useCallback(() => {
    if (resolvedReorderDisabledReason !== null) return

    setReorderAccountIds(sortedData.map((account) => account.id))
    setIsReorderMode(true)
    void ensureDndReady().catch(() => {
      if (isMountedRef.current) {
        setIsReorderMode(false)
        setReorderAccountIds(null)
        toast.error(t("account:list.reorderLoadFailed"))
      }
    })
  }, [ensureDndReady, resolvedReorderDisabledReason, sortedData, t])

  const handleReorderModeExit = useCallback(() => {
    if (isReorderSavingRef.current) return
    setIsReorderMode(false)
    setReorderAccountIds(null)
  }, [])

  const handleListSort = useCallback(
    (field: SortField) => {
      if (isReorderSavingRef.current) return
      setIsReorderMode(false)
      setReorderAccountIds(null)
      handleSort(field)
    },
    [handleSort],
  )

  return {
    accountsInDisplayOrder,
    pinnedAccountIdSet,
    isReorderMode,
    isReorderSaving,
    dndLoadState,
    dndRuntime: dndRuntimeRef.current,
    dragDisabled,
    shouldRenderSortableList,
    resolvedReorderDisabledReason,
    onDragEnd,
    handleReorderModeEnter,
    handleReorderModeExit,
    handleListSort,
    resetReorderMode: () => {
      setIsReorderMode(false)
      setReorderAccountIds(null)
    },
  }
}
