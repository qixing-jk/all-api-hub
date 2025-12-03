import { describe, expect, it, vi } from "vitest"

import { extractActualModel } from "~/services/modelRedirect/modelNormalization"
import { ModelRedirectService } from "~/services/modelRedirect/ModelRedirectService"

// Mock metadata
const mockMetadataMap = new Map<
  string,
  { standardName: string; vendorName: string }
>([
  ["gpt-4o", { standardName: "gpt-4o", vendorName: "OpenAI" }],
  ["deepseek-r1", { standardName: "deepseek-r1", vendorName: "DeepSeek" }],
  [
    "claude-3-5-sonnet",
    { standardName: "claude-3-5-sonnet-20241022", vendorName: "Anthropic" },
  ],
  ["gpt-4o-mini", { standardName: "gpt-4o-mini", vendorName: "OpenAI" }],
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
      lastUpdated: Date.now(),
    }),
  },
}))

describe("ModelRedirectService.generateModelMappingForChannel", () => {
  it("should generate mapping with normalized names and deduplicate actual models", () => {
    const standardModels = ["gpt-4o", "deepseek-r1", "claude-3-5-sonnet"]
    const actualModels = [
      "openai/gpt-4o:free",
      "BigModel/deepseek/deepseek-r1:free",
      "deepseek/deepseek-r1:premium",
      "anthropic/claude-3-5-sonnet",
      "anthropic/claude-3-5-sonnet-20241022",
    ]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels,
    )

    expect(mapping).toEqual({
      "gpt-4o": "openai/gpt-4o:free",
      "deepseek-r1": "BigModel/deepseek/deepseek-r1:free",
      "claude-3-5-sonnet": "anthropic/claude-3-5-sonnet",
    })
  })

  it("should skip standard models already present in actual models", () => {
    const standardModels = ["gpt-4o", "gpt-4o-mini"]
    const actualModels = ["gpt-4o", "openai/gpt-4o-mini-20240718"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels,
    )

    expect(mapping).toEqual({
      "gpt-4o-mini": "openai/gpt-4o-mini-20240718",
    })
  })

  it("should prevent duplicate keys", () => {
    const standardModels = ["gpt-4o", "GPT-4o"]
    const actualModels = ["openai/gpt-4o"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels,
    )

    expect(Object.keys(mapping)).toHaveLength(1)
    expect(mapping["gpt-4o"]).toBe("openai/gpt-4o")
  })

  it("should return empty mapping when no matches found", () => {
    const standardModels = ["gpt-4o", "claude-3-5-sonnet"]
    const actualModels = ["moonshot-v1"]

    const mapping = ModelRedirectService.generateModelMappingForChannel(
      standardModels,
      actualModels,
    )

    expect(mapping).toEqual({})
  })
})

describe("extractActualModel", () => {
  it("should correctly extract actual model names", () => {
    expect(extractActualModel("openai/gpt-4o:free")).toBe("gpt-4o")
    expect(extractActualModel("BigModel/deepseek/deepseek-r1:free")).toBe(
      "deepseek-r1",
    )
    expect(extractActualModel("claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet",
    )
  })
})

describe("Model mapping merge logic", () => {
  it("should demonstrate incremental merge behavior with new keys overriding old keys", () => {
    // Simulate existing mapping from channel
    const existingMapping: Record<string, string> = {
      "gpt-4o": "old-provider/gpt-4o",
      "claude-3-5-sonnet": "old-provider/claude-3-5-sonnet",
      "custom-model": "custom-provider/model",
    }

    // Simulate newly generated mapping
    const newMapping: Record<string, string> = {
      "gpt-4o": "new-provider/gpt-4o", // This should override the old value
      "deepseek-r1": "new-provider/deepseek-r1", // This should be added
    }

    // Merge logic: spread existing first, then new (new overrides old for same keys)
    const mergedMapping = {
      ...existingMapping,
      ...newMapping,
    }

    // Assertions
    expect(mergedMapping).toEqual({
      "gpt-4o": "new-provider/gpt-4o", // Updated from old value
      "claude-3-5-sonnet": "old-provider/claude-3-5-sonnet", // Preserved from old
      "custom-model": "custom-provider/model", // Preserved from old
      "deepseek-r1": "new-provider/deepseek-r1", // Added from new
    })

    // Verify that old keys are preserved
    expect(mergedMapping["claude-3-5-sonnet"]).toBe(
      "old-provider/claude-3-5-sonnet",
    )
    expect(mergedMapping["custom-model"]).toBe("custom-provider/model")

    // Verify that new values override old values for same keys
    expect(mergedMapping["gpt-4o"]).toBe("new-provider/gpt-4o")
    expect(mergedMapping["gpt-4o"]).not.toBe("old-provider/gpt-4o")

    // Verify that new keys are added
    expect(mergedMapping["deepseek-r1"]).toBe("new-provider/deepseek-r1")

    // Verify total key count
    expect(Object.keys(mergedMapping)).toHaveLength(4)
  })

  it("should preserve all old keys when new mapping is empty", () => {
    const existingMapping: Record<string, string> = {
      "model-1": "provider-1/model-1",
      "model-2": "provider-2/model-2",
    }
    const newMapping: Record<string, string> = {}

    const mergedMapping = {
      ...existingMapping,
      ...newMapping,
    }

    expect(mergedMapping).toEqual(existingMapping)
    expect(Object.keys(mergedMapping)).toHaveLength(2)
  })

  it("should add all new keys when existing mapping is empty", () => {
    const existingMapping: Record<string, string> = {}
    const newMapping: Record<string, string> = {
      "model-1": "provider-1/model-1",
      "model-2": "provider-2/model-2",
    }

    const mergedMapping = {
      ...existingMapping,
      ...newMapping,
    }

    expect(mergedMapping).toEqual(newMapping)
    expect(Object.keys(mergedMapping)).toHaveLength(2)
  })
})
