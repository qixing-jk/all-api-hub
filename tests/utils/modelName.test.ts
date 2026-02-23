import { describe, expect, it } from "vitest"

import { removeDateSuffix, toModelTokenKey } from "~/utils/modelName"

describe("removeDateSuffix", () => {
  describe("yyyymmdd format (8-digit date)", () => {
    it("should remove with dash separator", () => {
      expect(removeDateSuffix("model-20250101")).toBe("model")
      expect(removeDateSuffix("gpt-4o-20240718")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-5-sonnet-20241022")).toBe(
        "claude-3-5-sonnet",
      )
    })

    it("should remove with underscore separator", () => {
      expect(removeDateSuffix("model_20250101")).toBe("model")
      expect(removeDateSuffix("gpt-4o_20240718")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-5-sonnet_20241022")).toBe(
        "claude-3-5-sonnet",
      )
    })

    it("should handle mixed case (case insensitive)", () => {
      expect(removeDateSuffix("Model-20250101")).toBe("Model")
      expect(removeDateSuffix("GPT-4O-20240718")).toBe("GPT-4O")
    })
  })

  describe("yyyy-mm-dd format (date with separators)", () => {
    it("should remove with dash separators", () => {
      expect(removeDateSuffix("model-2025-01-01")).toBe("model")
      expect(removeDateSuffix("gpt-4o-2024-07-18")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-5-sonnet-2024-10-22")).toBe(
        "claude-3-5-sonnet",
      )
    })

    it("should remove with underscore separators", () => {
      expect(removeDateSuffix("model_2025_01_01")).toBe("model")
      expect(removeDateSuffix("gpt-4o_2024_07_18")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-5-sonnet_2024_10_22")).toBe(
        "claude-3-5-sonnet",
      )
    })

    it("should handle mixed case (case insensitive)", () => {
      expect(removeDateSuffix("Model-2025-01-01")).toBe("Model")
      expect(removeDateSuffix("GPT-4O-2024-07-18")).toBe("GPT-4O")
    })
  })

  describe("yyyymm format (6-digit date)", () => {
    it("should remove with dash separator", () => {
      expect(removeDateSuffix("model-202501")).toBe("model")
      expect(removeDateSuffix("gpt-4o-202407")).toBe("gpt-4o")
    })

    it("should remove with underscore separator", () => {
      expect(removeDateSuffix("model_202501")).toBe("model")
      expect(removeDateSuffix("gpt-4o_202407")).toBe("gpt-4o")
    })

    it("should handle mixed case (case insensitive)", () => {
      expect(removeDateSuffix("Model-202501")).toBe("Model")
      expect(removeDateSuffix("GPT-4O-202407")).toBe("GPT-4O")
    })
  })

  describe("mm-yyyy format", () => {
    it("should remove with dash separator", () => {
      expect(removeDateSuffix("model-01-2025")).toBe("model")
      expect(removeDateSuffix("gpt-4o-07-2024")).toBe("gpt-4o")
    })

    it("should remove with underscore separator", () => {
      expect(removeDateSuffix("model_01_2025")).toBe("model")
      expect(removeDateSuffix("gpt-4o_07_2024")).toBe("gpt-4o")
    })

    it("should handle mixed case (case insensitive)", () => {
      expect(removeDateSuffix("Model-01-2025")).toBe("Model")
      expect(removeDateSuffix("GPT-4O-07-2024")).toBe("GPT-4O")
    })
  })

  describe("mmdd format (4-digit)", () => {
    it("should remove with dash separator", () => {
      expect(removeDateSuffix("model-0101")).toBe("model")
      expect(removeDateSuffix("gpt-4o-0722")).toBe("gpt-4o")
    })

    it("should remove with underscore separator", () => {
      expect(removeDateSuffix("model_0101")).toBe("model")
      expect(removeDateSuffix("gpt-4o_0722")).toBe("gpt-4o")
    })

    it("should handle mixed case (case insensitive)", () => {
      expect(removeDateSuffix("Model-0101")).toBe("Model")
      expect(removeDateSuffix("GPT-4O-0722")).toBe("GPT-4O")
    })
  })

  describe("no-op scenarios (should not remove)", () => {
    it("should not remove version numbers", () => {
      expect(removeDateSuffix("gpt-4o")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-5-sonnet")).toBe("claude-3-5-sonnet")
      expect(removeDateSuffix("llama-3.1-8b")).toBe("llama-3.1-8b")
      expect(removeDateSuffix("gemini-1.5-pro")).toBe("gemini-1.5-pro")
      expect(removeDateSuffix("gpt-4")).toBe("gpt-4")
      expect(removeDateSuffix("claude-3")).toBe("claude-3")
    })

    it("should not remove short numeric segments (3 digits or less)", () => {
      expect(removeDateSuffix("model-123")).toBe("model-123")
      expect(removeDateSuffix("model-12")).toBe("model-12")
      expect(removeDateSuffix("model-1")).toBe("model-1")
      expect(removeDateSuffix("model-999")).toBe("model-999")
    })

    it("should not remove 5-digit numbers", () => {
      expect(removeDateSuffix("model-12345")).toBe("model-12345")
      expect(removeDateSuffix("model-99999")).toBe("model-99999")
    })

    it("should not remove 7-digit numbers", () => {
      expect(removeDateSuffix("model-1234567")).toBe("model-1234567")
    })

    it("should not remove dates embedded in the middle", () => {
      expect(removeDateSuffix("20240101-model")).toBe("20240101-model")
      expect(removeDateSuffix("2024-01-01-model")).toBe("2024-01-01-model")
      expect(removeDateSuffix("model-20240101-v2")).toBe("model-20240101-v2")
      expect(removeDateSuffix("gpt-2024-01-01-latest")).toBe(
        "gpt-2024-01-01-latest",
      )
    })

    it("should not remove dates without separators", () => {
      expect(removeDateSuffix("model20240101")).toBe("model20240101")
      expect(removeDateSuffix("gpt4o20240718")).toBe("gpt4o20240718")
    })

    it("should handle models without date suffixes", () => {
      expect(removeDateSuffix("gpt-4o")).toBe("gpt-4o")
      expect(removeDateSuffix("claude-3-opus")).toBe("claude-3-opus")
      expect(removeDateSuffix("llama-3.1")).toBe("llama-3.1")
    })

    it("should handle empty string", () => {
      expect(removeDateSuffix("")).toBe("")
    })

    it("should not remove invalid date formats", () => {
      // Invalid year (starting with 18)
      expect(removeDateSuffix("model-18991231")).toBe("model-18991231")
      // Invalid year (starting with 21)
      expect(removeDateSuffix("model-21001231")).toBe("model-21001231")
    })
  })

  describe("complex real-world model names", () => {
    it("should handle organization/provider prefixes", () => {
      expect(removeDateSuffix("deepseek-ai/DeepSeek-V3.1-20250101")).toBe(
        "deepseek-ai/DeepSeek-V3.1",
      )
      expect(removeDateSuffix("openai/gpt-4o-2024-07-18")).toBe("openai/gpt-4o")
      expect(removeDateSuffix("anthropic/claude-3-5-sonnet-20241022")).toBe(
        "anthropic/claude-3-5-sonnet",
      )
    })

    it("should handle mixed separators in model names", () => {
      expect(removeDateSuffix("model_name-with_mixed-20250101")).toBe(
        "model_name-with_mixed",
      )
      expect(removeDateSuffix("gpt_4o-turbo-2024-07-18")).toBe("gpt_4o-turbo")
    })

    it("should handle multiple version numbers before date", () => {
      expect(removeDateSuffix("llama-3.1-70b-instruct-20240101")).toBe(
        "llama-3.1-70b-instruct",
      )
      expect(removeDateSuffix("gemini-1.5-pro-001-20240101")).toBe(
        "gemini-1.5-pro-001",
      )
    })

    it("should handle mm-dd or mm_dd date", () => {
      expect(removeDateSuffix("gemini-2.5-flash-preview-05-20")).toBe(
        "gemini-2.5-flash-preview",
      )

      expect(removeDateSuffix("gemini-2.5-flash-preview-05_20")).toBe(
        "gemini-2.5-flash-preview",
      )
    })
  })
})

describe("toModelTokenKey", () => {
  it("treats dots and hyphens as equivalent and ignores ordering", () => {
    expect(toModelTokenKey("claude-4.5-sonnet")).toBe(
      toModelTokenKey("claude-sonnet-4-5"),
    )
  })

  it("treats underscores as equivalent to hyphens", () => {
    expect(toModelTokenKey("claude_4_5_sonnet")).toBe(
      toModelTokenKey("claude-4-5-sonnet"),
    )
  })

  it("ignores trailing date suffixes", () => {
    expect(toModelTokenKey("claude-4.5-sonnet")).toBe(
      toModelTokenKey("claude-sonnet-4-5-20250929"),
    )
  })

  it("distinguishes minor versions (4.5 vs 4.6)", () => {
    expect(toModelTokenKey("claude-4.5-sonnet")).not.toBe(
      toModelTokenKey("claude-4.6-sonnet"),
    )
  })

  it("returns null for empty input", () => {
    expect(toModelTokenKey("")).toBeNull()
    expect(toModelTokenKey("   ")).toBeNull()
  })
})
