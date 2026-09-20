import { describe, expect, it } from "vitest"

import {
  EMPTY_DEV_IDENTITY,
  formatDevManifestName,
  getDevBadgeText,
  getDevIdentityColor,
  getDevIdentityColorIndex,
  getDevPathTail,
  hashDevIdentitySeed,
  truncateDevLabel,
} from "~/utils/core/devIdentity"
import { DEV_PATH_FIXTURES as PATHS } from "~~/tests/test-utils/devIdentityFixtures"

describe("devIdentity color", () => {
  it("maps palette slots to distinct hues and alternating lightness", () => {
    expect(getDevIdentityColor(0)).toBe("rgb(185, 76, 39)")
    expect(getDevIdentityColor(1)).toBe("rgb(218, 183, 78)")
    expect(getDevIdentityColor(11)).toBe("rgb(218, 78, 113)")
  })

  it("emits rgb() because the toolbar badge API rejects modern hsl syntax", () => {
    // The same string feeds inline page styles and action.setBadgeBackgroundColor,
    // and the latter throws "The color specification could not be parsed." for
    // space-separated hsl().
    for (let slot = 0; slot < 12; slot += 1) {
      expect(getDevIdentityColor(slot)).toMatch(
        /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/,
      )
    }
  })

  it("keeps every slot inside the palette and wraps in both directions", () => {
    expect(getDevIdentityColor(12)).toBe(getDevIdentityColor(0))
    expect(getDevIdentityColor(-1)).toBe(getDevIdentityColor(11))

    const slotColors = new Set(
      Array.from({ length: 12 }, (_, slot) => getDevIdentityColor(slot)),
    )
    expect(slotColors.size).toBe(12)
  })

  it("keeps every path on a fixed palette slot", () => {
    // Stability contract: if these change, every checkout changes color and the
    // color stops being something to recognise. Sibling worktrees deliberately
    // land on different slots.
    expect(getDevIdentityColorIndex(PATHS.windowsWorktree)).toBe(7)
    expect(getDevIdentityColorIndex(PATHS.windowsSiblingWorktree)).toBe(4)
    expect(getDevIdentityColorIndex(PATHS.windowsShallow)).toBe(9)
    expect(getDevIdentityColorIndex(PATHS.posixWorktree)).toBe(3)
    expect(getDevIdentityColorIndex(PATHS.windowsWorktree)).not.toBe(
      getDevIdentityColorIndex(PATHS.windowsSiblingWorktree),
    )
  })
})

describe("hashDevIdentitySeed", () => {
  it("is stable and sensitive to the seed", () => {
    expect(hashDevIdentitySeed("temp")).toBe(hashDevIdentitySeed("temp"))
    expect(hashDevIdentitySeed("temp")).not.toBe(hashDevIdentitySeed("main"))
  })

  it.each(Object.values(PATHS))(
    "hashes %s into an unsigned 32-bit value",
    (path) => {
      const hash = hashDevIdentitySeed(path)

      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xffffffff)
    },
  )
})

describe("getDevPathTail", () => {
  it.each([
    ["a nested windows path", PATHS.windowsWorktree, "C:…\\all-api-hub\\temp"],
    [
      "a path with a trailing separator",
      PATHS.windowsWorktreeWithTrailingSeparator,
      "C:…\\all-api-hub\\temp",
    ],
    ["a shallow windows path", PATHS.windowsShallow, "C:\\project"],
    ["a nested posix path", PATHS.posixWorktree, "…/all-api-hub/feature-login"],
    [
      // A backslash is a legal character inside a POSIX directory name, so it
      // stays literal instead of splitting the segment in two.
      "a posix path with a literal backslash in a directory name",
      PATHS.posixNameWithBackslash,
      "…/dev/tool\\kit",
    ],
    ["a shallow posix path", PATHS.posixShallow, "home"],
    ["a unc share", PATHS.uncShare, "…\\share\\repo"],
    [
      "a directory name with spaces",
      PATHS.windowsSpacedName,
      "C:…\\dev\\my repo (copy 2)",
    ],
    ["a path with no segments", "///", null],
    ["an empty path", PATHS.empty, null],
  ])("shortens %s", (_label, path, expected) => {
    expect(getDevPathTail(path)).toBe(expected)
  })

  it("honours a custom segment count", () => {
    expect(getDevPathTail(PATHS.windowsWorktree, 1)).toBe("C:…\\temp")
    expect(getDevPathTail(PATHS.posixWorktree, 3)).toBe(
      "…/dev/all-api-hub/feature-login",
    )
  })
})

