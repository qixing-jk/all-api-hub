import { beforeEach, describe, expect, it, vi } from "vitest"

import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { SiteHealthStatus, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  ),
}))

describe("account health helpers", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it("retains authentication rejection as an actionable health reason", () => {
    const result = determineHealthStatus(
      new ApiError("session expired", 401, "/api/user/self"),
    )
    expect(result).toMatchObject({
      status: SiteHealthStatus.Warning,
      code: "authentication_required",
    })
    expect(result.message).toContain("session expired")
  })

  it.each([
    [401, API_ERROR_CODES.ROBOT_CHALLENGE],
    [401, API_ERROR_CODES.CONTENT_TYPE_MISMATCH],
    [403, undefined],
    [429, undefined],
    [500, undefined],
  ])(
    "does not label protection or non-authentication errors as recoverable (%s, %s)",
    (statusCode, code) => {
      expect(
        determineHealthStatus(
          new ApiError("request blocked", statusCode, "/api/user/self", code),
        ).code,
      ).not.toBe("authentication_required")
    },
  )

  it("determineHealthStatus handles ApiError, network, and unknown failures", () => {
    expect(
      determineHealthStatus(
        new ApiError(
          "expired command",
          undefined,
          "/api/user/self",
          API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
        ),
      ),
    ).toEqual({
      status: SiteHealthStatus.Warning,
      message: "messages:background.tempWindowPolicyContextInvalid",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.POLICY_CONTEXT_INVALID,
    })

    expect(
      determineHealthStatus(
        new ApiError(
          "permission required",
          undefined,
          "/api/user/self",
          API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED,
        ),
      ),
    ).toEqual({
      status: SiteHealthStatus.Warning,
      message: "account:healthStatus.tempWindowPermissionRequired",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
    })

    expect(
      determineHealthStatus(
        new ApiError("rate limited", 429, "/api/user/self"),
      ),
    ).toEqual({
      status: SiteHealthStatus.Warning,
      message:
        'account:healthStatus.httpError:{"statusCode":429,"message":"rate limited"}',
    })

    expect(determineHealthStatus(new ApiError("bad payload"))).toEqual({
      status: SiteHealthStatus.Unknown,
      message: "bad payload",
    })

    expect(determineHealthStatus(new TypeError("failed to fetch"))).toEqual({
      status: SiteHealthStatus.Error,
      message: "account:healthStatus.networkFailed",
    })

    expect(determineHealthStatus(new Error("mystery"))).toEqual({
      status: SiteHealthStatus.Unknown,
      message: "mystery",
    })
  })
})
