import { describe, expect, it } from "vitest"

import {
  compareDottedVersions,
  normalizeDottedVersion,
} from "~/services/updates/versionComparison"

describe("versionComparison", () => {
  it("normalizes dotted versions", () => {
    expect(normalizeDottedVersion(" 3.44.0 ")).toBe("3.44.0")
    expect(normalizeDottedVersion("v3.44.0")).toBe("3.44.0")
    expect(normalizeDottedVersion("V3.44.1")).toBe("3.44.1")
  })

  it("rejects non-dotted release versions", () => {
    expect(normalizeDottedVersion("nightly")).toBeNull()
    expect(normalizeDottedVersion("3.44.0-beta.1")).toBeNull()
    expect(normalizeDottedVersion("")).toBeNull()
    expect(normalizeDottedVersion(undefined)).toBeNull()
  })

  it("compares dotted versions numerically", () => {
    expect(compareDottedVersions("3.44.0", "3.44.1")).toBeLessThan(0)
    expect(compareDottedVersions("3.44.1", "3.44.0")).toBeGreaterThan(0)
    expect(compareDottedVersions("3.44", "3.44.0")).toBe(0)
    expect(compareDottedVersions("3.10.0", "3.9.9")).toBeGreaterThan(0)
  })

  it("returns null when either version cannot be compared", () => {
    expect(compareDottedVersions("3.44.0", "nightly")).toBeNull()
    expect(compareDottedVersions("3.44.0-beta.1", "3.44.0")).toBeNull()
    expect(compareDottedVersions(undefined, "3.44.0")).toBeNull()
  })
})
