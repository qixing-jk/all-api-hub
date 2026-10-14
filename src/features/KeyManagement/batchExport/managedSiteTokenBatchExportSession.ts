import {
  applyNormalizedModelsToPreviewItem,
  countPreviewItems,
  shouldSelectPreviewItemByDefault,
} from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportPreview"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { skipManagedSiteBatchDuplicates } from "~/services/managedSites/batchImport/tokenBatchImportDuplicates"
import type {
  ManagedSiteBatchImportIntent,
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
  ManagedSiteTokenBatchExportPreview,
} from "~/types/managedSiteTokenBatchExport"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  isResolvedManagedSiteTokenBatchExportItemInput,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"

export const MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS = {
  TARGET_CHANGED: "target-changed",
  VERIFICATION: "verification",
  UPSTREAM: "upstream",
} as const

export type ManagedSiteBatchExecutionFailure =
  | { kind: typeof MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS.TARGET_CHANGED }
  | {
      kind:
        | typeof MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS.VERIFICATION
        | typeof MANAGED_SITE_BATCH_EXECUTION_FAILURE_KINDS.UPSTREAM
      message: string
    }

export const shouldConfirmManagedSiteTokenBatchExport = (
  intent: ManagedSiteBatchImportIntent,
) =>
  intent.verification === MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE

export const getManagedSiteTokenBatchExportRetryItemIds = (
  result: ManagedSiteTokenBatchExportExecutionResult,
) =>
  result.items
    .filter(
      (item) =>
        item.result ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
    )
    .map((item) => item.id)

/** Restricts retry preparation to failed inputs while leaving normal refreshes intact. */
export const selectManagedSiteTokenBatchPreviewInputs = (
  inputs: ManagedSiteTokenBatchExportItemInput[],
  retryItemIds: ReadonlySet<string> | null,
) =>
  retryItemIds
    ? inputs.filter((input) =>
        retryItemIds.has(
          isResolvedManagedSiteTokenBatchExportItemInput(input)
            ? input.runtimeKey.id
            : input.id,
        ),
      )
    : inputs

/** Keeps untouched history and its order when a fresh retry preview covers only failed rows. */
export const mergeManagedSiteTokenBatchRetryPreview = (
  previous: ManagedSiteTokenBatchExportPreview | null,
  next: ManagedSiteTokenBatchExportPreview,
  retryItemIds: ReadonlySet<string> | null,
): ManagedSiteTokenBatchExportPreview => {
  if (!retryItemIds || !previous) return next
  const nextItemsById = new Map(next.items.map((item) => [item.id, item]))
  return {
    ...next,
    items: previous.items.map((item) =>
      retryItemIds.has(item.id) ? nextItemsById.get(item.id) ?? item : item,
    ),
    totalCount: previous.items.length,
  }
}

export const mergeManagedSiteTokenBatchExportExecutionResults = (
  previous: ManagedSiteTokenBatchExportExecutionResult | null,
  next: ManagedSiteTokenBatchExportExecutionResult,
  retriedItemIds: ReadonlySet<string> = new Set(),
): ManagedSiteTokenBatchExportExecutionResult => {
  if (!previous) return next

  const itemsById = new Map(previous.items.map((item) => [item.id, item]))
  for (const retriedItemId of retriedItemIds) {
    itemsById.delete(retriedItemId)
  }
  for (const item of next.items) {
    itemsById.set(item.id, item)
  }

  const items = Array.from(itemsById.values())
  const createdCount = items.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
  ).length
  const failedCount = items.filter(
    (item) =>
      item.result === MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
  ).length
  const uncertainCount = items.filter(
    (item) =>
      item.result ===
      MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
  ).length
  const skippedCount = previous.skippedCount + next.skippedCount

  return {
    totalSelected: items.length + skippedCount,
    attemptedCount: items.length,
    createdCount,
    failedCount,
    uncertainCount,
    skippedCount,
    items,
  }
}

const shouldSelectNewPreviewItem = (
  preview: ManagedSiteTokenBatchExportPreview,
  item: ManagedSiteTokenBatchExportPreview["items"][number],
) =>
  preview.intent.verification ===
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW
    ? isExecutableManagedSiteTokenBatchExportPreviewItem(item)
    : shouldSelectPreviewItemByDefault(item)

export const reconcileManagedSiteTokenBatchExportPreview = (params: {
  previousPreview: ManagedSiteTokenBatchExportPreview | null
  nextPreview: ManagedSiteTokenBatchExportPreview
  selectedIds: ReadonlySet<string>
  editedModelsByItemId: ReadonlyMap<string, string[]>
}) => {
  const previousItemIds = new Set(
    params.previousPreview?.items.map((item) => item.id) ?? [],
  )
  const managedSite = getManagedSiteCapabilities(params.nextPreview.siteType)
  const originalItems = skipManagedSiteBatchDuplicates(
    params.nextPreview.items,
    managedSite,
    new Set(),
  )
  const editedItems = originalItems.map((item) => {
    const editedModels = params.editedModelsByItemId.get(item.id)
    return editedModels
      ? applyNormalizedModelsToPreviewItem(item, editedModels)
      : item
  })
  const selectedIds = new Set(
    editedItems.flatMap((item) => {
      if (!isExecutableManagedSiteTokenBatchExportPreviewItem(item)) return []
      const selected = previousItemIds.has(item.id)
        ? params.selectedIds.has(item.id)
        : shouldSelectNewPreviewItem(params.nextPreview, item)
      return selected ? [item.id] : []
    }),
  )
  const items = skipManagedSiteBatchDuplicates(
    editedItems,
    managedSite,
    selectedIds,
  )
  for (const item of items) {
    if (!isExecutableManagedSiteTokenBatchExportPreviewItem(item)) {
      selectedIds.delete(item.id)
    }
  }
  const preview = {
    ...params.nextPreview,
    items,
    ...countPreviewItems(items),
  }

  return { preview, selectedIds }
}
