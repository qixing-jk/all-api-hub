import { describe, expect, it } from "vitest"

import { mapCompatibilityResponse } from "~/services/apiTransport/compatibilityResponse"

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
})
