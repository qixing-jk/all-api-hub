import { describe, expect, it } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { resolveProviderErrorResult } from "~/services/checkin/autoCheckin/providers/shared"

describe("auto-checkin provider error normalization", () => {
  it("labels fetch transport failures as network-related without exposing raw transport copy", () => {
    expect(
      resolveProviderErrorResult({
        error: new TypeError("Failed to fetch"),
      }),
    ).toEqual({
      status: "failed",
      messageKey: "autoCheckin:skipReasons.network_error",
      reasonCode: "network_error",
    })

    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "Request failed",
          undefined,
          undefined,
          API_ERROR_CODES.NETWORK_ERROR,
        ),
      }),
    ).toMatchObject({ reasonCode: "network_error" })
  })

  it("distinguishes timeouts and structured source outages from network loss", () => {
    expect(
      resolveProviderErrorResult({
        error: new DOMException("Timed out", "TimeoutError"),
      }),
    ).toMatchObject({
      reasonCode: "timeout",
      messageKey: "autoCheckin:skipReasons.timeout",
    })

    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Service unavailable"), {
          statusCode: 503,
        }),
      }),
    ).toMatchObject({
      reasonCode: "source_unavailable",
      messageKey: "autoCheckin:skipReasons.source_unavailable",
      messageParams: { statusCode: 503 },
    })

    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Gateway timeout"), {
          statusCode: 504,
        }),
      }),
    ).toMatchObject({
      reasonCode: "timeout",
      messageKey: "autoCheckin:skipReasons.timeout",
    })
  })

  it("keeps unstructured provider failures out of the network bucket", () => {
    expect(
      resolveProviderErrorResult({ error: new Error("Invalid response") }),
    ).toEqual({
      status: "failed",
      reasonCode: "upstream_error",
      rawMessage: "Invalid response",
      messageKey: undefined,
    })

    const businessFailure = resolveProviderErrorResult({
      error: new Error("Database connection failed"),
    })
    expect(businessFailure).toMatchObject({
      status: "failed",
      reasonCode: "upstream_error",
      rawMessage: "Database connection failed",
    })
  })

  it("keeps authentication and permission failures distinct from network problems", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
      }),
    ).toMatchObject({ reasonCode: "authentication_required" })
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("无权进行此操作，access token 无效"), {
          statusCode: 401,
        }),
      }),
    ).toMatchObject({ reasonCode: "authentication_required" })
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
      }),
    ).toMatchObject({ reasonCode: "permission_denied" })
    for (const message of [
      "You do not have permission to check in",
      "You don't have permission to check in",
    ]) {
      expect(
        resolveProviderErrorResult({
          error: Object.assign(new Error(message), { statusCode: 403 }),
        }),
      ).toMatchObject({
        reasonCode: "permission_denied",
      })
    }
  })

  it("does not treat a permission-service failure as an explicit denial", () => {
    for (const message of [
      "权限校验服务异常，请稍后重试",
      "Permission service unavailable",
    ]) {
      expect(
        resolveProviderErrorResult({
          error: Object.assign(new Error(message), { statusCode: 403 }),
        }),
      ).toMatchObject({
        reasonCode: "upstream_error",
      })
    }
  })

  it("classifies unsupported endpoints and invalid protected-context runs", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Not found"), { statusCode: 404 }),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "no_provider",
      messageKey: "autoCheckin:providerFallback.endpointNotSupported",
    })

    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "This run cannot continue",
          undefined,
          undefined,
          API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
        ),
      }),
    ).toEqual({
      status: "failed",
      messageKey: "autoCheckin:skipReasons.execution_context_invalid",
      reasonCode: "execution_context_invalid",
    })
  })

  it("classifies a lost result after mutation dispatch as uncertain", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Service unavailable"), {
          statusCode: 503,
        }),
        mutationDispatched: true,
      }),
    ).toEqual({
      status: "uncertain",
      reasonCode: "source_unavailable",
      messageKey: "autoCheckin:skipReasons.source_unavailable",
      messageParams: { statusCode: 503 },
    })
  })

  it("keeps an unstructured lost result uncertain after mutation dispatch", () => {
    expect(
      resolveProviderErrorResult({
        error: new Error("Invalid response"),
        mutationDispatched: true,
      }),
    ).toEqual({
      status: "uncertain",
      reasonCode: "upstream_error",
      rawMessage: "Invalid response",
      messageKey: undefined,
    })
  })

  it.each([
    [
      "a transport rejection",
      new ApiError(
        "example refusal",
        400,
        "/api/user/checkin",
        API_ERROR_CODES.HTTP_OTHER,
      ),
    ],
    [
      "a rate limit",
      new ApiError(
        "too many requests",
        429,
        "/api/user/checkin",
        API_ERROR_CODES.HTTP_429,
      ),
    ],
    [
      "a business envelope the provider inspected",
      new ApiError(
        "example business refusal",
        undefined,
        "/api/user/checkin",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
    ],
  ])(
    "records %s as a determinate refusal that stays retryable",
    (_name, error) => {
      expect(resolveProviderErrorResult({ error })).toEqual({
        status: "failed",
        reasonCode: "upstream_rejected",
        // The site's own copy wins over the generic failure label.
        rawMessage: error.message,
        messageKey: undefined,
      })
    },
  )

  it("keeps a dispatched refusal determinate instead of uncertain", () => {
    // The site answered, so the answer is the outcome: a lost response is the
    // uncertain case, not a delivered refusal.
    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "example refusal",
          400,
          "/api/user/checkin",
          API_ERROR_CODES.HTTP_OTHER,
        ),
        mutationDispatched: true,
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "upstream_rejected",
    })
  })

  it.each([
    ["a bare HTTP 403", 403, API_ERROR_CODES.HTTP_403],
    ["an HTML 401", 401, API_ERROR_CODES.CONTENT_TYPE_MISMATCH],
  ])(
    "leaves %s retryable because a status alone is not permission evidence",
    (_name, statusCode, code) => {
      // The transport's own copy carries no site message, so nothing here
      // proves the site refused the check-in rather than rejecting the client.
      expect(
        resolveProviderErrorResult({
          error: new ApiError(
            `请求失败: ${statusCode}`,
            statusCode,
            "/api/user/checkin",
            code,
          ),
        }),
      ).toEqual({
        status: "uncertain",
        reasonCode: "upstream_error",
        rawMessage: `请求失败: ${statusCode}`,
        messageKey: undefined,
      })
    },
  )

  it("refuses an unsupported endpoint instead of retrying it", () => {
    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "Not found",
          405,
          "/api/user/checkin",
          API_ERROR_CODES.HTTP_OTHER,
        ),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "no_provider",
    })
  })

  it.each([
    ["permission wording", "Forbidden", 403, API_ERROR_CODES.HTTP_403],
    ["login wording", "未登录", 401, API_ERROR_CODES.HTTP_401],
  ])(
    "keeps a recovered %s from deciding a dead end",
    (_name, message, statusCode, code) => {
      // The transport marks text that came from a body which is not the site's
      // JSON answer. It is shown as-is, but an interceptor page must not turn a
      // retryable refusal into an authentication or permission dead end.
      expect(
        resolveProviderErrorResult({
          error: Object.assign(
            new ApiError(message, statusCode, "/api/user/checkin", code),
            { unattributedMessage: true },
          ),
        }),
      ).toMatchObject({
        status: "uncertain",
        reasonCode: "upstream_error",
        rawMessage: message,
      })
    },
  )

  it("keeps a recovered message without a status out of the auth bucket", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new ApiError("未登录"), {
          unattributedMessage: true,
        }),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "upstream_error",
      rawMessage: "未登录",
    })
  })

  it("still reads an attributed message as the site's own claim", () => {
    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "Forbidden",
          403,
          "/api/user/checkin",
          API_ERROR_CODES.HTTP_403,
        ),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "permission_denied",
    })
  })

  it("classifies explicit method disabled copy as non-retryable METHOD_DISABLED", () => {
    expect(
      resolveProviderErrorResult({
        error: new ApiError("签到功能已关闭", 200, "/api/user/checkin"),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "method_disabled",
    })

    expect(
      resolveProviderErrorResult({
        error: new ApiError(
          "Checkin disabled by admin",
          200,
          "/api/user/checkin",
        ),
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "method_disabled",
    })
  })

  it("handles non-object error values gracefully", () => {
    expect(
      resolveProviderErrorResult({
        error: "string failure message",
      }),
    ).toMatchObject({
      status: "failed",
      reasonCode: "upstream_error",
      rawMessage: "string failure message",
    })
  })

  it("falls back to checkinFailed message key when determinate rejection lacks message", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error(""), { statusCode: 422 }),
      }),
    ).toEqual({
      status: "failed",
      reasonCode: "upstream_rejected",
      rawMessage: undefined,
      messageKey: "autoCheckin:providerFallback.checkinFailed",
    })
  })

  it("falls back to unknownError message key when 401/403 rejection lacks message", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error(""), { statusCode: 401 }),
      }),
    ).toEqual({
      status: "uncertain",
      reasonCode: "upstream_error",
      rawMessage: undefined,
      messageKey: "autoCheckin:providerFallback.unknownError",
    })
  })
})
