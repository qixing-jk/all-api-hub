import type {
  ManagedSiteBatchImportIntent,
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportPreview,
} from "~/types/managedSiteTokenBatchExport"
import { isExecutableManagedSiteTokenBatchExportPreviewItem } from "~/types/managedSiteTokenBatchExport"

import {
  applyNormalizedModelsToPreviewItem,
  countPreviewItems,
  shouldSelectPreviewItemByDefault,
} from "../managedSiteTokenBatchExportPreview"

export const shouldConfirmManagedSiteTokenBatchExport = (
  intent: ManagedSiteBatchImportIntent,
) => intent.verification === "complete"

export const getManagedSiteTokenBatchExportRetryItemIds = (
  result: ManagedSiteTokenBatchExportExecutionResult,
) =>
  result.items
    .filter((item) => item.result === "failed" || item.result === "uncertain")
    .map((item) => item.id)

export const mergeManagedSiteTokenBatchExportExecutionResults = (
  previous: ManagedSiteTokenBatchExportExecutionResult | null,
  next: ManagedSiteTokenBatchExportExecutionResult,
): ManagedSiteTokenBatchExportExecutionResult => {
  if (!previous) return next

  const itemsById = new Map(previous.items.map((item) => [item.id, item]))
  for (const item of next.items) {
    itemsById.set(item.id, item)
  }

  const items = Array.from(itemsById.values())
  const createdCount = items.filter((item) => item.result === "created").length
  const failedCount = items.filter((item) => item.result === "failed").length
  const uncertainCount = items.filter(
    (item) => item.result === "uncertain",
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
  preview.intent.verification === "trusted-new"
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
  const items = params.nextPreview.items.map((item) => {
    const editedModels = params.editedModelsByItemId.get(item.id)
    return editedModels
      ? applyNormalizedModelsToPreviewItem(item, editedModels)
      : item
  })
  const preview = {
    ...params.nextPreview,
    items,
    ...countPreviewItems(items),
  }
  const selectedIds = new Set(
    items.flatMap((item) => {
      if (!isExecutableManagedSiteTokenBatchExportPreviewItem(item)) return []
      const selected = previousItemIds.has(item.id)
        ? params.selectedIds.has(item.id)
        : shouldSelectNewPreviewItem(preview, item)
      return selected ? [item.id] : []
    }),
  )

  return { preview, selectedIds }
}
