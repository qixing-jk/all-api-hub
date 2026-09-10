import { describe, expect, it } from "vitest"

import { decodeAnthropicResponseError } from "~/services/aiApi/anthropic/responseError"

const response = (body: unknown, status = 400) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeAnthropicResponseError", () => {
  it("decodes Anthropic's documented error envelope", () => {
    expect(
      decodeAnthropicResponseError(
        response(
          {
            type: "error",
            error: {
              type: "authentication_error",
              message: "Invalid API key",
            },
            request_id: "req_example",
          },
          401,
        ),
        { endpoint: "/v1/models" },
      ),
    ).toEqual({
      kind: "http",
      message: "Invalid API key",
      upstreamCode: "authentication_error",
    })
  })

  it("returns null for successful and non-Anthropic envelopes", () => {
    expect(
      decodeAnthropicResponseError(
        response(
          { type: "error", error: { type: "api_error", message: "ignored" } },
          200,
        ),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
    expect(
      decodeAnthropicResponseError(
        response({ error: { type: "api_error", message: "missing marker" } }),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
  })
})
