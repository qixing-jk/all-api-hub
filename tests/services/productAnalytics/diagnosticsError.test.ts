import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"

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

  it("maps structured HTTP statuses and API codes to sanitized diagnostics", () => {
    const cases = [
      {
        input: { statusCode: 408 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout,
      },
      {
        input: { status: 429 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
      },
      {
        input: { statusCode: 503 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ServerError,
      },
      {
        input: { code: API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.TokenSecretUnavailable,
      },
      {
        input: { code: API_ERROR_CODES.HTTP_429 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
      },
      {
        input: { originalCode: API_ERROR_CODES.NETWORK_ERROR },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
      },
      {
        input: { code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
      },
      {
        input: { code: API_ERROR_CODES.FEATURE_UNSUPPORTED },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
      },
      {
        input: { code: API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
      },
      {
        input: { code: API_ERROR_CODES.TEMP_WINDOW_DISABLED },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable,
      },
    ]

    for (const { input, category, reason, stage } of cases) {
      expect(buildActionFailureDiagnostics({ error: input })).toEqual({
        category,
        stage: stage ?? PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason,
      })
    }
  })

  it("maps DOM-style error names and nested causes to sanitized diagnostics", () => {
    expect(
      buildActionFailureDiagnostics({ error: { name: "TimeoutError" } }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout,
    })
    expect(
      buildActionFailureDiagnostics({
        error: { name: "PermissionDeniedError" },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
    })
    expect(
      buildActionFailureDiagnostics({ error: { name: "NotSupportedError" } }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
    })
    expect(
      buildActionFailureDiagnostics({ error: { name: "NetworkError" } }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })
    expect(
      buildActionFailureDiagnostics({
        error: { cause: { statusCode: 403 } },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
    })
  })

  it("derives stage and category from explicit failure reasons", () => {
    expect(
      buildActionFailureDiagnostics({
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageWriteFailed,
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageWriteFailed,
    })
    expect(
      buildActionFailureDiagnostics({
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.CacheReadFailed,
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Fallback,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.CacheReadFailed,
    })
    expect(
      buildActionFailureDiagnostics({
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse,
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse,
    })
  })

  it("uses structured category fallbacks when the reason is explicitly unknown", () => {
    const cases = [
      {
        input: { statusCode: 400 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
      {
        input: { statusCode: 404 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      },
      {
        input: { statusCode: 500 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      },
      {
        input: { code: API_ERROR_CODES.HTTP_401 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      },
      {
        input: { code: API_ERROR_CODES.HTTP_429 },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
      },
      {
        input: { code: API_ERROR_CODES.NETWORK_ERROR },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      },
      {
        input: { code: API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
      },
      {
        input: { code: API_ERROR_CODES.FEATURE_UNSUPPORTED },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      },
      {
        input: { code: API_ERROR_CODES.BUSINESS_ERROR },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
      {
        input: { name: "TimeoutError" },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout,
      },
      {
        input: { name: "SecurityError" },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
      },
      {
        input: { name: "NotFoundError" },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      },
      {
        input: { name: "NetworkError" },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      },
      {
        input: new Error("Failed to fetch private endpoint"),
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      },
      {
        input: { cause: { statusCode: 403 } },
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      },
    ]

    for (const { input, category } of cases) {
      expect(
        buildActionFailureDiagnostics({
          error: input,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
        }),
      ).toEqual({
        category,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      })
    }
  })
})