describe("getDevBadgeText", () => {
  it.each([
    ["a windows worktree", PATHS.windowsWorktree, "TEM"],
    ["a nested posix worktree", PATHS.posixWorktree, "FEA"],
    [
      // The whole directory name is one segment, so its badge code spans both
      // words joined by the literal backslash.
      "a posix directory name with a literal backslash",
      PATHS.posixNameWithBackslash,
      "TOO",
    ],
    ["a shallow path", PATHS.windowsShallow, "PRO"],
    ["a directory name with punctuation", PATHS.windowsSpacedName, "MYR"],
  ])(
    "starts the badge with the last directory name for %s",
    (_label, path, expected) => {
      expect(getDevBadgeText(path, null)).toBe(expected)
    },
  )

  it("pads a directory name without enough letters from the seed", () => {
    const shortNamePath = "C:\\dev\\54"

    expect(getDevBadgeText(shortNamePath, shortNamePath)).toBe("54K")
    // The padding follows the seed, which is what keeps two short names apart.
    expect(getDevBadgeText(shortNamePath, "another-build")).toBe("54H")
  })

  it("falls back to seed letters for a directory name with no ascii letters", () => {
    // Three ASCII characters cannot represent every directory name, so the badge
    // becomes a stable code for that build and the page title carries the path.
    const nonAsciiPath = PATHS.windowsNonAsciiName

    expect(getDevBadgeText(nonAsciiPath, nonAsciiPath)).toBe("AMJ")
    expect(getDevBadgeText(nonAsciiPath, "other-seed")).toBe("BAN")
  })

  it("uses the seed alone when no path was baked", () => {
    expect(getDevBadgeText(null, "fixture-seed")).toMatch(/^[A-Z]{3}$/)
  })

  it("falls back to a fixed code without a path or seed", () => {
    expect(getDevBadgeText(null, null)).toBe("DEV")
    expect(getDevBadgeText(PATHS.empty, null)).toBe("DEV")
  })
})

describe("truncateDevLabel", () => {
  it("keeps short labels and truncates the head of long ones", () => {
    expect(truncateDevLabel("abcdef", 10)).toBe("abcdef")
    expect(truncateDevLabel("abcdefghij", 5)).toBe("…ghij")
    expect(truncateDevLabel("abcdefghij", 1)).toBe("j")
  })
})

describe("formatDevManifestName", () => {
  it("puts the shortened path in the development manifest name", () => {
    expect(formatDevManifestName("All API Hub", PATHS.windowsWorktree)).toBe(
      "All API Hub (dev) C:…\\all-api-hub\\temp",
    )
  })

  it("keeps the name usable without a path", () => {
    expect(formatDevManifestName("All API Hub", null)).toBe("All API Hub (dev)")
    expect(formatDevManifestName("All API Hub", "   ")).toBe(
      "All API Hub (dev)",
    )
  })
})

describe("EMPTY_DEV_IDENTITY", () => {
  it("carries no color, so release surfaces stay unmarked", () => {
    expect(EMPTY_DEV_IDENTITY.color).toBeNull()
    expect(EMPTY_DEV_IDENTITY.path).toBeNull()
    expect(EMPTY_DEV_IDENTITY.source).toBe("none")
  })
})
