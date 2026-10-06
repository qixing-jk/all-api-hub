import {
  MODEL_SYNC_FILTER_STATUSES,
  type FilterStatus,
} from "~/features/ManagedSiteModelSync/components/FilterBar"
import { getModelSyncHistoryResourceId } from "~/features/ManagedSiteModelSync/executionIdentity"
import { type ProductAnalyticsStatusKind } from "~/services/productAnalytics/contracts"
import type { ExecutionHistoryItemResult } from "~/types/managedSiteModelSync"

export const TAB_INDEX = {
  history: 0,
  manual: 1,
} as const

export const TAB_VALUE = {
  history: "history",
  manual: "manual",
} as const

export type ManagedSiteModelSyncTabValue =
  (typeof TAB_VALUE)[keyof typeof TAB_VALUE]

export const getTabValueFromIndex = (
  index: number,
): ManagedSiteModelSyncTabValue =>
  index === TAB_INDEX.manual ? TAB_VALUE.manual : TAB_VALUE.history

export const getStatusKindFromFilterStatus = (
  status: FilterStatus,
): ProductAnalyticsStatusKind | undefined =>
  status === MODEL_SYNC_FILTER_STATUSES.All
    ? undefined
    : status === MODEL_SYNC_FILTER_STATUSES.Success
      ? "healthy"
      : "error"

export const filterExecutionItems = (
  items: ExecutionHistoryItemResult[],
  status: FilterStatus,
  keyword: string,
) =>
  items.filter((item) => {
    if (status === MODEL_SYNC_FILTER_STATUSES.Success && !item.ok) return false
    if (status === MODEL_SYNC_FILTER_STATUSES.Failed && item.ok) return false

    if (keyword) {
      const normalizedKeyword = keyword.toLowerCase()
      return (
        item.channelName.toLowerCase().includes(normalizedKeyword) ||
        getModelSyncHistoryResourceId(item)
          .toLowerCase()
          .includes(normalizedKeyword) ||
        item.message?.toLowerCase().includes(normalizedKeyword)
      )
    }

    return true
  })
