import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  extractActualModel,
  renameModel,
} from "~/services/modelRedirect/modelNormalization"
import { modelMetadataService } from "~/services/models/modelMetadata"

// Mock the modelMetadataService with controlled responses
vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findStandardModelName: vi.fn(),
    findVendorByPattern: vi.fn(),
    getVendorRules: () => [],
    getCacheInfo: () => ({
      isLoaded: true,
      modelCount: 0,
      lastUpdated: Date.now(),
    }),
  },
}))

describe("extractActualModel", () => {
  it("should handle basic model names with vendor and suffix", () => {
    expect(extractActualModel("openai/gpt-4o:free")).toBe("gpt-4o")
    expect(extractActualModel("anthropic/claude-3-5-sonnet:premium")).toBe(
      "claude-3-5-sonnet",
    )
    expect(extractActualModel("deepseek/deepseek-r1:free")).toBe("deepseek-r1")
  })

  it("should handle BigModel special prefix", () => {
    expect(extractActualModel("BigModel/glm-4")).toBe("glm-4")
    expect(extractActualModel("BigModel/deepseek-r1:free")).toBe("deepseek-r1")
    expect(extractActualModel("BigModel/gpt-4o:premium")).toBe("gpt-4o")
  })

  it("should handle nested paths with multiple slashes", () => {
    expect(extractActualModel("vendor/subvendor/model-name:free")).toBe(
      "model-name",
    )
    expect(extractActualModel("BigModel/deepseek/deepseek-r1:free")).toBe(
      "deepseek-r1",
    )
    expect(extractActualModel("api/v1/models/gpt-4o")).toBe("gpt-4o")
  })

  it("should remove colon suffixes", () => {
    expect(extractActualModel("gpt-4o:free")).toBe("gpt-4o")
    expect(extractActualModel("claude-3-5-sonnet:premium")).toBe(
      "claude-3-5-sonnet",
    )
    expect(extractActualModel("deepseek-r1:trial")).toBe("deepseek-r1")
    expect(extractActualModel("model-name:very-long-suffix")).toBe("model-name")
  })

  it("should handle model names without suffixes", () => {
    expect(extractActualModel("gpt-4o")).toBe("gpt-4o")
    expect(extractActualModel("claude-3-5-sonnet")).toBe("claude-3-5-sonnet")
    expect(extractActualModel("deepseek-r1")).toBe("deepseek-r1")
  })

  it("should remove date suffixes", () => {
    expect(extractActualModel("claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet",
    )
    expect(extractActualModel("gpt-4o-20240513")).toBe("gpt-4o")
    expect(extractActualModel("gemini-1.5-pro-2024-08-15")).toBe(
      "gemini-1.5-pro",
    )
    expect(extractActualModel("model-01-2024")).toBe("model")
  })

  it("should handle complex combinations", () => {
    expect(extractActualModel("BigModel/deepseek/deepseek-r1:free")).toBe(
      "deepseek-r1",
    )
    expect(extractActualModel("openai/gpt-4o-20240513:premium")).toBe("gpt-4o")
    expect(
      extractActualModel("anthropic/claude-3-5-sonnet-20241022:free"),
    ).toBe("claude-3-5-sonnet")
  })

  it("should handle edge cases", () => {
    expect(extractActualModel("model")).toBe("model")
    expect(extractActualModel("model:")).toBe("model")
    expect(extractActualModel("/model")).toBe("model")
    expect(extractActualModel("vendor/")).toBe("")
  })
})

describe("renameModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Invalid input handling", () => {
    it("should return undefined for empty input", () => {
      expect(renameModel("", true)).toBeUndefined()
      expect(renameModel("", false)).toBeUndefined()
    })

    it("should return undefined for null/undefined input", () => {
      expect(renameModel(null as any, true)).toBeUndefined()
      expect(renameModel(undefined as any, false)).toBeUndefined()
    })

    it("should return undefined for whitespace-only input", () => {
      expect(renameModel("   ", true)).toBeUndefined()
      expect(renameModel("\t\n", false)).toBeUndefined()
      expect(renameModel("  \r\n  ", true)).toBeUndefined()
    })
  })

  describe("includeVendor true - vendor-inclusive logic", () => {
    it("should return vendor-inclusive models with single slash and no colon", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(null)

      expect(renameModel("openai/gpt-4o", true)).toBe("openai/gpt-4o")
      expect(renameModel("anthropic/claude-3-5-sonnet", true)).toBe(
        "anthropic/claude-3-5-sonnet",
      )
      expect(renameModel("deepseek/deepseek-r1", true)).toBe(
        "deepseek/deepseek-r1",
      )
    })

    it("should exclude BigModel prefix from vendor-inclusive logic", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "DeepSeek",
      )

      expect(renameModel("BigModel/deepseek-r1", true)).toBe(
        "DeepSeek/deepseek-r1",
      )
      expect(renameModel("BigModel/glm-4", true)).toBe("DeepSeek/glm-4")
    })

    it("should exclude Pro/ prefix from vendor-inclusive logic", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("Pro/gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("Pro/claude-3-5-sonnet", true)).toBe(
        "OpenAI/claude-3-5-sonnet",
      )
    })

    it("should not apply vendor-inclusive logic for models with colons", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("openai/gpt-4o:free", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("anthropic/claude-3-5-sonnet:premium", true)).toBe(
        "OpenAI/claude-3-5-sonnet",
      )
    })

    it("should not apply vendor-inclusive logic for models with multiple slashes", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("vendor/submodel/gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("api/v1/models/claude-3-5-sonnet", true)).toBe(
        "OpenAI/claude-3-5-sonnet",
      )
    })

    it("should not apply vendor-inclusive logic for empty parts", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("/gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("openai/", true)).toBe("OpenAI/")
      expect(renameModel("openai/ ", true)).toBe("OpenAI/") // space gets trimmed, making second part empty
    })
  })

  describe("Metadata hit scenarios", () => {
    it("should handle metadata hit with vendor-inclusive standard names (includeVendor: true)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "deepseek-ai/DeepSeek-V3.1",
        vendorName: "DeepSeek",
      })

      expect(renameModel("deepseek-r1", true)).toBe("deepseek-ai/DeepSeek-V3.1")
      // vendor-inclusive logic takes precedence for single slash, no colon inputs
      expect(renameModel("openai/gpt-4o", true)).toBe("openai/gpt-4o")
    })

    it("should handle metadata hit with vendor-inclusive standard names (includeVendor: false)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "deepseek-ai/DeepSeek-V3.1",
        vendorName: "DeepSeek",
      })

      expect(renameModel("deepseek-r1", false)).toBe("DeepSeek-V3.1")
      expect(renameModel("openai/gpt-4o", false)).toBe("DeepSeek-V3.1")
    })

    it("should handle metadata hit where standard name lacks vendor prefix but vendorName provided (includeVendor: true)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "OpenAI",
      })

      expect(renameModel("gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("openai/gpt-4o:free", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("gpt-4o-turbo", true)).toBe("OpenAI/gpt-4o")
    })

    it("should handle metadata hit where standard name lacks vendor prefix (includeVendor: false)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "OpenAI",
      })

      expect(renameModel("gpt-4o", false)).toBe("gpt-4o")
      expect(renameModel("openai/gpt-4o:free", false)).toBe("gpt-4o")
    })

    it("should handle metadata hit with vendorName undefined (includeVendor: true)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "",
      })

      expect(renameModel("gpt-4o", true)).toBe("gpt-4o")
      expect(renameModel("openai/gpt-4o:free", true)).toBe("gpt-4o")
    })

    it("should handle metadata hit with vendorName undefined (includeVendor: false)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "",
      })

      expect(renameModel("gpt-4o", false)).toBe("gpt-4o")
      expect(renameModel("openai/gpt-4o:free", false)).toBe("gpt-4o")
    })
  })

  describe("Vendor pattern fallback scenarios", () => {
    it("should handle metadata miss but vendor pattern fallback found (includeVendor: true)", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("openai/gpt-4o:free", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("gpt-4o-turbo", true)).toBe("OpenAI/gpt-4o-turbo")
    })

    it("should not add vendor when includeVendor is false", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("gpt-4o", false)).toBe("gpt-4o")
      expect(renameModel("openai/gpt-4o:free", false)).toBe("gpt-4o")
      expect(renameModel("gpt-4o-turbo", false)).toBe("gpt-4o-turbo")
    })

    it("should handle vendor pattern fallback with no match", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(null)

      expect(renameModel("unknown-model", true)).toBe("unknown-model")
      expect(renameModel("vendor/unknown-model:free", true)).toBe(
        "unknown-model",
      )
      expect(renameModel("unknown-model", false)).toBe("unknown-model")
    })
  })

  describe("Complex input scenarios", () => {
    it("should handle BigModel prefix with metadata hit", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "glm-4",
        vendorName: "ZhipuAI",
      })

      expect(renameModel("BigModel/glm-4", true)).toBe("ZhipuAI/glm-4")
      expect(renameModel("BigModel/glm-4", false)).toBe("glm-4")
    })

    it("should handle BigModel prefix with vendor fallback", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "ZhipuAI",
      )

      expect(renameModel("BigModel/glm-4", true)).toBe("ZhipuAI/glm-4")
      expect(renameModel("BigModel/glm-4:free", true)).toBe("ZhipuAI/glm-4")
      expect(renameModel("BigModel/glm-4", false)).toBe("glm-4")
    })

    it("should handle multiple slashes with metadata hit", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "OpenAI",
      })

      expect(renameModel("api/v1/models/gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("api/v1/models/gpt-4o:free", true)).toBe(
        "OpenAI/gpt-4o",
      )
      expect(renameModel("api/v1/models/gpt-4o", false)).toBe("gpt-4o")
    })

    it("should handle multiple slashes with vendor fallback", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      expect(renameModel("api/v1/models/gpt-4o", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("api/v1/models/gpt-4o:free", true)).toBe(
        "OpenAI/gpt-4o",
      )
      expect(renameModel("api/v1/models/gpt-4o", false)).toBe("gpt-4o")
    })

    it("should handle colon suffixes with metadata hit", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "claude-3-5-sonnet",
        vendorName: "Anthropic",
      })

      expect(renameModel("claude-3-5-sonnet:free", true)).toBe(
        "Anthropic/claude-3-5-sonnet",
      )
      expect(renameModel("claude-3-5-sonnet:premium", false)).toBe(
        "claude-3-5-sonnet",
      )
    })

    it("should handle colon suffixes with vendor fallback", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "Anthropic",
      )

      expect(renameModel("claude-3-5-sonnet:free", true)).toBe(
        "Anthropic/claude-3-5-sonnet",
      )
      expect(renameModel("claude-3-5-sonnet:premium", false)).toBe(
        "claude-3-5-sonnet",
      )
    })
  })

  describe("Whitespace trimming", () => {
    it("should trim whitespace before processing", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "gpt-4o",
        vendorName: "OpenAI",
      })

      expect(renameModel("  gpt-4o  ", true)).toBe("OpenAI/gpt-4o")
      expect(renameModel("\topenai/gpt-4o\n", false)).toBe("gpt-4o")
      expect(renameModel("  claude-3-5-sonnet:free  ", true)).toBe(
        "OpenAI/gpt-4o",
      )
    })

    it("should return undefined for whitespace-only input after trimming", () => {
      expect(renameModel("   ", true)).toBeUndefined()
      expect(renameModel("\t\n", false)).toBeUndefined()
    })
  })

  describe("Edge cases", () => {
    it("should handle empty actualModel from extractActualModel", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "OpenAI",
      )

      // This happens when input ends with slash like "vendor/"
      expect(renameModel("vendor/", true)).toBe("OpenAI/")
      expect(renameModel("vendor/", false)).toBe("")
    })

    it("should handle metadata with empty standardName", () => {
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue({
        standardName: "",
        vendorName: "OpenAI",
      })

      expect(renameModel("test", true)).toBe("OpenAI/")
      expect(renameModel("test", false)).toBe("")
    })

    it("should handle complex real-world scenarios", () => {
      // Scenario: BigModel prefix, nested path, colon suffix, no metadata, vendor fallback
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "DeepSeek",
      )

      expect(renameModel("BigModel/deepseek/deepseek-r1:free", true)).toBe(
        "DeepSeek/deepseek-r1",
      )
      expect(renameModel("BigModel/deepseek/deepseek-r1:free", false)).toBe(
        "deepseek-r1",
      )

      // Scenario: vendor-inclusive should take precedence
      vi.mocked(modelMetadataService.findStandardModelName).mockReturnValue(
        null,
      )
      vi.mocked(modelMetadataService.findVendorByPattern).mockReturnValue(
        "TestVendor",
      )

      expect(renameModel("openai/gpt-4o", true)).toBe("openai/gpt-4o") // vendor-inclusive logic
      expect(renameModel("openai/gpt-4o:free", true)).toBe("TestVendor/gpt-4o") // fallback
    })
  })
})
