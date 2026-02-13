import { describe, expect, it } from "vitest"

import { buildApiKey } from "~/tests/test-utils/factories"
import {
  extractApiCheckCredentialsFromText,
  normalizeApiCheckBaseUrl,
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/utils/webAiApiCheck"

describe("webAiApiCheck utils", () => {
  describe("normalizeApiCheckBaseUrl", () => {
    it("adds https:// when missing and strips query/hash", () => {
      expect(normalizeApiCheckBaseUrl("example.com/api?x=1#hash")).toBe(
        "https://example.com/api",
      )
    })

    it("returns null for non-http(s) urls", () => {
      expect(normalizeApiCheckBaseUrl("chrome://extensions")).toBeNull()
    })
  })

  describe("normalizeOpenAiFamilyBaseUrl", () => {
    it("strips /v1 and preserves subpaths", () => {
      expect(normalizeOpenAiFamilyBaseUrl("https://example.com/api/v1")).toBe(
        "https://example.com/api",
      )
    })

    it("strips endpoint suffixes after /v1", () => {
      expect(
        normalizeOpenAiFamilyBaseUrl(
          "https://example.com/api/v1/chat/completions",
        ),
      ).toBe("https://example.com/api")
    })

    it("avoids duplicated /v1 segments", () => {
      expect(
        normalizeOpenAiFamilyBaseUrl("https://example.com/v1/v1/models"),
      ).toBe("https://example.com")
    })
  })

  describe("normalizeGoogleFamilyBaseUrl", () => {
    it("strips /v1beta and preserves subpaths", () => {
      expect(
        normalizeGoogleFamilyBaseUrl("https://example.com/api/v1beta"),
      ).toBe("https://example.com/api")
    })

    it("strips endpoint suffixes after /v1beta", () => {
      expect(
        normalizeGoogleFamilyBaseUrl(
          "https://example.com/api/v1beta/models/gemini-2.0-flash:predict",
        ),
      ).toBe("https://example.com/api")
    })

    it("avoids duplicated /v1beta segments", () => {
      expect(
        normalizeGoogleFamilyBaseUrl(
          "https://example.com/v1beta/v1beta/models",
        ),
      ).toBe("https://example.com")
    })
  })

  describe("extractApiCheckCredentialsFromText", () => {
    it("returns nulls for empty input", () => {
      expect(extractApiCheckCredentialsFromText("")).toEqual({
        baseUrlCandidates: [],
        apiKeyCandidates: [],
        baseUrl: null,
        apiKey: null,
      })
    })

    it("extracts baseUrl + apiKey from labeled text", () => {
      const apiKey = buildApiKey()
      const result = extractApiCheckCredentialsFromText(
        ["Base URL: https://example.com/api/v1", `API Key: ${apiKey}`].join(
          "\n",
        ),
      )

      expect(result.baseUrl).toBe("https://example.com/api")
      expect(result.apiKey).toBe(apiKey)
      expect(result.baseUrlCandidates).toContain("https://example.com/api/v1")
    })

    it("extracts credentials from a curl snippet", () => {
      const apiKey = buildApiKey()
      const result = extractApiCheckCredentialsFromText(
        [
          'curl "https://proxy.example.com/openai/v1/chat/completions" \\',
          `  -H "Authorization: Bearer ${apiKey}" \\`,
          '  -d \'{"model":"gpt-4o-mini"}\'',
        ].join("\n"),
      )

      expect(result.baseUrl).toBe("https://proxy.example.com/openai")
      expect(result.apiKey).toBe(apiKey)
    })
  })
})
