import { describe, expect, it } from "vitest"

import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

describe("sanitizeUrlForLog", () => {
  it("drops query parameters and fragments from valid URLs", () => {
    expect(
      sanitizeUrlForLog("https://example.com/path/to?q=secret#fragment"),
    ).toBe("https://example.com/path/to")
  })

  it("drops query parameters and fragments from relative endpoints", () => {
    expect(sanitizeUrlForLog("/usage?token=secret#fragment")).toBe("/usage")
  })

  it("returns the original string when the input is not a parseable URL", () => {
    expect(sanitizeUrlForLog("not a valid url")).toBe("not a valid url")
  })
})
