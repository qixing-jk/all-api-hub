import { describe, expect, it } from "vitest"

import {
  CURSOR_PLUS_PROVIDER_TYPES,
  prepareCursorPlusProvider,
} from "~/services/integrations/cursorPlusExport"

describe("prepareCursorPlusProvider", () => {
  it("builds a normalized Cursor++ 0.0.13 OpenAI Chat provider fragment", () => {
    expect(
      prepareCursorPlusProvider({
        selectionId: "account-token:example-account:7",
        name: " Example Provider ",
        baseUrl: "https://api.example.invalid",
        apiKey: "example-key",
        discoveredModelIds: ["model-b", " model-a ", "model-b"],
        manualModelId: " custom/model ",
      }),
    ).toEqual({
      id: "example-provider-7df7c1ad",
      name: "Example Provider",
      type: "openai-chat",
      baseUrl: "https://api.example.invalid",
      auth: {
        kind: "apiKey",
        value: "example-key",
      },
      models: [
        {
          id: "custom/model",
          apiModel: "custom/model",
          defaultOn: true,
        },
        { id: "model-a", apiModel: "model-a", defaultOn: true },
        { id: "model-b", apiModel: "model-b", defaultOn: true },
      ],
    })
  })

  it("includes multiple manually entered models", () => {
    expect(
      prepareCursorPlusProvider({
        selectionId: "selection",
        name: "Example Provider",
        baseUrl: "https://api.example.invalid",
        apiKey: "example-key",
        discoveredModelIds: ["model-a"],
        manualModelIds: ["manual/b", " manual/a ", "model-a"],
      }).models,
    ).toEqual([
      { id: "manual/a", apiModel: "manual/a", defaultOn: true },
      { id: "manual/b", apiModel: "manual/b", defaultOn: true },
      { id: "model-a", apiModel: "model-a", defaultOn: true },
    ])
  })

  it.each(Object.values(CURSOR_PLUS_PROVIDER_TYPES))(
    "exports the supported %s provider protocol",
    (protocol) => {
      expect(
        prepareCursorPlusProvider({
          selectionId: "selection",
          name: "Example Provider",
          baseUrl: "https://api.example.invalid",
          apiKey: "example-key",
          discoveredModelIds: ["model-a"],
          protocol,
        }).type,
      ).toBe(protocol)
    },
  )

  it("preserves a protocol-specific base URL", () => {
    expect(
      prepareCursorPlusProvider({
        selectionId: "selection",
        name: "Example Provider",
        baseUrl: "https://api.example.invalid/gemini/v1beta/",
        apiKey: "example-key",
        discoveredModelIds: ["model-a"],
        protocol: CURSOR_PLUS_PROVIDER_TYPES.Gemini,
      }).baseUrl,
    ).toBe("https://api.example.invalid/gemini/v1beta")
  })

  it("keeps the provider id stable when secret and models change", () => {
    const input = {
      selectionId: "account-token:example-account:7",
      name: "Example Provider",
      baseUrl: "https://api.example.invalid/v1",
      apiKey: "first-key",
      discoveredModelIds: ["model-a"],
    }

    const first = prepareCursorPlusProvider(input)
    const second = prepareCursorPlusProvider({
      ...input,
      apiKey: "second-key",
      discoveredModelIds: ["model-b"],
    })

    expect(second.id).toBe(first.id)
  })

  it.each([
    ["name", { name: " " }, "Provider name cannot be blank"],
    ["secret", { apiKey: " " }, "Runtime key cannot be blank"],
    [
      "base URL",
      { baseUrl: "file:///tmp/provider" },
      "Base URL must be a valid HTTP or HTTPS URL",
    ],
    [
      "models",
      { discoveredModelIds: [] },
      "Select at least one model for the provider",
    ],
  ])("rejects an invalid %s", (_label, override, message) => {
    expect(() =>
      prepareCursorPlusProvider({
        selectionId: "selection",
        name: "Example Provider",
        baseUrl: "https://api.example.invalid",
        apiKey: "example-key",
        discoveredModelIds: ["model-a"],
        ...override,
      }),
    ).toThrow(message)
  })
})
