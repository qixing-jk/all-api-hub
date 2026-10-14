import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteTokenBatchExportRetryItemIds,
  mergeManagedSiteTokenBatchExportExecutionResults,
  mergeManagedSiteTokenBatchRetryPreview,
  reconcileManagedSiteTokenBatchExportPreview,
  selectManagedSiteTokenBatchPreviewInputs,
  shouldConfirmManagedSiteTokenBatchExport,
} from "~/features/KeyManagement/batchExport/managedSiteTokenBatchExportSession"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type BlockedManagedSiteTokenBatchExportItemInput,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const buildItem = (
  id: string,
  models: string[],
): ManagedSiteTokenBatchExportPreviewItem => ({
  id,
  accountId: "account-example",
  accountName: "Example account",
  runtimeKeyId: id,
  runtimeKeyName: `Key ${id}`,
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
  warningCodes: [],
  draft: {
    name: `Channel ${id}`,
    type: 1,
    key: `placeholder-${id}`,
    base_url: "https://source.example.invalid",
    models,
    groups: ["default"],
    enabled: true,
  },
})

const buildPreview = (
  items: ManagedSiteTokenBatchExportPreviewItem[],
): ManagedSiteTokenBatchExportPreview => ({
  intent: {
    source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
    verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
  },
  siteType: SITE_TYPES.NEW_API,
  targetFingerprint: "target-fingerprint",
  targetSummary: {
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://target.example.invalid",
  },
  items,
  totalCount: items.length,
  readyCount: items.length,
  warningCount: 0,
  skippedCount: 0,
  blockedCount: 0,
})

