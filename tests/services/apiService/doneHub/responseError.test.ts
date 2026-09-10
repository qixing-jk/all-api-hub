import { describe, expect, it } from "vitest"

import { decodeDoneHubResponseError } from "~/services/apiService/doneHub/responseError"

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeDoneHubResponseError", () => {
  it("recognizes DoneHub channel business-error envelopes", () => {
    expect(
      decodeDoneHubResponseError(
        response({
          success: false,
          message: "Channel configuration was rejected",
        }),
        { endpoint: "/api/channel/" },
      ),
    ).toEqual({
      kind: "business",
      message: "Channel configuration was rejected",
    })
  })

  it("does not claim an unverified standalone HTTP message shape", () => {
    expect(
      decodeDoneHubResponseError(
        response({ message: "Unverified shape" }, 400),
        {
          endpoint: "/api/channel/",
        },
      ),
    ).toBeNull()
  })

  it("ignores fields that are not part of DoneHub's managed error contract", () => {
    expect(
      decodeDoneHubResponseError(
        response({
          success: false,
          message: "Channel configuration was rejected",
          code: "unverified_code",
        }),
        { endpoint: "/api/channel/" },
      ),
    ).toEqual({
      kind: "business",
      message: "Channel configuration was rejected",
    })
  })

  it("returns null for unknown envelopes and keeps blank failures classified", () => {
    expect(
      decodeDoneHubResponseError(response({ detail: "Unknown shape" }), {
        endpoint: "/api/channel/",
      }),
    ).toBeNull()

    expect(
      decodeDoneHubResponseError(
        response({
          success: false,
          message: "   ",
        }),
        { endpoint: "/api/channel/" },
      ),
    ).toEqual({ kind: "business" })
  })
})
