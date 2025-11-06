import { describe, expect, it, vi } from "vitest"

import { extractActualModel } from "../modelNormalization"
import { ModelRedirectService } from "../ModelRedirectService"

// Mock metadata
const mockMetadataMap = new Map<
  string,
  { standardName: string; vendorName: string }
>([
  ["gpt-4o", { standardName: "gpt-4o", vendorName: "OpenAI" }],
  ["deepseek-r1", { standardName: "deepseek-r1", vendorName: "DeepSeek" }],
  [
    "claude-3-5-sonnet",
    { standardName: "claude-3-5-sonnet-20241022", vendorName: "Anthropic" }
  ],
  ["gpt-4o-mini", { standardName: "gpt-4o-mini", vendorName: "OpenAI" }]
])

vi.mock("~/services/modelMetadata", () => ({
  modelMetadataService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findStandardModelName: (modelName: string) => {
      const cleaned = modelName.trim().toLowerCase()
      return mockMetadataMap.get(cleaned) || null
    },
    findVendorByPattern: (modelName: string) => {
      const lower = modelName.toLowerCase()
      if (/^gpt/.test(lower)) return "OpenAI"
      if (/^claude/.test(lower)) return "Anthropic"
      if (/^deepseek/.test(lower)) return "DeepSeek"
      return null
    },
    getVendorRules: () => [],
    getCacheInfo: () => ({
      isLoaded: true,
      modelCount: mockMetadataMap.size,
      lastUpdated: Date.now()
    })
  }
}))

describe("ModelRedirectService.generateModelMappingForChannel", () => {
  it("should generate mapping with normalized names and deduplicate actual models", () => {
    const standardModels = ["gpt-4o", "deepseek-r1", "claude-3-5-sonnet"]
    const actualModels = [
      "openai/gpt-4o:free",
      "BigModel/deepseek/deepseek-r1:free",
      "deepseek/deepseek-r1:premium",
      "anthropic/claude-3-5-sonnet",
      "anthropic/claude-3-5-sonnet-20241022"
    ]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels
    )

    expect(mapping).toEqual({
      "gpt-4o": "openai/gpt-4o:free",
      "deepseek-r1": "BigModel/deepseek/deepseek-r1:free",
      "claude-3-5-sonnet": "anthropic/claude-3-5-sonnet"
    })
  })

  it("should skip standard models already present in actual models", () => {
    const standardModels = ["gpt-4o", "gpt-4o-mini"]
    const actualModels = ["gpt-4o", "openai/gpt-4o-mini-20240718"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels
    )

    expect(mapping).toEqual({
      "gpt-4o-mini": "openai/gpt-4o-mini-20240718"
    })
  })

  it("should prevent duplicate keys", () => {
    const standardModels = ["gpt-4o", "GPT-4o"]
    const actualModels = ["openai/gpt-4o"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels
    )

    expect(Object.keys(mapping)).toHaveLength(1)
    expect(mapping["gpt-4o"]).toBe("openai/gpt-4o")
  })

  it("should return empty mapping when no matches found", () => {
    const standardModels = ["gpt-4o", "claude-3-5-sonnet"]
    const actualModels = ["moonshot-v1"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels
    )

    expect(mapping).toEqual({})
  })
})

describe("extractActualModel", () => {
  it("should correctly extract actual model names", () => {
    expect(extractActualModel("openai/gpt-4o:free")).toBe("gpt-4o")
    expect(extractActualModel("BigModel/deepseek/deepseek-r1:free")).toBe(
      "deepseek-r1"
    )
    expect(extractActualModel("claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet"
    )
  })
})
