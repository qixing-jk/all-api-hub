import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { claudeCodeHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/claudeCodeHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://cch-mask.example.invalid",
  adminToken: "admin",
}

describe("Claude Code Hub mask matching evidence", () => {
  it.each([
    ["abcd••••••1234", [{ prefix: "abcd", suffix: "1234" }]],
    ["••••••", undefined],
    ["abcd******1234", [{ prefix: "abcd", suffix: "1234" }]],
    ["ab••123456", [{ prefix: "ab", suffix: "123456" }]],
    ["abcdef●123", [{ prefix: "abcdef", suffix: "123" }]],
    ["ab…1234", [{ prefix: "ab", suffix: "1234" }]],
    ["ab...1234", [{ prefix: "ab", suffix: "1234" }]],
    ["••1234", [{ prefix: "", suffix: "1234" }]],
    ["abcd••", [{ prefix: "abcd", suffix: "" }]],
    ["ab••cd••••1234", undefined],
    ["ab[redacted]1234", undefined],
  ])(
    "preserves edge evidence across inventory mask format changes: %s",
    async (maskedKey, expected) => {
      server.use(
        http.get(`${config.baseUrl}/api/v1/providers`, () =>
          HttpResponse.json({
            items: [
              {
                id: 1,
                name: "Provider",
                url: "https://source.example",
                maskedKey,
                providerType: "openai-compatible",
                allowedModels: [],
              },
            ],
          }),
        ),
      )
      const result = await claudeCodeHubManagedSiteCapabilities.matching.search(
        config,
        "https://source.example",
      )
      expect(result?.items[0]?.keyMasks).toEqual(expected)
      expect(result?.items[0]?.key).toBe("")
    },
  )
})
