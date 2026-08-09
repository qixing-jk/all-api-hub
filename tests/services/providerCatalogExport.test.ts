import { describe, expect, it } from "vitest"

import { prepareProviderCatalogExport } from "~/services/integrations/providerCatalogExport"

describe("prepareProviderCatalogExport", () => {
  it("normalizes provider facts for target-specific export adapters", () => {
    const result = prepareProviderCatalogExport([
      {
        selectionId: "example-selection",
        name: "Example Provider",
        baseUrl: "https://api.example.invalid",
        apiKey: "example-key",
        discoveredModelIds: ["model-b", " model-a ", "model-b", ""],
        manualModelId: " custom/model ",
      },
    ])

    expect(result).toEqual({
      providers: [
        {
          selectionId: "example-selection",
          name: "Example Provider",
          baseUrl: "https://api.example.invalid/v1",
          apiKey: "example-key",
          modelIds: ["custom/model", "model-a", "model-b"],
        },
      ],
      providerCount: 1,
      modelCount: 3,
    })
  })
})
