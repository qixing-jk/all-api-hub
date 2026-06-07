import { describe, expect, it } from "vitest"

import { isVersionInRange } from "~/services/productAnnouncements/versionRange"

describe("product announcement version ranges", () => {
  it("matches bounded semver-like ranges", () => {
    expect(isVersionInRange("3.44.0", ">=3.44.0 <3.44.1")).toBe(true)
    expect(isVersionInRange("3.44.0.1", ">=3.44.0 <3.44.1")).toBe(true)
    expect(isVersionInRange("3.44.1", ">=3.44.0 <3.44.1")).toBe(false)
    expect(isVersionInRange("3.43.9", ">=3.44.0 <3.44.1")).toBe(false)
  })

  it("supports exact and wildcard ranges", () => {
    expect(isVersionInRange("3.44.0", "3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.1", "3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.1", "*")).toBe(true)
  })

  it("supports optional v prefixes and explicit equality comparators", () => {
    expect(isVersionInRange("v3.44.0", "=3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.0", "=v3.44.0")).toBe(true)
    expect(isVersionInRange("v3.44.1", "=3.44.0")).toBe(false)
  })

  it("supports greater-than and less-than comparators", () => {
    expect(isVersionInRange("3.44.1", ">3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.0", ">3.44.0")).toBe(false)
    expect(isVersionInRange("3.43.9", "<3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.0", "<3.44.0")).toBe(false)
  })

  it("supports inclusive upper-bound comparators", () => {
    expect(isVersionInRange("3.44.0", "<=3.44.0")).toBe(true)
    expect(isVersionInRange("3.44.1", "<=3.44.0")).toBe(false)
  })

  it("fails closed for invalid ranges or versions", () => {
    expect(isVersionInRange("dev", ">=3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.0", "=>3.44.0")).toBe(false)
    expect(isVersionInRange("3.44.0", "")).toBe(false)
  })
})