describe("managed-site token batch export session", () => {
  it("filters unresolved retry inputs by their stable reference id", () => {
    const failed: BlockedManagedSiteTokenBatchExportItemInput = {
      kind: "blocked-reference",
      id: "failed",
      accountLabel: "Example account",
      keyLabel: "Unavailable key",
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
      blockingDetailCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
    }
    const inputs = [failed, { ...failed, id: "untouched" }]
    expect(
      selectManagedSiteTokenBatchPreviewInputs(inputs, new Set(["failed"])),
    ).toEqual([failed])
    expect(selectManagedSiteTokenBatchPreviewInputs(inputs, null)).toBe(inputs)
  })

  it("restores a warning batch duplicate when its representative is deselected", () => {
    const first = buildItem("first", ["model-a"])
    const second = {
      ...buildItem("second", ["model-a"]),
      draft: first.draft,
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: ["exact-verification-unavailable" as const],
    }
    const initial = buildPreview([first, second])
    const marked = reconcileManagedSiteTokenBatchExportPreview({
      previousPreview: initial,
      nextPreview: initial,
      selectedIds: new Set([first.id, second.id]),
      editedModelsByItemId: new Map(),
    })
    expect(marked.preview.items[1]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      duplicateOfItemId: first.id,
      batchDuplicateOriginalStatus:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
    })
    // Older preview rows may not carry the original-status metadata.
    const legacy = {
      ...marked.preview,
      items: marked.preview.items.map((item) => ({
        ...item,
        batchDuplicateOriginalStatus: undefined,
      })),
    }
    const restored = reconcileManagedSiteTokenBatchExportPreview({
      previousPreview: legacy,
      nextPreview: legacy,
      selectedIds: new Set([second.id]),
      editedModelsByItemId: new Map(),
    })
    expect(restored.preview.items[1]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: second.warningCodes,
    })
    expect(restored.preview.items[1]?.duplicateOfItemId).toBeUndefined()
    expect(restored.selectedIds).toEqual(new Set([second.id]))
  })
  it("keeps history order and missing retry rows while taking fresh preview metadata", () => {
    const previous = buildPreview([
      buildItem("success", ["model-a"]),
      buildItem("retry", ["model-b"]),
      buildItem("missing", ["model-c"]),
    ])
    const next = buildPreview([buildItem("retry", ["fresh-model"])])
    const merged = mergeManagedSiteTokenBatchRetryPreview(
      previous,
      next,
      new Set(["retry", "missing"]),
    )
    expect(merged.items).toEqual([
      previous.items[0],
      next.items[0],
      previous.items[2],
    ])
    expect(merged.totalCount).toBe(3)
    expect(merged.intent).toBe(next.intent)
    expect(mergeManagedSiteTokenBatchRetryPreview(previous, next, null)).toBe(
      next,
    )
    expect(mergeManagedSiteTokenBatchRetryPreview(null, next, new Set())).toBe(
      next,
    )
  })
  it("never restores rows skipped because the target already contains them", () => {
    const first = buildItem("key-1", ["model-a"])
    const targetDuplicate = {
      ...buildItem("key-2", ["model-a"]),
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
    }
    const previousPreview = buildPreview([first, targetDuplicate])
    const reconciled = reconcileManagedSiteTokenBatchExportPreview({
      previousPreview,
      nextPreview: previousPreview,
      selectedIds: new Set(),
      editedModelsByItemId: new Map([[first.id, ["model-b"]]]),
    })
    expect(reconciled.preview.items[1]?.status).toBe(
      MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
    )
  })
  it("restores a batch duplicate when the selected representative's models change", () => {
    const first = buildItem("key-1", ["model-a"])
    const second = {
      ...buildItem("key-2", ["model-a"]),
      draft: { ...first.draft!, name: "Second channel" },
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      duplicateOfItemId: first.id,
      duplicateOfItemName: first.runtimeKeyName,
    }
    const previousPreview = buildPreview([first, second])
    const reconciled = reconcileManagedSiteTokenBatchExportPreview({
      previousPreview,
      nextPreview: previousPreview,
      selectedIds: new Set([first.id]),
      editedModelsByItemId: new Map([[first.id, ["model-b"]]]),
    })
    expect(reconciled.preview.items[1]?.status).toBe(
      MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
    )
    expect(reconciled.preview.items[1]?.duplicateOfItemId).toBeUndefined()
    expect(reconciled.selectedIds).toEqual(new Set([first.id]))
  })
  it("requires confirmation for complete checks but not trusted repair review", () => {
    expect(
      shouldConfirmManagedSiteTokenBatchExport({
        source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
        verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
      }),
    ).toBe(false)
    expect(
      shouldConfirmManagedSiteTokenBatchExport({
        source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
        verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
      }),
    ).toBe(true)
    expect(
      shouldConfirmManagedSiteTokenBatchExport({
        source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.MANUAL_SELECTION,
        verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
      }),
    ).toBe(true)
  })

  it("preserves explicit selection and model edits when a preview is refreshed", () => {
    const previousPreview = buildPreview([
      buildItem("key-1", ["model-a"]),
      buildItem("key-2", ["model-b"]),
    ])
    const nextPreview = buildPreview([
      buildItem("key-1", ["refreshed-a"]),
      buildItem("key-2", ["refreshed-b"]),
      buildItem("key-3", ["model-c"]),
    ])

    const reconciled = reconcileManagedSiteTokenBatchExportPreview({
      previousPreview,
      nextPreview,
      selectedIds: new Set(["key-1"]),
      editedModelsByItemId: new Map([["key-1", ["custom-model"]]]),
    })

    expect(reconciled.selectedIds).toEqual(new Set(["key-1", "key-3"]))
    expect(atIndex(reconciled.preview.items, 0).draft?.models).toEqual([
      "custom-model",
    ])
    expect(atIndex(reconciled.preview.items, 1).draft?.models).toEqual([
      "refreshed-b",
    ])
  })

  it("selects only definitely failed execution rows for retry", () => {
    const result: ManagedSiteTokenBatchExportExecutionResult = {
      totalSelected: 3,
      attemptedCount: 3,
      createdCount: 1,
      failedCount: 1,
      uncertainCount: 1,
      skippedCount: 0,
      items: [
        {
          id: "created-key",
          accountName: "Example account",
          runtimeKeyName: "Created key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
          success: true,
          skipped: false,
        },
        {
          id: "failed-key",
          accountName: "Example account",
          runtimeKeyName: "Failed key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
          success: false,
          skipped: false,
        },
        {
          id: "uncertain-key",
          accountName: "Example account",
          runtimeKeyName: "Uncertain key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.UNCERTAIN,
          success: false,
          skipped: false,
        },
      ],
    }

    expect(getManagedSiteTokenBatchExportRetryItemIds(result)).toEqual([
      "failed-key",
    ])
  })

  it("merges retry outcomes while keeping the latest status for each row", () => {
    const previous: ManagedSiteTokenBatchExportExecutionResult = {
      totalSelected: 3,
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      uncertainCount: 0,
      skippedCount: 1,
      items: [
        {
          id: "created-key",
          accountName: "Example account",
          runtimeKeyName: "Created key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
          success: true,
          skipped: false,
        },
        {
          id: "failed-key",
          accountName: "Example account",
          runtimeKeyName: "Failed key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
          success: false,
          skipped: false,
          error: "first attempt",
        },
      ],
    }
    const retry: ManagedSiteTokenBatchExportExecutionResult = {
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      uncertainCount: 0,
      skippedCount: 0,
      items: [
        {
          id: "failed-key",
          accountName: "Example account",
          runtimeKeyName: "Failed key",
          result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
          success: true,
          skipped: false,
        },
      ],
    }

    expect(
      mergeManagedSiteTokenBatchExportExecutionResults(
        previous,
        retry,
        new Set(["failed-key"]),
      ),
    ).toEqual({
      totalSelected: 3,
      attemptedCount: 2,
      createdCount: 2,
      failedCount: 0,
      uncertainCount: 0,
      skippedCount: 1,
      items: [previous.items[0], retry.items[0]],
    })
  })

  it("removes a previous retry failure when refreshed preparation skips it", () => {
    const createdItem = {
      id: "created-key",
      accountName: "Example account",
      runtimeKeyName: "Created key",
      result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.CREATED,
      success: true,
      skipped: false,
    }
    const failedItem = {
      id: "failed-key",
      accountName: "Example account",
      runtimeKeyName: "Failed key",
      result: MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
      success: false,
      skipped: false,
    }
    const previous: ManagedSiteTokenBatchExportExecutionResult = {
      totalSelected: 2,
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      uncertainCount: 0,
      skippedCount: 0,
      items: [createdItem, failedItem],
    }
    const retry: ManagedSiteTokenBatchExportExecutionResult = {
      totalSelected: 1,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 0,
      uncertainCount: 0,
      skippedCount: 1,
      items: [],
    }

    expect(
      mergeManagedSiteTokenBatchExportExecutionResults(
        previous,
        retry,
        new Set(["failed-key"]),
      ),
    ).toEqual({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      uncertainCount: 0,
      skippedCount: 1,
      items: [createdItem],
    })
  })
})
