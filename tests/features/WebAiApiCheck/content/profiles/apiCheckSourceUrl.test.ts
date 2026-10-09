import { describe, expect, it } from "vitest"

import { normalizeApiCheckSourceUrl } from "~/features/WebAiApiCheck/content/profiles/apiCheckSourceUrl"

describe("normalizeApiCheckSourceUrl", () => {
  it("keeps a trimmed full HTTP(S) URL including path, query, and hash", () => {
    expect(
      normalizeApiCheckSourceUrl(
        "  https://forum.example.com/t/42?p=2#reply  ",
      ),
    ).toBe("https://forum.example.com/t/42?p=2#reply")
  })

  it("returns undefined for empty, malformed, or non-HTTP(S) input", () => {
    for (const value of [
      "",
      "   ",
      undefined,
      null,
      "not a url",
      "ftp://forum.example.com/t/1",
      "javascript:alert(1)",
    ]) {
      expect(normalizeApiCheckSourceUrl(value)).toBeUndefined()
    }
  })
})
