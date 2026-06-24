import { describe, expect, it } from "vitest"

import {
  getWebdavAnalyticsErrorCategory,
  getWebdavAnalyticsFailureStage,
  PersistWebdavConfigError,
} from "~/features/ImportExport/components/webDavAnalytics"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
} from "~/services/productAnalytics/events"

describe("WebDAV analytics classifiers", () => {
  it("classifies persistence failures by their wrapped cause without exposing raw details", () => {
    const authFailure = new PersistWebdavConfigError(
      Object.assign(new Error("private storage auth failed"), {
        statusCode: 401,
      }),
    )

    expect(getWebdavAnalyticsErrorCategory(authFailure)).toBe(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )
    expect(getWebdavAnalyticsFailureStage(authFailure)).toBe(
      PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
    )
    expect(JSON.stringify(authFailure)).not.toContain("private storage")
  })

  it("uses unknown persist diagnostics when local settings persistence has no cause", () => {
    const failure = new PersistWebdavConfigError()

    expect(getWebdavAnalyticsErrorCategory(failure)).toBe(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    expect(getWebdavAnalyticsFailureStage(failure)).toBe(
      PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
    )
  })

  it("classifies remote WebDAV execution failures separately from persistence", () => {
    const authFailure = Object.assign(new Error("private connection failed"), {
      statusCode: 401,
    })

    expect(getWebdavAnalyticsErrorCategory(authFailure)).toBe(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )
    expect(getWebdavAnalyticsFailureStage(authFailure)).toBe(
      PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
    )
  })
})
