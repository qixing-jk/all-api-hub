import { describe, expect, it } from "vitest"

import type { PreparedKiloCodeV7Catalog } from "~/services/integrations/kiloCodeV7Catalog"
import { reconcileKiloCodeV7DefaultSelection } from "~/services/integrations/kiloCodeV7Selection"

const catalog: PreparedKiloCodeV7Catalog = {
  providers: [
    {
      selectionId: "provider-a",
      providerId: "provider-a-12345678",
      providerName: "Provider A",
      baseURL: "https://api.example.invalid/v1",
      tokenKey: "example-key",
      modelIds: ["model-a", "model-b"],
    },
    {
      selectionId: "provider-b",
      providerId: "provider-b-12345678",
      providerName: "Provider B",
      baseURL: "https://other.example.invalid/v1",
      tokenKey: "other-example-key",
      modelIds: ["model-c"],
    },
  ],
  providerCount: 2,
  modelCount: 3,
}

describe("reconcileKiloCodeV7DefaultSelection", () => {
  it("selects the first provider and model when the current provider was removed", () => {
    expect(
      reconcileKiloCodeV7DefaultSelection(catalog, {
        selectionId: "removed-provider",
        modelId: "removed/model",
      }),
    ).toEqual({ selectionId: "provider-a", modelId: "model-a" })
  })

  it("preserves an existing provider and repairs its removed model", () => {
    expect(
      reconcileKiloCodeV7DefaultSelection(catalog, {
        selectionId: "provider-b",
        modelId: "removed/model",
      }),
    ).toEqual({ selectionId: "provider-b", modelId: "model-c" })
  })

  it("preserves a valid prepared custom model", () => {
    const catalogWithCustom: PreparedKiloCodeV7Catalog = {
      ...catalog,
      providers: [
        {
          ...catalog.providers[0]!,
          modelIds: ["custom/model", "model-a", "model-b"],
        },
        catalog.providers[1]!,
      ],
      modelCount: 4,
    }
    const current = {
      selectionId: "provider-a",
      modelId: "custom/model",
    }

    expect(
      reconcileKiloCodeV7DefaultSelection(catalogWithCustom, current),
    ).toBe(current)
  })

  it("repairs the default after a manual model is removed", () => {
    expect(
      reconcileKiloCodeV7DefaultSelection(catalog, {
        selectionId: "provider-a",
        modelId: "custom/model",
      }),
    ).toEqual({ selectionId: "provider-a", modelId: "model-a" })
  })

  it("returns undefined when the catalog is empty", () => {
    expect(
      reconcileKiloCodeV7DefaultSelection({
        providers: [],
        providerCount: 0,
        modelCount: 0,
      }),
    ).toBeUndefined()
  })

  it("returns undefined when the selected fallback provider has no models", () => {
    const catalogWithoutModels: PreparedKiloCodeV7Catalog = {
      providers: [{ ...catalog.providers[0]!, modelIds: [] }],
      providerCount: 1,
      modelCount: 0,
    }

    expect(
      reconcileKiloCodeV7DefaultSelection(catalogWithoutModels, {
        selectionId: "provider-a",
        modelId: "removed/model",
      }),
    ).toBeUndefined()
  })
})
