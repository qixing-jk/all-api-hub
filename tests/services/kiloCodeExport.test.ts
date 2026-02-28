import { describe, expect, it } from "vitest"

import { buildKiloCodeApiConfigs } from "~/services/integrations/kiloCodeExport"

describe("buildKiloCodeApiConfigs", () => {
  it("normalizes openAiBaseUrl to end with /v1 without duplicating segments", () => {
    const { apiConfigs } = buildKiloCodeApiConfigs({
      selections: [
        {
          accountId: "a",
          siteName: "Example",
          baseUrl: "https://x.test",
          tokenId: 1,
          tokenName: "Default",
          tokenKey: "sk-test",
        },
        {
          accountId: "b",
          siteName: "Example2",
          baseUrl: "https://y.test/v1/",
          tokenId: 2,
          tokenName: "Default",
          tokenKey: "sk-test-2",
        },
      ],
      generateId: (name) => `id-${name}`,
    })

    expect(apiConfigs["Example - Default"].openAiBaseUrl).toBe(
      "https://x.test/v1",
    )
    expect(apiConfigs["Example2 - Default"].openAiBaseUrl).toBe(
      "https://y.test/v1",
    )
  })

  it("disambiguates duplicate profile names by appending the domain", () => {
    const { profileNames } = buildKiloCodeApiConfigs({
      selections: [
        {
          accountId: "a",
          siteName: "Example",
          baseUrl: "https://a.test",
          tokenId: 1,
          tokenName: "Default",
          tokenKey: "sk-a",
        },
        {
          accountId: "b",
          siteName: "Example",
          baseUrl: "https://b.test/v1",
          tokenId: 2,
          tokenName: "Default",
          tokenKey: "sk-b",
        },
      ],
      generateId: (name) => `id-${name}`,
    })

    expect(profileNames).toEqual([
      "Example - Default (a.test)",
      "Example - Default (b.test)",
    ])
  })

  it("falls back to deterministic numbering when duplicates still collide after domain disambiguation", () => {
    const { profileNames } = buildKiloCodeApiConfigs({
      selections: [
        {
          accountId: "a",
          siteName: "Example",
          baseUrl: "https://a.test/path1",
          tokenId: 1,
          tokenName: "Default",
          tokenKey: "sk-a1",
        },
        {
          accountId: "b",
          siteName: "Example",
          baseUrl: "https://a.test/path2",
          tokenId: 2,
          tokenName: "Default",
          tokenKey: "sk-a2",
        },
      ],
      generateId: (name) => `id-${name}`,
    })

    expect(profileNames).toEqual([
      "Example - Default (a.test) #1",
      "Example - Default (a.test) #2",
    ])
  })

  it("returns empty output when no selections are provided", () => {
    const result = buildKiloCodeApiConfigs({
      selections: [],
      generateId: (name) => `id-${name}`,
    })

    expect(result.apiConfigs).toEqual({})
    expect(result.profileNames).toEqual([])
  })

  it("includes openAiModelId when a model id is provided", () => {
    const { apiConfigs } = buildKiloCodeApiConfigs({
      selections: [
        {
          accountId: "a",
          siteName: "Example",
          baseUrl: "https://x.test",
          tokenId: 1,
          tokenName: "Default",
          tokenKey: "sk-test",
          modelId: "gpt-4o-mini",
        },
      ],
      generateId: (name) => `id-${name}`,
    })

    expect(apiConfigs["Example - Default"].openAiModelId).toBe("gpt-4o-mini")
  })
})
