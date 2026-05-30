import { describe, expect, it } from "vitest"

import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/events"
import { buildManagedSiteModelSyncDiagnostics } from "~/services/productAnalytics/managedSiteModelSync"
import type { ExecutionResult } from "~/types/managedSiteModelSync"

describe("managed site model sync product analytics diagnostics", () => {
  it("builds safe context, execution, outcome, and failure diagnostics from execution statistics", () => {
    const execution: ExecutionResult = {
      items: [
        {
          channelId: 101,
          channelName: "Private channel",
          ok: true,
          attempts: 1,
          finishedAt: 1_700_000_001_000,
          oldModels: ["old-private-model"],
          newModels: ["new-private-model", "another-private-model"],
        },
        {
          channelId: 102,
          channelName: "Failed private channel",
          ok: false,
          attempts: 3,
          finishedAt: 1_700_000_002_000,
          httpStatus: 500,
          message: "raw backend error",
          oldModels: ["unchanged-private-model"],
          newModels: ["unchanged-private-model"],
        },
      ],
      statistics: {
        total: 2,
        successCount: 1,
        failureCount: 1,
        durationMs: 2000,
        startedAt: 1_700_000_000_000,
        endedAt: 1_700_000_002_000,
      },
    }

    const diagnostics = buildManagedSiteModelSyncDiagnostics({
      managedSiteType: "new-api",
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
      mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
      execution,
      backgroundExecution: true,
    })

    expect(diagnostics).toEqual({
      context: {
        managedSiteType: "new-api",
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
      },
      execution: {
        retryAttempted: true,
        retryCount: 2,
        backgroundExecution: true,
      },
      outcome: {
        itemCount: 2,
        successCount: 1,
        failureCount: 1,
        skippedCount: 0,
        modelCount: 3,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
      },
    })
    expect(JSON.stringify(diagnostics)).not.toContain("Private channel")
    expect(JSON.stringify(diagnostics)).not.toContain("raw backend error")
    expect(JSON.stringify(diagnostics)).not.toContain("101")
    expect(JSON.stringify(diagnostics)).not.toContain("500")
  })

  it("marks empty executions as skipped without failure diagnostics", () => {
    expect(
      buildManagedSiteModelSyncDiagnostics({
        managedSiteType: "done-hub",
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        execution: {
          items: [],
          statistics: {
            total: 0,
            successCount: 0,
            failureCount: 0,
            durationMs: 0,
            startedAt: 1_700_000_000_000,
            endedAt: 1_700_000_000_000,
          },
        },
      }),
    ).toEqual({
      context: {
        managedSiteType: "done-hub",
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
      },
      execution: {
        retryAttempted: false,
        retryCount: 0,
      },
      outcome: {
        itemCount: 0,
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        modelCount: 0,
      },
    })
  })

  it("does not report total model sync failure as partial success", () => {
    expect(
      buildManagedSiteModelSyncDiagnostics({
        managedSiteType: "new-api",
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        execution: {
          items: [
            {
              channelId: 102,
              channelName: "Failed private channel",
              ok: false,
              attempts: 1,
              finishedAt: 1_700_000_002_000,
              oldModels: [],
              newModels: [],
            },
          ],
          statistics: {
            total: 1,
            successCount: 0,
            failureCount: 1,
            durationMs: 2000,
            startedAt: 1_700_000_000_000,
            endedAt: 1_700_000_002_000,
          },
        },
      }),
    ).toEqual({
      context: {
        managedSiteType: "new-api",
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
      },
      execution: {
        retryAttempted: false,
        retryCount: 0,
      },
      outcome: {
        itemCount: 1,
        successCount: 0,
        failureCount: 1,
        skippedCount: 0,
        modelCount: 0,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      },
    })
  })
})
