import { describe, expect, it } from "vitest"

import { decodeOpenAICompatibleResponseError } from "~/services/aiApi/openaiCompatible/responseError"

const response = (body: unknown, status = 400) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeOpenAICompatibleResponseError", () => {
  it("decodes the documented nested OpenAI error envelope", () => {
    expect(
      decodeOpenAICompatibleResponseError(
        response({
          error: {
            type: "invalid_request_error",
            code: "model_not_found",
            message: "The requested model does not exist",
          },
        }),
        { endpoint: "/v1/models" },
      ),
    ).toEqual({
      kind: "http",
      message: "The requested model does not exist",
      upstreamCode: "model_not_found",
    })
  })

  it("does not claim successful or non-OpenAI error shapes", () => {
    expect(
      decodeOpenAICompatibleResponseError(
        response({ error: { message: "ignored" } }, 200),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
    expect(
      decodeOpenAICompatibleResponseError(
        response({ message: "top-level compatibility message" }),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
    expect(
      decodeOpenAICompatibleResponseError(
        response({ error: { message: "generic nested message" } }),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
    expect(
      decodeOpenAICompatibleResponseError(
        response({ error: "invalid_api_key" }),
        { endpoint: "/v1/models" },
      ),
    ).toBeNull()
  })
})
