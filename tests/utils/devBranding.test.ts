import { describe, expect, it } from "vitest"

import { APP_SHORT_NAME } from "~/constants/branding"
import { formatDevActionTitle, getDevBadgeText } from "~/utils/core/devBranding"

/**
 * These tests cover the pure formatting helpers used to label dev builds.
 * Runtime browser APIs (badge/title setters) are exercised indirectly in background scripts.
 */
describe("devBranding", () => {
  it("uses DEV as badge text", () => {
    expect(getDevBadgeText()).toBe("DEV")
  })

  it("formats action title with versionName when present", () => {
    expect(formatDevActionTitle(APP_SHORT_NAME, "dev main@abc")).toBe(
      `${APP_SHORT_NAME} (dev main@abc)`,
    )
  })

  it("avoids duplicating versionName when base already contains it", () => {
    expect(
      formatDevActionTitle(`${APP_SHORT_NAME} [dev main@abc]`, "dev main@abc"),
    ).toBe(`${APP_SHORT_NAME} [dev main@abc]`)
  })

  it("falls back to the app short name and generic dev suffix when the title inputs are blank", () => {
    expect(formatDevActionTitle("   ", "   ")).toBe(`${APP_SHORT_NAME} (dev)`)
  })
})
