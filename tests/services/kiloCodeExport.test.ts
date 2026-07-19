import { describe, expect, it } from "vitest"

import {
  buildKiloCodeApiConfigs,
  buildKiloCodeV7SettingsFile,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeDefaultModelSelection,
  type KiloCodeExportTuple,
  type KiloCodeLegacySelection,
} from "~/services/integrations/kiloCodeExport"
import { prepareKiloCodeV7Catalog } from "~/services/integrations/kiloCodeV7Catalog"

const preparedCatalog = prepareKiloCodeV7Catalog([
  {
    selectionId: "account-a:7",
    accountId: "account-a",
    siteName: "Example",
    baseUrl: "https://api.example.invalid",
    tokenId: 7,
    tokenName: "Default",
    tokenKey: "example-key",
    providerName: "Example - Default",
    discoveredModelIds: ["model-b", "model-a"],
  },
])

const defaultModel: KiloCodeDefaultModelSelection = {
  selectionId: "account-a:7",
  modelId: "model-b",
}

describe("buildKiloCodeV7SettingsFile", () => {
  it("builds named multi-model providers and selects the explicit default", () => {
    const result = buildKiloCodeV7SettingsFile({
      catalog: preparedCatalog,
      defaultModel,
      now: () => new Date("2026-07-17T00:00:00.000Z"),
    })
    const providerId = preparedCatalog.providers[0]!.providerId

    expect(result).toEqual({
      _meta: {
        version: 1,
        exportedAt: "2026-07-17T00:00:00.000Z",
      },
      provider: {
        [providerId]: {
          name: "Example - Default",
          npm: "@ai-sdk/openai-compatible",
          models: {
            "model-a": { name: "model-a" },
            "model-b": { name: "model-b" },
          },
          options: {
            apiKey: "example-key",
            baseURL: "https://api.example.invalid/v1",
          },
        },
      },
      model: `${providerId}/model-b`,
    })
  })

  it("selects a slash-containing model from a non-first provider", () => {
    const catalog = prepareKiloCodeV7Catalog([
      {
        selectionId: "account-a:7",
        accountId: "account-a",
        siteName: "First Example",
        baseUrl: "https://first.example.invalid",
        tokenId: 7,
        tokenName: "Default",
        tokenKey: "first-example-key",
        discoveredModelIds: ["model-a"],
      },
      {
        selectionId: "account-b:8",
        accountId: "account-b",
        siteName: "Second Example",
        baseUrl: "https://second.example.invalid",
        tokenId: 8,
        tokenName: "Default",
        tokenKey: "second-example-key",
        discoveredModelIds: ["other-model", "vendor/model-b"],
      },
    ])
    const selectedProvider = catalog.providers[1]!

    const result = buildKiloCodeV7SettingsFile({
      catalog,
      defaultModel: {
        selectionId: selectedProvider.selectionId,
        modelId: "vendor/model-b",
      },
    })

    expect(result.provider[selectedProvider.providerId]?.models).toMatchObject({
      "vendor/model-b": { name: "vendor/model-b" },
    })
    expect(result.model).toBe(`${selectedProvider.providerId}/vendor/model-b`)
  })

  it("exposes the supported export targets", () => {
    expect(KILO_CODE_EXPORT_TARGETS).toEqual({
      KiloV7: "kilo-v7",
      Legacy: "legacy",
    })
    expect(KILO_CODE_EXPORT_FILENAMES).toEqual({
      KiloV7: "kilo-settings.json",
      Legacy: "kilo-code-settings.json",
    })
  })

  it("rejects an empty prepared catalog", () => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        catalog: { providers: [], providerCount: 0, modelCount: 0 },
        defaultModel,
      }),
    ).toThrow("Select at least one runtime key")
  })

  it("requires an explicit default model", () => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        catalog: preparedCatalog,
        defaultModel: undefined as unknown as KiloCodeDefaultModelSelection,
      }),
    ).toThrow("Kilo Code default model is required")
  })

  it("requires the default provider to be present in the catalog", () => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        catalog: preparedCatalog,
        defaultModel: { selectionId: "missing-selection", modelId: "model-b" },
      }),
    ).toThrow("Kilo Code default provider must be exported")
  })

  it("requires the default model to be present in its provider catalog", () => {
    expect(() =>
      buildKiloCodeV7SettingsFile({
        catalog: preparedCatalog,
        defaultModel: { selectionId: "account-a:7", modelId: "missing-model" },
      }),
    ).toThrow("Kilo Code default model must exist in its provider catalog")
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
          legacyModelId: "gpt-4o-mini",
        },
      ],
      generateId: (name) => `id-${name}`,
    })

    expect(apiConfigs["Example - Default"].openAiModelId).toBe("gpt-4o-mini")
  })

  it("preserves explicit legacy model omission during tuple compatibility", () => {
    const compatibilitySelection: KiloCodeExportTuple &
      KiloCodeLegacySelection = {
      accountId: "a",
      siteName: "Example",
      baseUrl: "https://api.example.invalid",
      tokenId: 1,
      tokenName: "Default",
      tokenKey: "example-key",
      legacyModelId: "  ",
      modelId: "compatibility-model",
    }

    const { apiConfigs } = buildKiloCodeApiConfigs({
      selections: [compatibilitySelection],
      generateId: (name) => `id-${name}`,
    })

    expect(apiConfigs["Example - Default"]).not.toHaveProperty("openAiModelId")
  })
})
