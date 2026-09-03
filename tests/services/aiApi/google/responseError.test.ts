import { describe, expect, it } from "vitest"

import { decodeGoogleResponseError } from "~/services/aiApi/google/responseError"

const response = (body: unknown, status = 400) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeGoogleResponseError", () => {
  it("decodes Google's documented REST error status", () => {
    expect(
      decodeGoogleResponseError(
        response({
          error: {
            code: 400,
            message: "API key not valid",
            status: "INVALID_ARGUMENT",
            details: [],
          },
        }),
        { endpoint: "/v1beta/models" },
      ),
    ).toEqual({
      kind: "http",
      message: "API key not valid",
      upstreamCode: "INVALID_ARGUMENT",
    })
  })

  it("returns null for successful and non-Google error shapes", () => {
    expect(
      decodeGoogleResponseError(
        response(
          {
            error: {
              code: 400,
              message: "ignored",
              status: "INVALID_ARGUMENT",
            },
          },
          200,
        ),
        { endpoint: "/v1beta/models" },
      ),
    ).toBeNull()
    expect(
      decodeGoogleResponseError(
        response({ error: { message: "missing status fields" } }),
        { endpoint: "/v1beta/models" },
      ),
    ).toBeNull()
  })
})
