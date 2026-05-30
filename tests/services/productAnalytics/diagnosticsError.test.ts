import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiService/common/errors"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
} from "~/services/productAnalytics/events"

describe("product analytics action failure diagnostics", () => {
  it("maps bounded local error messages to fixed failure reasons", () => {
    const cases = [
      {
        error: new TypeError("Failed to fetch"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
      },
      {
        error: new Error("Invalid API key for sk-private"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
      },
      {
        error: new Error("Session expired for private-account"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
      },
      {
        error: new Error("Too Many Requests from private-host"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
      },
      {
        error: new Error("Quota exceeded: insufficient balance"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient,
      },
      {
        error: new Error("Unexpected token < in JSON at position 0"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson,
      },
    ]

    for (const { error, category, reason } of cases) {
      expect(buildActionFailureDiagnostics({ error })).toEqual({
        category,
        stage:
          reason === PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
            ? PRODUCT_ANALYTICS_FAILURE_STAGES.Parse
            : PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason,
      })
    }
  })

  it("keeps unknown local text private instead of uploading raw details", () => {
    const diagnostics = buildActionFailureDiagnostics({
      error: new Error("private backend failure for account alice"),
    })

    expect(diagnostics).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
    })
    expect(JSON.stringify(diagnostics)).not.toContain("alice")
    expect(JSON.stringify(diagnostics)).not.toContain("private backend")
  })

  it("maps structured provider business errors to a provider business reason", () => {
    expect(
      buildActionFailureDiagnostics({
        error: { code: API_ERROR_CODES.BUSINESS_ERROR },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ProviderBusinessError,
    })
  })
})
