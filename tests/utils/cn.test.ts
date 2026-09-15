import { describe, expect, it } from "vitest"

import { cn } from "~/lib/utils"

describe("cn utility", () => {
  it("should merge class names correctly", () => {
    const result = cn("text-red-500", "bg-blue-500")
    expect(result).toContain("text-red-500")
    expect(result).toContain("bg-blue-500")
  })

  it("should handle conditional classes", () => {
    const result = cn(
      "base-class",
      // eslint-disable-next-line no-constant-binary-expression
      true && "conditional-class",
      // eslint-disable-next-line no-constant-binary-expression
      false && "hidden",
    )
    expect(result).toContain("base-class")
    expect(result).toContain("conditional-class")
    expect(result).not.toContain("hidden")
  })

  it("should deduplicate Tailwind classes", () => {
    // twMerge should resolve conflicting classes
    const result = cn("px-2 py-1", "px-4")
    // Should keep only px-4, not both
    expect(result).toContain("px-4")
    expect(result).not.toContain("px-2")
  })

  it("should handle empty inputs", () => {
    const result = cn()
    expect(result).toBe("")
  })

  it("should handle arrays of classes", () => {
    const result = cn(["class1", "class2"], "class3")
    expect(result).toContain("class1")
    expect(result).toContain("class2")
    expect(result).toContain("class3")
  })

  it("should handle objects with boolean values", () => {
    const result = cn({
      class1: true,
      class2: false,
      class3: true,
    })
    expect(result).toContain("class1")
    expect(result).not.toContain("class2")
    expect(result).toContain("class3")
  })
})

describe("density spacing overrides", () => {
  it("keeps disjoint density axes after formatting while allowing caller overrides", () => {
    for (const classes of [
      "px-4 py-density-4",
      "py-density-4 px-4",
      "sm:px-4 sm:py-density-4",
      "sm:py-density-4 sm:px-4",
      "gap-x-4 gap-y-density-4",
      "gap-y-density-4 gap-x-4",
    ]) {
      expect(cn(classes).split(" ")).toHaveLength(2)
    }
    expect(cn("py-density-4 px-4", "p-0")).toBe("p-0")
    expect(cn("py-density-4 px-4", "pt-0")).toBe("py-density-4 px-4 pt-0")
    expect(cn("gap-y-density-4 gap-x-4", "gap-0")).toBe("gap-0")
  })

  it("merges density spacing with ordinary spacing and responsive overrides", () => {
    expect(cn("py-density-3", "py-0")).toBe("py-0")
    expect(cn("gap-2", "gap-density-2")).toBe("gap-density-2")
    expect(cn("space-y-density-4", "space-y-0")).toBe("space-y-0")
    expect(cn("sm:py-density-6", "sm:py-2")).toBe("sm:py-2")
  })
})
