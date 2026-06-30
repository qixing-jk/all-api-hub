import { describe, expect, it } from "vitest"

import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"

describe("product analytics verification helpers", () => {
  it("maps structured probe status metadata to safe analytics categories", () => {
    expect(
      resolveProductAnalyticsErrorCategoryFromProbeResult({
        status: "fail",
        output: { inferredHttpStatus: 401 },
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth)

    expect(
      resolveProductAnalyticsErrorCategoryFromProbeResult({
        status: "fail",
        output: { inferredHttpStatus: 429 },
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit)
  })

  it("maps unsupported probes without reading result text", () => {
    expect(
      resolveProductAnalyticsErrorCategoryFromProbeResult({
        status: "unsupported",
        output: { summary: "provider text" },
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported)
  })

  it("uses the caller fallback when probe diagnostics are unstructured", () => {
    const fallback: ProductAnalyticsErrorCategory =
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation

    expect(
      resolveProductAnalyticsErrorCategoryFromProbeResult(
        {
          status: "fail",
          output: { message: "provider text" },
        },
        fallback,
      ),
    ).toBe(fallback)
  })
})
