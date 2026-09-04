import { describe, expect, it } from "vitest"

import { mapCompatibilityResponse } from "~/services/apiTransport/compatibilityResponse"
import { ApiError } from "~/services/apiTransport/errors"

describe("mapCompatibilityResponse", () => {
  it("does not inspect the heuristic body after a provider message is found", () => {
    const body = new Proxy<Record<string, unknown>>(
      {},
      {
        ownKeys: () => {
          throw new Error("heuristic body must not be inspected")
        },
      },
    )

    expect(() =>
      mapCompatibilityResponse(
        { ok: false, status: 400, headers: {}, body },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
          errorResponseDecoder: () => ({
            kind: "http",
            message: "Provider message",
          }),
        },
      ),
    ).toThrow("Provider message")
  })

  it("uses the fixed fallback instead of a message below a sensitive key", () => {
    const sensitiveMessage = "credential-value-must-not-be-selected"
    let error: unknown

    try {
      mapCompatibilityResponse(
        {
          ok: false,
          status: 400,
          headers: {},
          body: { token: { message: sensitiveMessage } },
        },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
        },
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      message: "请求失败: 400",
      endpoint: "/api/example",
    })
    expect((error as Error).message).not.toContain(sensitiveMessage)
  })
})
