import { describe, expect, it } from "vitest"

import { decodeVeloeraResponseError } from "~/services/apiService/veloera/responseError"

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeVeloeraResponseError", () => {
  it("recognizes Veloera channel business-error envelopes", () => {
    expect(
      decodeVeloeraResponseError(
        response({
          success: false,
          message: "Channel configuration was rejected",
        }),
        { endpoint: "/api/channel" },
      ),
    ).toEqual({
      kind: "business",
      message: "Channel configuration was rejected",
    })
  })

  it("recognizes Veloera's nested panic response as an HTTP error", () => {
    expect(
      decodeVeloeraResponseError(
        response(
          {
            error: {
              message: "Unexpected upstream failure",
              type: "veloera_panic",
            },
          },
          500,
        ),
        {
          endpoint: "/api/channel",
        },
      ),
    ).toEqual({ kind: "http", message: "Unexpected upstream failure" })
  })

  it("returns null for unknown envelopes and keeps blank failures classified", () => {
    expect(
      decodeVeloeraResponseError(response({ detail: "Unknown shape" }), {
        endpoint: "/api/channel",
      }),
    ).toBeNull()

    expect(
      decodeVeloeraResponseError(
        response({ message: "Unverified shape" }, 400),
        {
          endpoint: "/api/channel",
        },
      ),
    ).toBeNull()

    expect(
      decodeVeloeraResponseError(
        response({
          success: false,
          message: "   ",
        }),
        { endpoint: "/api/channel" },
      ),
    ).toEqual({ kind: "business" })
  })
})
