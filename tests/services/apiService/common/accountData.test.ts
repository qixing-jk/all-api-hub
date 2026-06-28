import { beforeEach, describe, expect, it, vi } from "vitest"

import { determineHealthStatus } from "~/services/apiService/common"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
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

describe("apiService common helpers", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it("determineHealthStatus handles ApiError, network, and unknown failures", () => {
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
