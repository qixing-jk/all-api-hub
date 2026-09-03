import { describe, expect, it } from "vitest"

import { decodeOpenRouterResponseError } from "~/services/apiService/openrouter/responseError"

const response = (body: unknown, status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeOpenRouterResponseError", () => {
  it("decodes the documented nested HTTP error and numeric code", () => {
    expect(
      decodeOpenRouterResponseError(
        response(
          {
            error: {
              code: 403,
              message: "Only management keys can perform this operation",
            },
          },
          403,
        ),
        { endpoint: "/credits" },
      ),
    ).toEqual({
      kind: "http",
      message: "Only management keys can perform this operation",
      upstreamCode: "403",
    })
  })

  it("does not interpret a successful response as an error", () => {
    expect(
      decodeOpenRouterResponseError(
        response({ error: { code: 200, message: "ignored" } }, 200),
        { endpoint: "/key" },
      ),
    ).toBeNull()
  })

  it("returns null for undocumented error shapes", () => {
    expect(
      decodeOpenRouterResponseError(response({ error: "denied" }, 401), {
        endpoint: "/key",
      }),
    ).toBeNull()
  })

  it("returns null when the nested error has no usable message", () => {
    expect(
      decodeOpenRouterResponseError(
        response({ error: { code: 401, message: "  " } }, 401),
        { endpoint: "/key" },
      ),
    ).toBeNull()
  })

  it("rejects undocumented string codes instead of guessing the envelope", () => {
    expect(
      decodeOpenRouterResponseError(
        response({ error: { code: "403", message: "Denied" } }, 403),
        { endpoint: "/credits" },
      ),
    ).toBeNull()
  })
})
