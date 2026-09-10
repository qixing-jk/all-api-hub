import { describe, expect, it } from "vitest"

import { decodeNewApiResponseError } from "~/services/apiService/newApiFamily/responseError"

const response = (body: unknown, status = 400) => ({
  ok: false,
  status,
  headers: {},
  body,
})

describe("decodeNewApiResponseError", () => {
  it("recognizes a failed New API envelope and preserves its message and code", () => {
    expect(
      decodeNewApiResponseError(
        response({
          success: false,
          code: "AUTH_SESSION_LIMIT",
          message: "Active session limit reached",
        }),
        { endpoint: "/api/user/login" },
      ),
    ).toEqual({
      kind: "business",
      message: "Active session limit reached",
      upstreamCode: "AUTH_SESSION_LIMIT",
    })
  })

  it("recognizes new_api_error even when it has no usable message", () => {
    expect(
      decodeNewApiResponseError(
        response(
          {
            error: {
              code: "group_forbidden",
              message: "   ",
              type: "new_api_error",
            },
          },
          403,
        ),
        { endpoint: "/v1/models" },
      ),
    ).toEqual({
      kind: "business",
      upstreamCode: "group_forbidden",
    })
  })

  it("keeps an ordinary response message without claiming a business error", () => {
    expect(
      decodeNewApiResponseError(
        response({ message: "Request rejected" }, 400),
        { endpoint: "/api/example" },
      ),
    ).toEqual({
      kind: "http",
      message: "Request rejected",
    })
  })

  it("returns null for unknown envelopes and drops unsafe upstream codes", () => {
    expect(
      decodeNewApiResponseError(response({ detail: "Unknown shape" }), {
        endpoint: "/api/example",
      }),
    ).toBeNull()

    expect(
      decodeNewApiResponseError(
        response({
          success: false,
          code: "unsafe code!",
          message: "Rejected",
        }),
        { endpoint: "/api/example" },
      ),
    ).toEqual({
      kind: "business",
      message: "Rejected",
    })
  })
})
