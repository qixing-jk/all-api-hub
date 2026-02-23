import { beforeEach, describe, expect, it, vi } from "vitest"

describe("ModelMetadataService", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ id: "gpt-4", name: "GPT-4", providerId: "openai" }],
      }),
    })
  })

  it("initializes without errors", async () => {
    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
    await modelMetadataService.initialize()
  })

  it("handles getCacheInfo calls", async () => {
    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
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
    })

    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
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
    })

    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
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
    })

    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
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
    })

    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
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
    })

    const { modelMetadataService } = await import("~/services/modelMetadata")
    modelMetadataService.clearCache()
    await modelMetadataService.initialize()

    expect(
      modelMetadataService.findStandardModelName("gemini-3-pro"),
    ).toBeNull()
  })
})
