import { describe, expect, it } from "vitest"

import {
  extractApiCheckCredentialsFromText,
  normalizeApiCheckBaseUrl,
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/services/verification/webAiApiCheck/extractCredentials"

const OPENAI_KEY_PREFIX = ["s", "k", "-"].join("")
const ANTHROPIC_KEY_PREFIX = ["s", "k", "-", "ant", "-"].join("")
const OPENROUTER_KEY_PREFIX = ["s", "k", "-", "or", "-"].join("")
const GOOGLE_KEY_PREFIX = ["A", "I", "z", "a"].join("")
const TP_KEY_PREFIX = ["t", "p", "-"].join("")

function buildKnownKey(body: string, prefix = OPENAI_KEY_PREFIX): string {
  return `${prefix}${body}`
}

describe("webAiApiCheck extractCredentials", () => {
  it("normalizes loose base urls by trimming wrappers, adding https, and dropping query fragments", () => {
    expect(
      normalizeApiCheckBaseUrl(
        "  ('proxy.example.com/api/v1/models?x=1#hash'), ",
      ),
    ).toBe("https://proxy.example.com/api/v1/models")
  })

  it("strips provider-specific version segments while preserving deployment subpaths", () => {
    expect(
      normalizeOpenAiFamilyBaseUrl(
        "https://proxy.example.com/gateway/api/v1/chat/completions",
      ),
    ).toBe("https://proxy.example.com/gateway/api")

    expect(
      normalizeOpenAiFamilyBaseUrl("https://proxy.example.com/gateway/api"),
    ).toBe("https://proxy.example.com/gateway/api")

    expect(
      normalizeGoogleFamilyBaseUrl(
        "https://proxy.example.com/gateway/api/v1beta/models",
      ),
    ).toBe("https://proxy.example.com/gateway/api")

    expect(normalizeOpenAiFamilyBaseUrl("not a valid url")).toBeNull()
  })

  it("returns an empty extraction result for blank text", () => {
    expect(extractApiCheckCredentialsFromText("   ")).toEqual({
      baseUrlCandidates: [],
      apiKeyCandidates: [],
      candidates: { baseUrls: [], apiKeys: [] },
      summary: {
        hasEnhancedBaseUrl: false,
        hasEnhancedApiKey: false,
        hasCleanup: false,
        usesEnhancedResult: false,
        autoPromptEligible: false,
        enhancedAutoPromptEligible: false,
      },
      baseUrl: null,
      apiKey: null,
    })
  })

  it("returns structured candidate metadata while preserving best-match aliases", () => {
    const apiKey = buildKnownKey("test-structured-candidate-fixture")
    const result = extractApiCheckCredentialsFromText(`
      endpoint=https://proxy.example.com/api/v1/chat/completions
      Authorization: Bearer ${apiKey}
    `)

    expect(result.baseUrl).toBe("https://proxy.example.com/api")
    expect(result.apiKey).toBe(apiKey)
    expect(result.baseUrlCandidates[0]).toBe("https://proxy.example.com/api")
    expect(result.apiKeyCandidates[0]).toBe(apiKey)

    expect(result.candidates.baseUrls[0]).toEqual(
      expect.objectContaining({
        value: "https://proxy.example.com/api",
        kind: "baseUrl",
        confidence: "standard",
      }),
    )
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        kind: "apiKey",
        confidence: "standard",
      }),
    )
    expect(result.summary).toEqual({
      hasEnhancedBaseUrl: false,
      hasEnhancedApiKey: false,
      hasCleanup: false,
      usesEnhancedResult: false,
      autoPromptEligible: true,
      enhancedAutoPromptEligible: false,
    })
  })

  it("extracts standard base_url and KEY assignments without requiring enhanced detection", () => {
    const apiKey = buildKnownKey(
      "teststandardkeyassignmentfixture000000000000000000000000000000",
    )
    const result = extractApiCheckCredentialsFromText(`
      base_url = https://dxb.huifei.net/v1

      KEY = ${apiKey}
    `)

    expect(result.baseUrl).toBe("https://dxb.huifei.net")
    expect(result.apiKey).toBe(apiKey)
    expect(result.summary).toEqual({
      hasEnhancedBaseUrl: false,
      hasEnhancedApiKey: false,
      hasCleanup: false,
      usesEnhancedResult: false,
      autoPromptEligible: true,
      enhancedAutoPromptEligible: false,
    })
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        confidence: "standard",
        reasons: expect.arrayContaining(["labeled", "knownPrefix"]),
      }),
    )
  })

  it("deduplicates structured candidates by value while merging reasons", () => {
    const apiKey = buildKnownKey("test-deduplicate-candidate-fixture")
    const result = extractApiCheckCredentialsFromText(`
      endpoint=https://proxy.example.com/api/v1/models
      https://proxy.example.com/api/v1/models
      token=${apiKey}
      ${apiKey}
    `)

    expect(result.baseUrlCandidates).toEqual([
      "https://proxy.example.com/api",
      "https://proxy.example.com/api/v1/models",
    ])
    expect(result.apiKeyCandidates).toEqual([apiKey])
    expect(result.candidates.baseUrls[0].reasons).toContain("pathNormalized")
    expect(result.candidates.apiKeys[0].reasons).toContain("labeled")
    expect(result.candidates.apiKeys[0].reasons).toContain("knownPrefix")
  })

  it("preserves first extracted key when same-priority candidates have different lengths", () => {
    const result = extractApiCheckCredentialsFromText(`
      api_key=fake-longer-first-candidate-fixture
      token=fake-short-second
    `)

    expect(result.apiKey).toBe("fake-longer-first-candidate-fixture")
    expect(result.apiKeyCandidates).toEqual([
      "fake-longer-first-candidate-fixture",
      "fake-short-second",
    ])
  })

  it("prioritizes key candidates by final key-likeness over extraction source", () => {
    const likelyKey = "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"
    const result = extractApiCheckCredentialsFromText(`
      token=fake-not-the-best-candidate-but-long-enough
      copied ${likelyKey}
    `)

    expect(result.apiKey).toBe(likelyKey)
    expect(result.apiKeyCandidates[0]).toBe(likelyKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining(["unknownShortPrefix"]),
      }),
    )
  })

  it("prioritizes labeled urls, deduplicates generic repeats, and captures multiple provider keys", () => {
    const apiKey = buildKnownKey("test-provider-key-12345")
    const googleKey = buildKnownKey(
      "TESTKEYAa1Bb2Cc3Dd4Ee5Ff6",
      GOOGLE_KEY_PREFIX,
    )
    const text = `
      endpoint=https://proxy.example.com/api/v1/chat/completions
      curl https://proxy.example.com/api/v1/chat/completions
      Authorization: Bearer ${apiKey}
      google_key=${googleKey}
    `

    expect(extractApiCheckCredentialsFromText(text)).toMatchObject({
      baseUrlCandidates: [
        "https://proxy.example.com/api",
        "https://proxy.example.com/api/v1/chat/completions",
      ],
      apiKeyCandidates: [apiKey, googleKey],
      baseUrl: "https://proxy.example.com/api",
      apiKey,
    })
  })

  it("adds a google-normalized candidate when v1beta urls are extracted from labeled config", () => {
    const text = `
      proxy_url=https://proxy.example.com/api/v1beta/models
      https://proxy.example.com/api/v1beta/models
    `

    expect(extractApiCheckCredentialsFromText(text)).toMatchObject({
      baseUrlCandidates: [
        "https://proxy.example.com/api",
        "https://proxy.example.com/api/v1beta/models",
      ],
      apiKeyCandidates: [],
      baseUrl: "https://proxy.example.com/api",
      apiKey: null,
    })
  })

  it("recognizes bare domain base URLs and adds https", () => {
    const apiKey = buildKnownKey("test-bare-domain-fixture-12345")
    const result = extractApiCheckCredentialsFromText(`
      Use api.example.com with key ${apiKey}
    `)

    expect(result.baseUrlCandidates).toContain("https://api.example.com")
    expect(result.candidates.baseUrls[0]).toEqual(
      expect.objectContaining({
        value: "https://api.example.com",
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining(["bareDomain", "schemeAdded"]),
      }),
    )
    expect(result.summary.hasEnhancedBaseUrl).toBe(true)
    expect(result.summary.usesEnhancedResult).toBe(true)
  })

  it("classifies labeled bare domain base URLs as enhanced", () => {
    const apiKey = buildKnownKey("test-labeled-bare-domain-fixture-12345")
    const result = extractApiCheckCredentialsFromText(`
      endpoint=api.example.com
      ${apiKey}
    `)

    expect(result.baseUrlCandidates[0]).toBe("https://api.example.com")
    expect(result.candidates.baseUrls[0]).toEqual(
      expect.objectContaining({
        value: "https://api.example.com",
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining(["bareDomain", "schemeAdded"]),
      }),
    )
    expect(result.summary.hasEnhancedBaseUrl).toBe(true)
    expect(result.summary.usesEnhancedResult).toBe(true)
  })

  it("keeps the strongest confidence when duplicate base URL candidates merge", () => {
    const result = extractApiCheckCredentialsFromText(`
      endpoint=proxy.example.com/api
      https://proxy.example.com/api
    `)

    expect(result.baseUrlCandidates).toEqual(["https://proxy.example.com/api"])
    expect(result.candidates.baseUrls[0]).toEqual(
      expect.objectContaining({
        value: "https://proxy.example.com/api",
        confidence: "standard",
        reasons: expect.arrayContaining([
          "labeled",
          "bareDomain",
          "schemeAdded",
          "genericUrl",
        ]),
      }),
    )
  })

  it("normalizes bare domain endpoint paths through provider-family rules", () => {
    const apiKey = buildKnownKey("test-bare-path-fixture-123456789")
    const result = extractApiCheckCredentialsFromText(`
      proxy.example.com/api/v1/chat/completions
      ${apiKey}
    `)

    expect(result.baseUrlCandidates).toEqual(
      expect.arrayContaining([
        "https://proxy.example.com/api",
        "https://proxy.example.com/api/v1/chat/completions",
      ]),
    )
    expect(result.baseUrl).toBe("https://proxy.example.com/api")
  })

  it("does not treat emails, filenames, versions, or plain words as bare URLs", () => {
    const apiKey = buildKnownKey("test-filter-bare-domain-fixture")
    const result = extractApiCheckCredentialsFromText(`
      Contact ops@example.com
      Open README.md
      Version 3.41.1
      The token is ${apiKey}
    `)

    expect(result.baseUrlCandidates).toEqual([])
  })

  it("ignores invalid labeled values and falls back to plain provider token matches", () => {
    const apiKey = buildKnownKey("test-fallback-fixture-12345")
    const googleKey = buildKnownKey("TESTKEYAa1Bb2Cc3Dd4", GOOGLE_KEY_PREFIX)
    const text = `
      baseURL=[]
      Authorization: Bearer []
      secret=[]
      plain ${apiKey}
      extra ${googleKey}
    `

    expect(extractApiCheckCredentialsFromText(text)).toMatchObject({
      baseUrlCandidates: [],
      apiKeyCandidates: [apiKey, googleKey],
      baseUrl: null,
      apiKey,
    })
  })

  it("recognizes known multi-segment key prefixes", () => {
    const anthropicKey = buildKnownKey(
      "api03-testFixtureAa1Bb2Cc3Dd4Ee5Ff6",
      ANTHROPIC_KEY_PREFIX,
    )
    const openRouterKey = buildKnownKey(
      "v1-testFixtureAa1Bb2Cc3Dd4Ee5Ff6",
      OPENROUTER_KEY_PREFIX,
    )
    const anthropic = extractApiCheckCredentialsFromText(anthropicKey)
    const openRouter = extractApiCheckCredentialsFromText(openRouterKey)

    expect(anthropic.apiKey).toBe(anthropicKey)
    expect(anthropic.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "standard",
        reasons: expect.arrayContaining(["knownPrefix", "multiSegment"]),
      }),
    )
    expect(openRouter.apiKey).toBe(openRouterKey)
  })

  it("recognizes unknown short-prefix keys with long random bodies", () => {
    const result = extractApiCheckCredentialsFromText(
      "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
    )

    expect(result.apiKey).toBe("test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining(["unknownShortPrefix"]),
      }),
    )
  })

  it("marks unknown short-prefix keys with multiple segments", () => {
    const result = extractApiCheckCredentialsFromText(
      "test-Aa1Bb2Cc3Dd4Ee5Ff6-Gg7Hh8Ii9Jj0Kk1",
    )

    expect(result.apiKey).toBe("test-Aa1Bb2Cc3Dd4Ee5Ff6-Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining(["unknownShortPrefix", "multiSegment"]),
      }),
    )
  })

  it("recognizes tp-prefixed keys as known provider tokens", () => {
    const fixtureKey = buildKnownKey(
      "fixture000000000000000000000000",
      TP_KEY_PREFIX,
    )
    const result = extractApiCheckCredentialsFromText(fixtureKey)

    expect(result.apiKey).toBe(fixtureKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "standard",
        reasons: expect.arrayContaining(["knownPrefix"]),
      }),
    )
  })

  it("downgrades unknown long-prefix keys unless paired with base URL", () => {
    const result = extractApiCheckCredentialsFromText(
      "longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
    )

    expect(result.apiKey).toBe("longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedMedium",
        autoPromptEligible: false,
        reasons: expect.arrayContaining(["unknownLongPrefix"]),
      }),
    )
  })

  it("marks cleaned unknown long-prefix keys as manual enhanced candidates", () => {
    const result = extractApiCheckCredentialsFromText(
      "longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9#Jj0Kk1",
    )

    expect(result.apiKey).toBe("longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedMedium",
        cleanupApplied: true,
        autoPromptEligible: false,
        reasons: expect.arrayContaining([
          "unknownLongPrefix",
          "illegalCharsRemoved",
        ]),
      }),
    )
  })

  it("cleans illegal characters inside suspected key windows", () => {
    const cleanedKey = buildKnownKey("testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const result = extractApiCheckCredentialsFromText(
      `${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4Ee5Ff6Gg【删除这里]7Hh8Ii9Jj0Kk1`,
    )

    expect(result.apiKey).toBe(cleanedKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        cleanupApplied: true,
        reasons: expect.arrayContaining(["illegalCharsRemoved"]),
      }),
    )
    expect(result.summary.hasCleanup).toBe(true)
  })

  it("keeps cleaned known-prefix keys ahead of truncated prefix matches", () => {
    const cleanedKey = buildKnownKey(
      "testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn",
    )
    const result = extractApiCheckCredentialsFromText(`
      https://example.test

      示例测试内容 key：${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4Ee5Ff6Gg删除这里7Hh8Ii9Jj0Kk1Ll2Mm3Nn （示例结束）
    `)

    expect(result.apiKey).toBe(cleanedKey)
    expect(result.apiKeyCandidates[0]).toBe(cleanedKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        cleanupApplied: true,
        reasons: expect.arrayContaining(["knownPrefix", "illegalCharsRemoved"]),
      }),
    )
  })

  it("merges duplicate known-prefix candidates with cleanup metadata", () => {
    const cleanedKey = buildKnownKey("testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const result = extractApiCheckCredentialsFromText(`
      Authorization: Bearer ${cleanedKey}
      pasted key: ${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9#Jj0Kk1
    `)

    expect(result.apiKeyCandidates[0]).toBe(cleanedKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: cleanedKey,
        cleanupApplied: true,
        autoPromptEligible: true,
        reasons: expect.arrayContaining([
          "authorizationHeader",
          "knownPrefix",
          "illegalCharsRemoved",
        ]),
      }),
    )
  })

  it("keeps the strongest confidence when duplicate candidate windows merge", () => {
    const fixtureKey = buildKnownKey("Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const result = extractApiCheckCredentialsFromText(`
      token: ${fixtureKey}
      ${fixtureKey}
    `)

    expect(result.apiKeyCandidates).toEqual([fixtureKey])
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: fixtureKey,
        confidence: "standard",
        reasons: expect.arrayContaining(["labeled", "knownPrefix"]),
      }),
    )
  })

  it("does not trim unknown short-prefix keys at embedded known-prefix text", () => {
    const fixtureKey = "demo-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"
    const result = extractApiCheckCredentialsFromText(fixtureKey)

    expect(result.apiKey).toBe(fixtureKey)
    expect(result.apiKeyCandidates[0]).toBe(fixtureKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        reasons: expect.arrayContaining(["unknownShortPrefix"]),
      }),
    )
    expect(result.candidates.apiKeys[0].reasons).not.toContain("knownPrefix")
  })

  it("cleans illegal ASCII punctuation inside suspected key windows", () => {
    const cleanedKey = buildKnownKey("testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const result = extractApiCheckCredentialsFromText(
      `${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4Ee5Ff6Gg#7Hh8Ii9Jj0Kk1`,
    )

    expect(result.apiKey).toBe(cleanedKey)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        cleanupApplied: true,
        reasons: expect.arrayContaining(["illegalCharsRemoved"]),
      }),
    )
    expect(result.summary.hasCleanup).toBe(true)
  })

  it("cleans separator characters embedded inside labeled API keys", () => {
    const apiKey = buildKnownKey("testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const separatedApiKey = `${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4 . Ee5Ff6Gg7Hh8Ii9Jj0Kk1`

    const result = extractApiCheckCredentialsFromText(
      `API Key: ${separatedApiKey}`,
    )

    expect(result.apiKey).toBe(apiKey)
    expect(result.summary.hasCleanup).toBe(true)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        cleanupApplied: true,
        reasons: expect.arrayContaining([
          "labeled",
          "knownPrefix",
          "illegalCharsRemoved",
        ]),
      }),
    )
  })

  it("applies custom API key cleanup patterns before classifying candidates", () => {
    const apiKey = buildKnownKey("testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    const result = extractApiCheckCredentialsFromText(
      `
        endpoint=https://proxy.example.com/v1
        API Key: ${OPENAI_KEY_PREFIX}testAa1Bb2Cc3Dd4[[remove-me]]Ee5Ff6Gg7Hh8Ii9Jj0Kk1
      `,
      {
        apiKeyCleanupPatterns: ["\\[\\[remove-me\\]\\]"],
      },
    )

    expect(result.apiKey).toBe(apiKey)
    expect(result.summary.hasCleanup).toBe(true)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        cleanupApplied: true,
        reasons: expect.arrayContaining([
          "labeled",
          "knownPrefix",
          "customRegexRemoved",
        ]),
      }),
    )
  })

  it("applies custom cleanup before unsupported marker characters are stripped", () => {
    const apiKey = "test-key-FixtureAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn"
    const result = extractApiCheckCredentialsFromText(
      "test-key-FixtureAa1Bb2Cc3Dd4Ee5Ff6Gg[deleteme7Hh8Ii9Jj0Kk1Ll2Mm3Nn",
      {
        apiKeyCleanupPatterns: ["\\[deleteme"],
      },
    )

    expect(result.apiKey).toBe(apiKey)
    expect(result.summary.hasCleanup).toBe(true)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        cleanupApplied: true,
        reasons: expect.arrayContaining([
          "customRegexRemoved",
          "unknownShortPrefix",
          "multiSegment",
        ]),
      }),
    )
  })

  it("decodes labeled unpadded base64-obfuscated API keys", () => {
    const apiKey = buildKnownKey("base64Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1A")
    const encodedApiKey = btoa(apiKey).replace(/=+$/, "")

    const result = extractApiCheckCredentialsFromText(
      `API Key: ${encodedApiKey}`,
    )

    expect(result.apiKey).toBe(apiKey)
    expect(result.summary.hasCleanup).toBe(true)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        value: apiKey,
        cleanupApplied: true,
        reasons: expect.arrayContaining([
          "labeled",
          "base64Decoded",
          "knownPrefix",
        ]),
      }),
    )
  })

  it("keeps labeled invalid base64 text as a plain candidate", () => {
    const result = extractApiCheckCredentialsFromText(
      "API Key: AAAAAAAAAAAAAAAAAAAAAAAAAAA+",
    )

    expect(result.apiKeyCandidates).toEqual(["AAAAAAAAAAAAAAAAAAAAAAAAAAA+"])
    expect(result.summary.hasCleanup).toBe(false)
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        reasons: ["labeled"],
      }),
    )
    expect(result.candidates.apiKeys[0]).not.toHaveProperty("cleanupApplied")
  })

  it("does not join unrelated token fields while cleaning", () => {
    const result = extractApiCheckCredentialsFromText(`
      token: abc-def
      next: ghi-jkl
    `)

    expect(result.apiKeyCandidates).toEqual([])
  })

  it("keeps pure unseparated long strings manual-only", () => {
    const result = extractApiCheckCredentialsFromText(
      "TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
    )

    expect(result.apiKey).toBe("TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedMedium",
        autoPromptEligible: false,
        reasons: expect.arrayContaining(["unseparatedLongToken"]),
      }),
    )
  })

  it("prefers separated enhanced keys over unseparated long strings", () => {
    const result = extractApiCheckCredentialsFromText(`
      TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1
      longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1
    `)

    expect(result.apiKey).toBe("longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.apiKeyCandidates).toEqual([
      "longprefix-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
      "TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
    ])
  })

  it("marks cleaned unseparated long strings as manual enhanced candidates", () => {
    const result = extractApiCheckCredentialsFromText(
      "TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9#Jj0Kk1",
    )

    expect(result.apiKey).toBe("TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
    expect(result.candidates.apiKeys[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedMedium",
        cleanupApplied: true,
        autoPromptEligible: false,
        reasons: expect.arrayContaining([
          "unseparatedLongToken",
          "illegalCharsRemoved",
        ]),
      }),
    )
  })

  it("normalizes bare Google-family domains with version paths", () => {
    const result = extractApiCheckCredentialsFromText(
      "generativelanguage.googleapis.com/v1beta/models",
    )

    expect(result.baseUrl).toBe("https://generativelanguage.googleapis.com")
    expect(result.candidates.baseUrls[0]).toEqual(
      expect.objectContaining({
        confidence: "enhancedHigh",
        reasons: expect.arrayContaining([
          "bareDomain",
          "schemeAdded",
          "pathNormalized",
        ]),
      }),
    )
  })
})
