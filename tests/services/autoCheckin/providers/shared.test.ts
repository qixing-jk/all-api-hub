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

  it("does not label an unstructured provider failure as a network problem", () => {
    expect(
      resolveProviderErrorResult({ error: new Error("Invalid response") }),
    ).toEqual({
      status: "failed",
      rawMessage: "Invalid response",
      messageKey: undefined,
    })

    const businessFailure = resolveProviderErrorResult({
      error: new Error("Database connection failed"),
    })
    expect(businessFailure).toMatchObject({
      status: "failed",
      rawMessage: "Database connection failed",
    })
    expect(businessFailure.reasonCode).toBeUndefined()
  })

  it("keeps authentication and permission failures distinct from network problems", () => {
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
      }),
    ).toMatchObject({ reasonCode: "authentication_required" })
    expect(
      resolveProviderErrorResult({
        error: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
      }),
    ).toMatchObject({ reasonCode: "permission_denied" })
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
      rawMessage: "Invalid response",
      messageKey: undefined,
    })
  })
})
