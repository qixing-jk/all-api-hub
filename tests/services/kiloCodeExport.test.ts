import { describe, expect, it } from "vitest"

import {
  buildKiloCodeApiConfigs,
  buildKiloCodeV7SettingsFile,
  KILO_CODE_EXPORT_TARGETS,
} from "~/services/integrations/kiloCodeExport"

const v7Selection = {
  accountId: "account-a",
  siteName: "Example",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  modelId: "example-model",
}

describe("buildKiloCodeV7SettingsFile", () => {
  it("builds a Kilo Code 7.x provider and selects its model", () => {
    const result = buildKiloCodeV7SettingsFile({
      selections: [v7Selection],
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    })
    const providerId = Object.keys(result.provider)[0]

    expect(result).toEqual({
      _meta: {
        version: 1,
        exportedAt: "2026-07-13T00:00:00.000Z",
      },
      provider: {
        [providerId]: {
          npm: "@ai-sdk/openai-compatible",
          models: {
            "example-model": { name: "example-model" },
          },
          options: {
            apiKey: "example-key",
            baseURL: "https://api.example.invalid/v1",
          },
        },
      },
      model: `${providerId}/example-model`,
    })
  })

  it("exposes the supported export targets", () => {
    expect(KILO_CODE_EXPORT_TARGETS).toEqual({
      KiloV7: "kilo-v7",
      Legacy: "legacy",
    })
  })

  it("keeps the provider ID stable when only the secret changes", () => {
    const first = buildKiloCodeV7SettingsFile({ selections: [v7Selection] })
    const second = buildKiloCodeV7SettingsFile({
      selections: [{ ...v7Selection, tokenKey: "rotated-example-key" }],
    })

    expect(Object.keys(first.provider)[0]).toBe(Object.keys(second.provider)[0])
  })

  it("hashes non-BMP provider identities by Unicode character", () => {
    const result = buildKiloCodeV7SettingsFile({
      selections: [{ ...v7Selection, accountId: "account-😀" }],
    })

    expect(Object.keys(result.provider)).toEqual(["example-default-f58ad972"])
  })

  it("creates unique, settings-safe provider IDs", () => {
    const result = buildKiloCodeV7SettingsFile({
      selections: [
        v7Selection,
        {
          ...v7Selection,
          accountId: "account-b",
          siteName: "Second Example",
          tokenId: 8,
        },
      ],
    })
    const providerIds = Object.keys(result.provider)

    expect(new Set(providerIds)).toHaveLength(2)
    expect(providerIds).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[a-z0-9][a-z0-9-]*$/),
        expect.stringMatching(/^[a-z0-9][a-z0-9-]*$/),
      ]),
    )
  })

  it("rejects an empty selection", () => {
    expect(() => buildKiloCodeV7SettingsFile({ selections: [] })).toThrow(
      "Select at least one runtime key",
    )
  })

  it.each([
    ["blank token key", { tokenKey: "  " }],
    ["blank model ID", { modelId: "  " }],
    ["invalid base URL", { baseUrl: "not-a-url" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        selections: [{ ...v7Selection, ...overrides }],
      }),
    ).toThrow()
  })

  it("rejects duplicate generated provider IDs", () => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        selections: [
          v7Selection,
          { ...v7Selection, accountId: "account-b", tokenId: 8 },
        ],
        generateProviderId: () => "duplicate-provider",
      }),
    ).toThrow("Kilo Code provider IDs must be unique")
  })
})

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
