import { describe, expect, it } from "vitest"

import { buildAccountRefreshDiagnostics } from "~/services/productAnalytics/accountRefresh"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { AuthTypeEnum } from "~/types"

describe("account refresh product analytics diagnostics", () => {
  it("builds safe account refresh diagnostics from aggregate counts", () => {
    const diagnostics = buildAccountRefreshDiagnostics({
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
      mode: PRODUCT_ANALYTICS_MODE_IDS.All,
      siteType: "new-api",
      requestedAuthMode: AuthTypeEnum.AccessToken,
      itemCount: 3,
      successCount: 2,
      failureCount: 1,
      skippedCount: 1,
      error: Object.assign(new Error("private backend message"), {
        statusCode: 401,
      }),
    })

    expect(diagnostics).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        siteType: "new-api",
        requestedAuthMode: AuthTypeEnum.AccessToken,
      },
      outcome: {
        itemCount: 3,
        successCount: 2,
        failureCount: 1,
        skippedCount: 1,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
      },
    })
    expect(JSON.stringify(diagnostics)).not.toContain("private backend message")
  })

  it("marks skipped single-account refreshes without failure diagnostics", () => {
    expect(
      buildAccountRefreshDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Row,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        siteType: "Veloera",
        requestedAuthMode: AuthTypeEnum.Cookie,
        itemCount: 1,
        successCount: 0,
        failureCount: 0,
        skippedCount: 1,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Row,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        siteType: "Veloera",
        requestedAuthMode: AuthTypeEnum.Cookie,
      },
      outcome: {
        itemCount: 1,
        successCount: 0,
        failureCount: 0,
        skippedCount: 1,
      },
    })
  })

  it("derives failure category from explicit failure reason when no error is available", () => {
    expect(
      buildAccountRefreshDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
      },
    })
  })

  it("includes execution metadata and warning counts when refresh retries use fallback contexts", () => {
    expect(
      buildAccountRefreshDiagnostics({
        tempContextUsed: true,
        incognitoContextUsed: false,
        fallbackAvailable: true,
        fallbackUsed: true,
        retryAttempted: true,
        retryCount: 2,
        warningCount: 1,
      }),
    ).toEqual({
      execution: {
        tempContextUsed: true,
        incognitoContextUsed: false,
        fallbackAvailable: true,
        fallbackUsed: true,
        retryAttempted: true,
        retryCount: 2,
      },
      outcome: {
        warningCount: 1,
      },
    })
  })
})
