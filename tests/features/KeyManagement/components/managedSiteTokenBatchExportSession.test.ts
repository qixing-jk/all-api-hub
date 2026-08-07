import { describe, expect, it } from "vitest"

import {
  getManagedSiteTokenBatchExportRetryItemIds,
  reconcileManagedSiteTokenBatchExportPreview,
  shouldConfirmManagedSiteTokenBatchExport,
} from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog/managedSiteTokenBatchExportSession"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
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
  intent: { source: "repair-created", verification: "complete" },
  siteType: "new-api",
  targetFingerprint: "target-fingerprint",
  targetSummary: {
    siteType: "new-api",
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
        source: "repair-created",
        verification: "trusted-new",
      }),
    ).toBe(false)
    expect(
      shouldConfirmManagedSiteTokenBatchExport({
        source: "repair-created",
        verification: "complete",
      }),
    ).toBe(true)
    expect(
      shouldConfirmManagedSiteTokenBatchExport({
        source: "manual-selection",
        verification: "complete",
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
          result: "created",
          success: true,
          skipped: false,
        },
        {
          id: "failed-key",
          accountName: "Example account",
          runtimeKeyName: "Failed key",
          result: "failed",
          success: false,
          skipped: false,
        },
        {
          id: "uncertain-key",
          accountName: "Example account",
          runtimeKeyName: "Uncertain key",
          result: "uncertain",
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
})
