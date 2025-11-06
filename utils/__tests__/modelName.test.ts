import { describe, expect, it } from "vitest"

import { removeDateSuffix } from "../modelName"

describe("removeDateSuffix", () => {
  it("should remove 8-digit date with dash", () => {
    expect(removeDateSuffix("model-20250101")).toBe("model")
    expect(removeDateSuffix("gpt-4o-20240718")).toBe("gpt-4o")
    expect(removeDateSuffix("claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet"
    )
  })

  it("should remove 8-digit date with underscore", () => {
    expect(removeDateSuffix("model_20250101")).toBe("model")
    expect(removeDateSuffix("gpt-4o_20240718")).toBe("gpt-4o")
  })

  it("should remove date with dashes (yyyy-mm-dd)", () => {
    expect(removeDateSuffix("model-2025-01-01")).toBe("model")
    expect(removeDateSuffix("gpt-4o-2024-07-18")).toBe("gpt-4o")
    expect(removeDateSuffix("claude-3-5-sonnet-2024-10-22")).toBe(
      "claude-3-5-sonnet"
    )
  })

  it("should remove 6-digit date (yyyymm)", () => {
    expect(removeDateSuffix("model-202501")).toBe("model")
    expect(removeDateSuffix("gpt-4o-202407")).toBe("gpt-4o")
  })

  it("should remove mm-yyyy format", () => {
    expect(removeDateSuffix("model-01-2025")).toBe("model")
    expect(removeDateSuffix("gpt-4o-07-2024")).toBe("gpt-4o")
  })

  it("should remove 4-digit mmdd", () => {
    expect(removeDateSuffix("model-0101")).toBe("model")
    expect(removeDateSuffix("gpt-4o-0722")).toBe("gpt-4o")
  })

  it("should not remove version numbers", () => {
    expect(removeDateSuffix("gpt-4o")).toBe("gpt-4o")
    expect(removeDateSuffix("claude-3-5-sonnet")).toBe("claude-3-5-sonnet")
    expect(removeDateSuffix("llama-3.1-8b")).toBe("llama-3.1-8b")
    expect(removeDateSuffix("gemini-1.5-pro")).toBe("gemini-1.5-pro")
  })

  it("should not remove numbers that are not dates", () => {
    expect(removeDateSuffix("model-123")).toBe("model-123")
    expect(removeDateSuffix("model-12345")).toBe("model-12345")
  })

  it("should handle models without date suffixes", () => {
    expect(removeDateSuffix("gpt-4o")).toBe("gpt-4o")
    expect(removeDateSuffix("claude-3-opus")).toBe("claude-3-opus")
  })

  it("should only remove date suffixes at the end", () => {
    expect(removeDateSuffix("20240101-model")).toBe("20240101-model")
    expect(removeDateSuffix("2024-01-01-model")).toBe("2024-01-01-model")
  })

  it("should handle empty string", () => {
    expect(removeDateSuffix("")).toBe("")
  })

  it("should handle complex model names", () => {
    expect(removeDateSuffix("deepseek-ai/DeepSeek-V3.1-20250101")).toBe(
      "deepseek-ai/DeepSeek-V3.1"
    )
    expect(removeDateSuffix("openai/gpt-4o-2024-07-18")).toBe("openai/gpt-4o")
  })
})
