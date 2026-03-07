import { describe, expect, it } from "vitest"

import {
  buildDefaultCliProxyProviderBaseUrl,
  CLI_PROXY_PROVIDER_TYPES,
  mapApiTypeHintToCliProxyProviderType,
  normalizeCliProxyProviderBaseUrl,
} from "~/services/integrations/cliProxyProviderTypes"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

describe("cliProxyProviderTypes", () => {
  it("maps API type hints to the expected CLIProxy provider type", () => {
    const cases: Array<[ApiVerificationApiType | undefined, string]> = [
      [undefined, CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY],
      [
        API_TYPES.OPENAI_COMPATIBLE,
        CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
      ],
      [API_TYPES.OPENAI, CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY],
      [API_TYPES.ANTHROPIC, CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY],
      [API_TYPES.GOOGLE, CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY],
    ]

    for (const [apiTypeHint, expected] of cases) {
      expect(mapApiTypeHintToCliProxyProviderType(apiTypeHint)).toBe(expected)
    }
  })

  it("normalizes provider-family-specific base URLs", () => {
    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
        "https://example.com/gateway",
      ),
    ).toBe("https://example.com/gateway/v1")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY,
        "https://example.com/proxy/v1/messages?beta=true",
      ),
    ).toBe("https://example.com/proxy")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY,
        "https://example.com/proxy/v1",
      ),
    ).toBe("https://example.com/proxy/v1")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY,
        "",
      ),
    ).toBe("")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY,
        "https://example.com/genai/v1beta/models/gemini-2.5-pro:generateContent",
      ),
    ).toBe("https://example.com/genai")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY,
        "https://example.com/genai/v1beta",
      ),
    ).toBe("https://example.com/genai/v1beta")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY,
        "https://example.com/router/backend-api/codex/v1/chat/completions",
      ),
    ).toBe("https://example.com/router")

    expect(
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY,
        "https://example.com/router/v1",
      ),
    ).toBe("https://example.com/router/v1")
  })

  it("builds provider-aware defaults without duplicating /v1", () => {
    expect(
      buildDefaultCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
        "https://x.test/v1",
      ),
    ).toBe("https://x.test/v1")

    expect(
      buildDefaultCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY,
        "https://api.openai.com",
      ),
    ).toBe("https://api.openai.com")
  })
})
