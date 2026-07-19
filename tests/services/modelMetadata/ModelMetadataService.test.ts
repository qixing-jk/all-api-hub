import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_METADATA_REFRESH_INTERVAL } from "~/services/models/modelMetadata/constants"

describe("ModelMetadataService", () => {
  const loadService = async () => {
    const { modelMetadataService } = await import(
      "~/services/models/modelMetadata"
    )
    modelMetadataService.clearCache()
    ;(modelMetadataService as any).initPromise = null
    return modelMetadataService
  }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ id: "gpt-4", name: "GPT-4", providerId: "openai" }],
      }),
    }) as unknown as typeof fetch
  })

  it("initializes without errors", async () => {
    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()
  })

  it("handles getCacheInfo calls", async () => {
    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()
    const info = modelMetadataService.getCacheInfo()
    expect(info).toBeDefined()
    expect(typeof info).toBe("object")
  })

  it("prefers same-version alias matches and does not downgrade versions", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "claude-3-5-sonnet-20241022",
            name: "Claude 3.5 Sonnet",
            providerId: "anthropic",
          },
          {
            id: "claude-sonnet-4-5-20250929",
            name: "Claude 4.5 Sonnet",
            providerId: "anthropic",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    const resolved =
      modelMetadataService.findStandardModelName("claude-4.5-sonnet")
    expect(resolved?.standardName).toBe("claude-sonnet-4-5-20250929")
    expect(resolved?.vendorName).toBe("Anthropic")
  })

  it("does not fuzzy-match across minor versions (Anthropic)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "claude-sonnet-4-5-20250929",
            name: "Claude 4.5 Sonnet",
            providerId: "anthropic",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("claude-4.6-sonnet"),
    ).toBeNull()
  })

  it("resolves each minor version to its own model when both are present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "claude-sonnet-4-5-20250929",
            name: "Claude 4.5 Sonnet",
            providerId: "anthropic",
          },
          {
            id: "claude-sonnet-4-6-20260101",
            name: "Claude 4.6 Sonnet",
            providerId: "anthropic",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("claude-4.5-sonnet")
        ?.standardName,
    ).toBe("claude-sonnet-4-5-20250929")
    expect(
      modelMetadataService.findStandardModelName("claude-4.6-sonnet")
        ?.standardName,
    ).toBe("claude-sonnet-4-6-20260101")
  })

  it("does not fuzzy-match across versions (OpenAI)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { id: "gpt-4o-mini", name: "GPT-4o mini", providerId: "openai" },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("gpt-4.1-mini"),
    ).toBeNull()
  })

  it("does not fuzzy-match across versions (Google)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "gemini-1.5-pro",
            name: "Gemini 1.5 Pro",
            providerId: "google",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("gemini-3-pro"),
    ).toBeNull()
  })

  it("reuses an in-flight initialization and skips refetch while the cache is fresh", async () => {
    let resolveFetch!: (value: any) => void
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    ) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    const firstInit = modelMetadataService.initialize()
    const secondInit = modelMetadataService.initialize()

    expect(global.fetch).toHaveBeenCalledTimes(1)

    resolveFetch({
      ok: true,
      json: async () => ({
        models: [{ id: "gpt-4.1-mini", providerId: "openai" }],
      }),
    })

    await firstInit
    await secondInit
    await modelMetadataService.initialize()

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("uses bundled fallback metadata when the first refresh fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new Error("network down"),
    ) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    const info = modelMetadataService.getCacheInfo()
    expect(info.isLoaded).toBe(true)
    expect(info.modelCount).toBeGreaterThan(0)
    expect(
      modelMetadataService.findStandardModelName("claude-sonnet-4-5")
        ?.standardName,
    ).toBe("claude-sonnet-4-5-20250929")
  })

  it("preserves existing cache when a later refresh fails", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { id: "gpt-4o-mini", name: "GPT-4o mini", providerId: "openai" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()
    const before = modelMetadataService.getAllMetadata()

    await modelMetadataService.refreshMetadata()

    expect(modelMetadataService.getAllMetadata()).toEqual(before)
    expect(modelMetadataService.findStandardModelName("gpt-4o-mini")).toEqual({
      standardName: "gpt-4o-mini",
      vendorName: "OpenAI",
    })
  })

  it.each([
    ["an empty array", []],
    ["an array with no usable rows", [null, "invalid", { name: "No id" }]],
  ])("uses bundled fallback metadata for %s", async (_label, models) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getCacheInfo().modelCount).toBeGreaterThan(0)
    expect(modelMetadataService.findStandardModelName("gpt-4o")).toEqual({
      standardName: "gpt-4o",
      vendorName: "OpenAI",
    })
  })

  it.each([
    ["an empty array", []],
    ["an array with no usable rows", [null, "invalid", { name: "No id" }]],
  ])(
    "preserves the cache and retries after %s",
    async (_label, invalidModels) => {
      let now = 1_000
      const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now)
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ id: "cached-model", providerId: "cached-provider" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ models: invalidModels }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [
              { id: "refreshed-model", providerId: "refreshed-provider" },
            ],
          }),
        })

      try {
        const modelMetadataService = await loadService()
        await modelMetadataService.initialize()
        const cachedMetadata = modelMetadataService.getAllMetadata()
        const cachedInfo = modelMetadataService.getCacheInfo()

        now += MODEL_METADATA_REFRESH_INTERVAL + 1
        await modelMetadataService.refreshMetadata()

        expect(modelMetadataService.getAllMetadata()).toEqual(cachedMetadata)
        expect(modelMetadataService.getCacheInfo()).toEqual(cachedInfo)

        await modelMetadataService.initialize()

        expect(global.fetch).toHaveBeenCalledTimes(3)
        expect(modelMetadataService.getAllMetadata()).toEqual([
          {
            id: "refreshed-model",
            name: "refreshed-model",
            provider_id: "refreshed-provider",
          },
        ])
      } finally {
        dateNowSpy.mockRestore()
      }
    },
  )

  it("supports bare-array payloads and capitalizes unknown providers for exact matches", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "acme-model",
          provider_id: "acme-labs",
        },
      ],
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getAllMetadata()).toEqual([
      {
        id: "acme-model",
        name: "acme-model",
        provider_id: "acme-labs",
      },
    ])
    expect(modelMetadataService.findStandardModelName("acme-model")).toEqual({
      standardName: "acme-model",
      vendorName: "Acme Labs",
    })
  })

  it("skips malformed array rows and normalizes only string identity fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { id: 123, name: "Numeric ID" },
          { id: { nested: "id" }, name: "Object ID" },
          { name: "Missing ID" },
          null,
          [],
          "not-a-record",
          {
            id: "  numeric-name  ",
            name: 456,
            providerId: 789,
          },
          {
            id: "object-name",
            name: { label: "Object Name" },
            provider: { id: "object-provider" },
          },
          {
            id: "valid-neighbor",
            name: "Valid Neighbor",
            provider: "valid-provider",
          },
        ],
      }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getAllMetadata()).toEqual([
      {
        id: "numeric-name",
        name: "numeric-name",
        provider_id: "",
      },
      {
        id: "object-name",
        name: "object-name",
        provider_id: "",
      },
      {
        id: "valid-neighbor",
        name: "Valid Neighbor",
        provider_id: "valid-provider",
      },
    ])
    expect(modelMetadataService.resolveModelIdentity("Missing ID")).toEqual({
      state: "unmatched",
    })
  })

  it("keeps valid object-map rows and derives ids from map keys", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        "  example/key-fallback  ": {
          id: 123,
          name: "Key Fallback",
          provider_id: "example",
        },
        "example/object-id": {
          id: { nested: "id" },
          name: 456,
          providerId: { nested: "provider" },
        },
        "example/explicit-key": {
          id: "  explicit-id  ",
          name: "Explicit ID",
          provider: "explicit-provider",
        },
        malformed: null,
        array: [],
      }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getAllMetadata()).toEqual([
      {
        id: "example/key-fallback",
        name: "Key Fallback",
        provider_id: "example",
      },
      {
        id: "example/object-id",
        name: "example/object-id",
        provider_id: "example",
      },
      {
        id: "explicit-id",
        name: "Explicit ID",
        provider_id: "explicit-provider",
      },
    ])
  })

  it("normalizes models.dev model metadata without dropping capability fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        "openai/gpt-4o": {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          family: "gpt-4o",
          description: "Multimodal model",
          attachment: true,
          reasoning: false,
          tool_call: true,
          structured_output: true,
          temperature: true,
          release_date: "2024-05-13",
          last_updated: "2024-08-06",
          modalities: {
            input: ["text", "image", "pdf"],
            output: ["text"],
          },
          open_weights: false,
          limit: {
            context: 128000,
            input: 64000,
            output: 16384,
          },
        },
        "example/metadata-with-empty-modalities": {
          name: "Metadata With Empty Modalities",
          provider_id: "example",
          modalities: {
            input: "text",
            output: [],
          },
        },
        "openai/family/gpt-4o-mini": {
          id: "openai/family/gpt-4o-mini",
          name: "Nested GPT-4o mini",
        },
      }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getAllMetadata()).toEqual([
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider_id: "openai",
        family: "gpt-4o",
        description: "Multimodal model",
        capabilities: {
          attachment: true,
          reasoning: false,
          toolCall: true,
          structuredOutput: true,
          temperature: true,
        },
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limits: {
          context: 128000,
          input: 64000,
          output: 16384,
        },
        release_date: "2024-05-13",
        last_updated: "2024-08-06",
      },
      {
        id: "example/metadata-with-empty-modalities",
        name: "Metadata With Empty Modalities",
        provider_id: "example",
      },
      {
        id: "openai/family/gpt-4o-mini",
        name: "Nested GPT-4o mini",
        provider_id: "openai",
      },
    ])
    expect(modelMetadataService.findStandardModelName("gpt-4o")).toEqual({
      standardName: "openai/gpt-4o",
      vendorName: "OpenAI",
    })
    expect(
      modelMetadataService.findStandardModelName("openai/family/gpt-4o-mini"),
    ).toEqual({
      standardName: "openai/family/gpt-4o-mini",
      vendorName: "OpenAI",
    })
  })

  it("falls back to bundled metadata when the remote payload is not an object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => "invalid payload",
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getCacheInfo()).toEqual({
      isLoaded: true,
      modelCount: expect.any(Number),
      lastUpdated: expect.any(Number),
    })
    expect(
      modelMetadataService.resolveModelIdentity("gemini-2.0-flash-exp"),
    ).toMatchObject({
      state: "resolved",
      match: "exact",
      metadata: { provider_id: "google" },
    })
  })

  it("falls back to bundled metadata when the models field is not an array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: {
          id: "gpt-4o",
        },
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.findStandardModelName("gpt-4o")).toEqual({
      standardName: "gpt-4o",
      vendorName: "OpenAI",
    })
  })

  it("falls back to bundled metadata when the models field is primitive", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: "invalid models",
      }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.findStandardModelName("gpt-4o")).toEqual({
      standardName: "gpt-4o",
      vendorName: "OpenAI",
    })
  })

  it("normalizes sparse metadata rows and skips unusable vendor rules", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "acme-sonnet-4-5-20260101",
            provider_id: "acme-labs",
          },
          {
            id: "mixtral",
            providerId: "mistral-ai",
          },
          {
            name: "Named only",
            providerId: "openai",
          },
          {
            id: "   ",
            provider_id: "blank-prefix",
          },
          {
            id: "valid-skip",
            provider_id: "",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(modelMetadataService.getAllMetadata()).toEqual([
      {
        id: "acme-sonnet-4-5-20260101",
        name: "acme-sonnet-4-5-20260101",
        provider_id: "acme-labs",
      },
      {
        id: "mixtral",
        name: "mixtral",
        provider_id: "mistral-ai",
      },
      {
        id: "valid-skip",
        name: "valid-skip",
        provider_id: "",
      },
    ])
    expect(
      modelMetadataService.findStandardModelName("acme-4.5-sonnet"),
    ).toEqual({
      standardName: "acme-sonnet-4-5-20260101",
      vendorName: "Acme Labs",
    })
  })

  it("returns null for unloaded, blank, and date-suffixed lookups", async () => {
    const modelMetadataService = await loadService()

    expect(modelMetadataService.findStandardModelName("gpt-4o")).toBeNull()
    expect(modelMetadataService.getCacheInfo()).toEqual({
      isLoaded: false,
      modelCount: 0,
      lastUpdated: null,
    })
    expect(modelMetadataService.getAllMetadata()).toEqual([])

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "claude-3-5-haiku-20241022",
            name: "Claude 3.5 Haiku",
            providerId: "anthropic",
          },
        ],
      }),
    }) as unknown as typeof fetch

    await modelMetadataService.initialize()

    expect(modelMetadataService.findStandardModelName("   ")).toBeNull()
    expect(
      modelMetadataService.findStandardModelName("claude-3-5-haiku"),
    ).toEqual({
      standardName: "claude-3-5-haiku-20241022",
      vendorName: "Anthropic",
    })
    expect(
      modelMetadataService.findStandardModelName("claude-3-5-haiku-20240307"),
    ).toBeNull()
  })

  it("does not choose the first metadata match for an ambiguous bare id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "provider-a/shared-model",
            name: "Shared Model A",
            providerId: "provider-a",
          },
          {
            id: "provider-b/shared-model",
            name: "Shared Model B",
            providerId: "provider-b",
          },
        ],
      }),
    })

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("shared-model"),
    ).toBeNull()
    expect(modelMetadataService.resolveModelIdentity("shared-model")).toEqual({
      state: "ambiguous",
    })
    expect(
      modelMetadataService.resolveModelIdentity("provider-a/shared-model"),
    ).toMatchObject({
      state: "resolved",
      match: "exact",
      metadata: { provider_id: "provider-a" },
    })
    expect(
      modelMetadataService.findStandardModelName("provider-a/shared-model"),
    ).toEqual({
      standardName: "provider-a/shared-model",
      vendorName: "Provider A",
    })
  })

  it("returns defensive copies for cached metadata", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "gpt-4o",
            name: "GPT-4o",
            providerId: "openai",
          },
        ],
      }),
    }) as unknown as typeof fetch

    const modelMetadataService = await loadService()
    await modelMetadataService.initialize()

    const metadata = modelMetadataService.getAllMetadata()
    metadata.push({
      id: "fake",
      name: "fake",
      provider_id: "fake",
    })

    expect(modelMetadataService.getAllMetadata()).toHaveLength(1)
    expect(modelMetadataService.resolveModelIdentity("gpt-4o")).toMatchObject({
      state: "resolved",
      match: "exact",
      metadata: { provider_id: "openai" },
    })
  })
})
