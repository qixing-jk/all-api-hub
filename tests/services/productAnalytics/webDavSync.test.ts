import { describe, expect, it } from "vitest"

import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { buildWebDavSyncDiagnostics } from "~/services/productAnalytics/webDavSync"

describe("WebDAV sync product analytics diagnostics", () => {
  it("builds safe WebDAV diagnostics from mode, counts, and structured errors", () => {
    const diagnostics = buildWebDavSyncDiagnostics({
      mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
      itemCount: 4,
      successCount: 3,
      failureCount: 1,
      skippedCount: 0,
      error: Object.assign(new Error("https://private.example/backup.json"), {
        statusCode: 429,
      }),
    })

    expect(diagnostics).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
      },
      outcome: {
        itemCount: 4,
        successCount: 3,
        failureCount: 1,
        skippedCount: 0,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
      },
    })
    expect(JSON.stringify(diagnostics)).not.toContain("private.example")
  })

  it("tracks decrypt handoff skips without failure diagnostics", () => {
    expect(
      buildWebDavSyncDiagnostics({
        mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        itemCount: 1,
        successCount: 0,
        failureCount: 0,
        skippedCount: 1,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
      },
      outcome: {
        itemCount: 1,
        successCount: 0,
        failureCount: 0,
        skippedCount: 1,
      },
    })
  })
})
