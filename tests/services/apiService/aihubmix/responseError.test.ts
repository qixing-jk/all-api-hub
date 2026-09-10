import { describe, expect, it } from "vitest"

import { decodeAIHubMixResponseError } from "~/services/apiService/aihubmix/responseError"

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})

describe("decodeAIHubMixResponseError", () => {
  it("recognizes AIHubMix success-message business failures", () => {
    expect(
      decodeAIHubMixResponseError(
        response({
          success: false,
          message: "AIHubMix rejected the account session",
          data: null,
        }),
        { endpoint: "/call/usr/self" },
      ),
    ).toEqual({
      kind: "business",
      message: "AIHubMix rejected the account session",
    })
  })

  it("does not guess legacy msg-only or unrelated error shapes", () => {
    expect(
      decodeAIHubMixResponseError(response({ success: false, msg: "denied" }), {
        endpoint: "/call/usr/self",
      }),
    ).toEqual({ kind: "business" })
    expect(
      decodeAIHubMixResponseError(
        response({ error: { message: "unknown shape" } }, 401),
        { endpoint: "/call/usr/self" },
      ),
    ).toBeNull()
  })
})
