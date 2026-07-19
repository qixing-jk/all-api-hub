import { describe, expect, it } from "vitest"

import {
  normalizeKiloCodeModelIds,
  prepareKiloCodeV7Catalog,
  type KiloCodeV7ProviderSelection,
} from "~/services/integrations/kiloCodeV7Catalog"

const baseSelection: KiloCodeV7ProviderSelection = {
  selectionId: "account-a:7",
  accountId: "account-a",
  siteName: "Example",
  baseUrl: "https://api.example.invalid",
  tokenId: 7,
  tokenName: "Default",
  tokenKey: "example-key",
  providerName: "Example - Default",
  discoveredModelIds: ["model-b", " model-a ", "model-b", ""],
}

describe("prepareKiloCodeV7Catalog", () => {
  it("prepares a readable provider with a normalized multi-model catalog", () => {
    const result = prepareKiloCodeV7Catalog([baseSelection])

    expect(result.providers).toEqual([
      expect.objectContaining({
        selectionId: "account-a:7",
        providerName: "Example - Default",
        providerId: "example-default-f92fc95e",
        baseURL: "https://api.example.invalid/v1",
        tokenKey: "example-key",
        modelIds: ["model-a", "model-b"],
      }),
    ])
    expect(result.providerCount).toBe(1)
    expect(result.modelCount).toBe(2)
  })

  it("unions a manual model with discovered models until it is cleared", () => {
    const result = prepareKiloCodeV7Catalog([
      { ...baseSelection, manualModelId: " custom/model " },
    ])

    expect(result.providers[0]?.modelIds).toEqual([
      "custom/model",
      "model-a",
      "model-b",
    ])
  })

  it("uses code-point order instead of locale-sensitive ordering", () => {
    const result = prepareKiloCodeV7Catalog([
      {
        ...baseSelection,
        discoveredModelIds: ["ä-model", "Z-model", "a-model", "A-model"],
      },
    ])

    expect(result.providers[0]?.modelIds).toEqual([
      "A-model",
      "Z-model",
      "a-model",
      "ä-model",
    ])
  })

  it("orders astral model IDs by Unicode code point", () => {
    expect(
      normalizeKiloCodeModelIds([
        "\u{1f600}-model",
        "z-model",
        "\u{10000}-model",
      ]),
    ).toEqual(["z-model", "\u{10000}-model", "\u{1f600}-model"])
  })

  it("disambiguates duplicate display names without merging credentials", () => {
    const result = prepareKiloCodeV7Catalog([
      baseSelection,
      {
        ...baseSelection,
        selectionId: "account-b:8",
        accountId: "account-b",
        baseUrl: "https://second.example.invalid",
        tokenId: 8,
        tokenKey: "second-example-key",
      },
    ])

    expect(result.providers.map((provider) => provider.providerName)).toEqual([
      "Example - Default (api.example.invalid)",
      "Example - Default (second.example.invalid)",
    ])
    expect(
      new Set(result.providers.map((provider) => provider.providerId)),
    ).toHaveLength(2)
    expect(result.providers.map((provider) => provider.tokenKey)).toEqual([
      "example-key",
      "second-example-key",
    ])
  })

  it("keeps the current provider ID stable across secret and catalog changes", () => {
    const first = prepareKiloCodeV7Catalog([baseSelection])
    const second = prepareKiloCodeV7Catalog([
      {
        ...baseSelection,
        tokenKey: "rotated-example-key",
        discoveredModelIds: ["different-model"],
      },
    ])

    expect(second.providers[0]?.providerId).toBe(first.providers[0]?.providerId)
  })

  it("keeps the provider ID stable when only its display name changes", () => {
    const first = prepareKiloCodeV7Catalog([baseSelection])
    const second = prepareKiloCodeV7Catalog([
      { ...baseSelection, providerName: "Renamed Provider" },
    ])

    expect(second.providers[0]?.providerId).toBe(first.providers[0]?.providerId)
  })

  it("uses stable ordinals when duplicate display names share a host", () => {
    const result = prepareKiloCodeV7Catalog([
      { ...baseSelection, baseUrl: "https://api.example.invalid/z" },
      {
        ...baseSelection,
        selectionId: "account-b:8",
        accountId: "account-b",
        baseUrl: "https://api.example.invalid/a",
        tokenId: 8,
      },
    ])

    expect(result.providers.map((provider) => provider.providerName)).toEqual([
      "Example - Default (api.example.invalid) #2",
      "Example - Default (api.example.invalid) #1",
    ])
  })

  it("preserves provider input order", () => {
    const result = prepareKiloCodeV7Catalog([
      {
        ...baseSelection,
        selectionId: "account-b:8",
        accountId: "account-b",
        providerName: "Second Input",
        tokenId: 8,
      },
      { ...baseSelection, providerName: "First Input" },
    ])

    expect(result.providers.map((provider) => provider.selectionId)).toEqual([
      "account-b:8",
      "account-a:7",
    ])
  })

  it("rejects duplicate opaque selection IDs", () => {
    expect(() =>
      prepareKiloCodeV7Catalog([
        baseSelection,
        { ...baseSelection, accountId: "account-b" },
      ]),
    ).toThrow("Kilo Code selection IDs must be unique")
  })

  it.each([
    ["blank runtime keys", { tokenKey: "  " }, "Runtime key cannot be blank"],
    [
      "invalid base URLs",
      { baseUrl: "not-a-url" },
      "Base URL must be a valid HTTP or HTTPS URL",
    ],
    [
      "non-HTTP base URLs",
      { baseUrl: "ftp://api.example.invalid" },
      "Base URL must be a valid HTTP or HTTPS URL",
    ],
    [
      "empty model catalogs",
      { discoveredModelIds: ["", "  "] },
      "Select at least one model for each provider",
    ],
  ])("rejects %s", (_name, overrides, message) => {
    expect(() =>
      prepareKiloCodeV7Catalog([{ ...baseSelection, ...overrides }]),
    ).toThrow(message)
  })

  it("rejects duplicate generated provider IDs", () => {
    expect(() =>
      prepareKiloCodeV7Catalog([
        baseSelection,
        {
          ...baseSelection,
          selectionId: "alternate-selection",
        },
      ]),
    ).toThrow("Kilo Code provider IDs must be unique")
  })
})
