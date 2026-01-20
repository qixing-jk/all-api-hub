import { describe, expect, it } from "vitest"

import {
  formatDevActionTitle,
  formatDevManifestDescription,
  formatDevManifestName,
  formatDevVersionName,
  getDevBadgeText,
} from "~/utils/devBranding"

/**
 * These tests cover the pure formatting helpers used to label dev builds.
 * Runtime browser APIs (badge/title setters) are exercised indirectly in background scripts.
 */
describe("devBranding", () => {
  it("formats version_name with branch + sha", () => {
    expect(
      formatDevVersionName({ branch: "feat/x", sha: "abc1234", dirty: false }),
    ).toBe("dev feat/x@abc1234")
  })

  it("adds +dirty when working tree is dirty", () => {
    expect(
      formatDevVersionName({ branch: "main", sha: "abc1234", dirty: true }),
    ).toBe("dev main@abc1234+dirty")
  })

  it("appends version label to manifest name", () => {
    expect(formatDevManifestName("All API Hub", "dev main@abc")).toBe(
      "All API Hub [dev main@abc]",
    )
  })

  it("appends version label to manifest description", () => {
    expect(formatDevManifestDescription("Desc", "dev main@abc")).toBe(
      "Desc | dev main@abc",
    )
  })

  it("uses DEV as badge text", () => {
    expect(getDevBadgeText()).toBe("DEV")
  })

  it("formats action title with versionName when present", () => {
    expect(formatDevActionTitle("All API Hub", "dev main@abc")).toBe(
      "All API Hub (dev main@abc)",
    )
  })

  it("avoids duplicating versionName when base already contains it", () => {
    expect(
      formatDevActionTitle("All API Hub [dev main@abc]", "dev main@abc"),
    ).toBe("All API Hub [dev main@abc]")
  })
})
