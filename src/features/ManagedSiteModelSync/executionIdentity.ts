import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import type { ExecutionHistoryItemResult } from "~/types/managedSiteModelSync"

/** Unscoped historical ids are display-only and can never become execution targets. */
export const getModelSyncHistoryItemKey = (item: ExecutionHistoryItemResult) =>
  item.resourceRef
    ? getManagedResourceRefKey(item.resourceRef)
    : JSON.stringify(["legacy", item.legacyResourceId, item.channelName])

/** Displays native or legacy identifiers without assigning a missing resource scope. */
export const getModelSyncHistoryResourceId = (
  item: ExecutionHistoryItemResult,
) => item.resourceRef?.resourceId ?? item.legacyResourceId ?? "—"
