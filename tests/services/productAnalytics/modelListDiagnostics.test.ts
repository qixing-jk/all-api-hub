import { describe, expect, it } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  buildModelListDiagnostics,
  buildModelListFailureDiagnostics,
} from "~/services/productAnalytics/modelListDiagnostics"
import { AuthTypeEnum } from "~/types"

describe("model list product analytics diagnostics", () => {
  it("maps structured auth, rate-limit, JSON, response-shape, timeout, and network failures", () => {
    expect(
      buildModelListFailureDiagnostics({
        error: { statusCode: 408 },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { statusCode: 503 },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ServerError,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: new ApiError(
          "secret auth text",
          401,
          "/private",
          API_ERROR_CODES.HTTP_401,
        ),
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { statusCode: 429 },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: new SyntaxError("private raw JSON"),
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: "INVALID_MODEL_PRICING_FORMAT" },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.TokenSecretUnavailable,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { originalCode: API_ERROR_CODES.JSON_PARSE_ERROR },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: "INVALID_FORMAT" },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: API_ERROR_CODES.FEATURE_UNSUPPORTED },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: API_ERROR_CODES.BUSINESS_ERROR },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.ProviderBusinessError,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { name: "AbortError" },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { code: API_ERROR_CODES.NETWORK_ERROR },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { name: "NetworkError" },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: { cause: { statusCode: 403 } },
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
    })
  })

  it("maps safe local error message patterns to model-list failure reasons", () => {
    expect(
      buildModelListFailureDiagnostics({
        error: new TypeError("Failed to fetch"),
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: new Error("unauthorized request for private account"),
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
    })

    expect(
      buildModelListFailureDiagnostics({
        error: new Error("insufficient quota for private account"),
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient,
    })
  })

  it("uses safe unknown for unstructured failures and structured stale skips", () => {
    expect(
      buildModelListFailureDiagnostics({
        error: "raw private backend text",
      }),
    ).toEqual({
      category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
    })

    expect(
      buildModelListDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        apiType: "openai-compatible",
        resultKind: "stale_response_ignored",
        modelCount: 0,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        apiType: "openai-compatible",
      },
      execution: {
        staleResponseIgnored: true,
      },
      outcome: {
        modelCount: 0,
        skippedCount: 1,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
      },
    })
  })

  it("builds safe model-list context, execution, outcome, and failure fields", () => {
    expect(
      buildModelListDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
        siteType: "new-api",
        requestedAuthMode: AuthTypeEnum.AccessToken,
        cacheHit: true,
        fallbackAvailable: true,
        fallbackUsed: false,
        modelCount: 3,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
        siteType: "new-api",
        requestedAuthMode: AuthTypeEnum.AccessToken,
      },
      execution: {
        cacheHit: true,
        fallbackAvailable: true,
        fallbackUsed: false,
      },
      outcome: {
        modelCount: 3,
      },
    })
  })

  it("includes retry execution fields and explicit result counts", () => {
    expect(
      buildModelListDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
        cacheUsed: true,
        retryAttempted: true,
        retryCount: 2,
        staleResponseIgnored: false,
        successCount: 3,
        failureCount: 1,
        skippedCount: 0,
      }),
    ).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
      },
      execution: {
        cacheUsed: true,
        retryAttempted: true,
        retryCount: 2,
        staleResponseIgnored: false,
      },
      outcome: {
        successCount: 3,
        failureCount: 1,
        skippedCount: 0,
      },
    })
  })
})
