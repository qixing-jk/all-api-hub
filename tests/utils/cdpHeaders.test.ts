import { describe, expect, it } from "vitest"

import { getCdpHeader } from "~~/e2e/utils/cdpHeaders"

describe("getCdpHeader", () => {
  it("reads mixed-case HTTP headers", () => {
    expect(getCdpHeader({ "User-Agent": "client/1" }, "user-agent")).toBe(
      "client/1",
    )
  })

  it("reads request headers alongside HTTP/2 pseudo-headers", () => {
    const headers = {
      ":authority": "example.test",
      ":method": "GET",
      "user-agent": "client/2",
      Authorization: "Bearer test-key",
    }

    expect(getCdpHeader(headers, "User-Agent")).toBe("client/2")
    expect(getCdpHeader(headers, "authorization")).toBe("Bearer test-key")
    expect(getCdpHeader(headers, "x-absent")).toBeUndefined()
  })
})
