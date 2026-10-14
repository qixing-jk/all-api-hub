import { formatOptionalSkPrefixSiteTokenComparableKey } from "~/services/accountTokens/apiTokenKey"
import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  type ExecutableManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import { normalizeList } from "~/utils/core/string"

/** Reprojects transient duplicates; an explicit selection alone reserves identities. */
export function skipManagedSiteBatchDuplicates(
  items: ManagedSiteTokenBatchExportPreviewItem[],
  managedSite: ManagedSiteCapabilities,
  selectedItemIds?: ReadonlySet<string>,
): ManagedSiteTokenBatchExportPreviewItem[] {
  const buckets = new Map<
    string,
    Map<string, ExecutableManagedSiteTokenBatchExportPreviewItem>
  >()
  const toComparableKey = (key: string) =>
    formatOptionalSkPrefixSiteTokenComparableKey(key, managedSite.siteType)
  const restoredItems = items.map((item) => {
    if (!item.duplicateOfItemId) return item
    const {
      duplicateOfItemId: _duplicateOfItemId,
      duplicateOfItemName: _duplicateOfItemName,
      batchDuplicateOriginalStatus,
      ...original
    } = item
    return {
      ...original,
      status:
        item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED
          ? batchDuplicateOriginalStatus ??
            (item.warningCodes.length
              ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
              : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY)
          : item.status,
    }
  })
  const orderedItems = selectedItemIds
    ? [
        ...restoredItems.filter((item) => selectedItemIds.has(item.id)),
        ...restoredItems.filter((item) => !selectedItemIds.has(item.id)),
      ]
    : restoredItems
  const projectedById = new Map<
    string,
    ManagedSiteTokenBatchExportPreviewItem
  >()
  for (const item of orderedItems) {
    const projected = projectItem(item)
    projectedById.set(item.id, projected)
  }
  return restoredItems.map((item) => projectedById.get(item.id) ?? item)

  /** Projects a row against identities reserved by the selected representatives. */
  function projectItem(item: ManagedSiteTokenBatchExportPreviewItem) {
    if (!isExecutableManagedSiteTokenBatchExportPreviewItem(item)) return item
    if (!hasUsableManagedSiteChannelKey(item.draft.key)) return item
    const models = normalizeList(item.draft.models).sort()
    if (
      managedSite.matching.exactMatchBasis !==
        MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY &&
      models.length === 0
    )
      return item
    const bucketKey = JSON.stringify([
      normalizeManagedSiteChannelBaseUrl(item.draft.base_url),
      ...(managedSite.matching.exactMatchBasis ===
      MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY
        ? []
        : [models]),
    ])
    const bucket =
      buckets.get(bucketKey) ??
      new Map<string, ExecutableManagedSiteTokenBatchExportPreviewItem>()
    const duplicate = bucket.get(toComparableKey(item.draft.key))
    if (duplicate) {
      return {
        ...item,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        duplicateOfItemId: duplicate.id,
        duplicateOfItemName: `${duplicate.accountName} | ${duplicate.runtimeKeyName}`,
        batchDuplicateOriginalStatus:
          item.status === MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY
            ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY
            : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      }
    }
    if (selectedItemIds && !selectedItemIds.has(item.id)) return item
    // Match the existing resolver's newline/comma-separated destination keys.
    for (const key of item.draft.key
      .split(/[\n,]/)
      .map(toComparableKey)
      .filter(Boolean)) {
      if (!bucket.has(key)) bucket.set(key, item)
    }
    buckets.set(bucketKey, bucket)
    return item
  }
}
