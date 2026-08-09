import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteTokenBatchExportRetryItemIds,
  mergeManagedSiteTokenBatchExportExecutionResults,
  reconcileManagedSiteTokenBatchExportPreview,
  shouldConfirmManagedSiteTokenBatchExport,
} from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/managedSiteTokenBatchExportSession"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"

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
    priority: 0,
    weight: 0,
    status: 1,
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
    compatibleUserId: "1",
  },
  items,
  totalCount: items.length,
  readyCount: items.length,
  warningCount: 0,
  skippedCount: 0,
  blockedCount: 0,
})

describe("managed-site token batch export session", () => {
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
    expect(reconciled.preview.items[0].draft?.models).toEqual(["custom-model"])
    expect(reconciled.preview.items[1].draft?.models).toEqual(["refreshed-b"])
  })

  it("selects only failed and uncertain execution rows for retry", () => {
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
      "uncertain-key",
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
