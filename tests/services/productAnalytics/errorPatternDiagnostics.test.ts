import { describe, expect, it } from "vitest"

import {
  resolveProductAnalyticsCategoryFromFailureReason,
  resolveProductAnalyticsFailureReasonFromLocalMessage,
} from "~/services/productAnalytics/errorPatternDiagnostics"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
} from "~/services/productAnalytics/events"

describe("product analytics error pattern diagnostics", () => {
  it("maps bounded local messages to fixed failure reasons", () => {
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("Failed to fetch private endpoint"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable)
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("invalid API key for private account"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid)
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("session expired for private account"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired)
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("too many requests for private account"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited)
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("quota exceeded for private account"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient)
    expect(
      resolveProductAnalyticsFailureReasonFromLocalMessage(
        new Error("invalid json from private account"),
      ),
    ).toBe(PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson)
  })

  it("maps fixed failure reasons to coarse error categories", () => {
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.ServerError,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.MissingConfig,
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation)
    expect(
      resolveProductAnalyticsCategoryFromFailureReason(
        PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      ),
    ).toBeUndefined()
  })
})
