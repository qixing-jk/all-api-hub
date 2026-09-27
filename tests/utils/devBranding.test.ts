import { describe, expect, it } from "vitest"

import { APP_SHORT_NAME } from "~/constants/branding"
import {
  formatDevActionTitle,
  formatDevInstanceLabel,
  formatDevInstancePrefix,
  formatDevTitleSuffix,
} from "~/utils/core/devBranding"
import { EMPTY_DEV_IDENTITY } from "~/utils/core/devIdentity"
import {
  buildDevIdentity,
  DEV_IDENTITY_FIXTURE_PATH,
} from "~~/tests/test-utils/devIdentityFixtures"

/**
 * These tests cover the pure formatting helpers used to label dev builds.
 * Runtime browser APIs (badge/title setters) are exercised indirectly in background scripts.
 */
describe("devBranding", () => {
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

  it("appends the source path to the action title", () => {
    expect(
      formatDevActionTitle(
        APP_SHORT_NAME,
        "dev main@abc",
        DEV_IDENTITY_FIXTURE_PATH,
      ),
    ).toBe(`${APP_SHORT_NAME} (dev main@abc) · ${DEV_IDENTITY_FIXTURE_PATH}`)
  })

  it("does not repeat a path the title already contains", () => {
    expect(
      formatDevActionTitle(
        `${APP_SHORT_NAME} (dev) ${DEV_IDENTITY_FIXTURE_PATH}`,
        undefined,
        DEV_IDENTITY_FIXTURE_PATH,
      ),
    ).toBe(`${APP_SHORT_NAME} (dev) ${DEV_IDENTITY_FIXTURE_PATH}`)
  })

  it("adds the dev marker once when a title carries no version", () => {
    expect(
      formatDevActionTitle(
        `${APP_SHORT_NAME} (dev)`,
        undefined,
        DEV_IDENTITY_FIXTURE_PATH,
      ),
    ).toBe(`${APP_SHORT_NAME} (dev) · ${DEV_IDENTITY_FIXTURE_PATH}`)
  })

  it("ignores a blank path", () => {
    expect(formatDevActionTitle(APP_SHORT_NAME, undefined, "   ")).toBe(
      `${APP_SHORT_NAME} (dev)`,
    )
  })

  it("prefixes dev menu entries with the shortened path", () => {
    expect(formatDevInstancePrefix(buildDevIdentity())).toBe(
      "[C:…\\all-api-hub\\temp] ",
    )
  })

  it("truncates a long prefix so menu entries stay readable", () => {
    const identity = buildDevIdentity({
      pathTail: "…\\a-very-long-worktree-name-here",
    })

    expect(formatDevInstancePrefix(identity, 10)).toBe("[…name-here] ")
  })

  it("falls back to the badge code when no path was baked", () => {
    expect(
      formatDevInstancePrefix(
        buildDevIdentity({ pathTail: null, badgeText: "TEM" }),
      ),
    ).toBe("[TEM] ")
  })

  it("leaves release surfaces unprefixed", () => {
    expect(formatDevInstancePrefix(EMPTY_DEV_IDENTITY)).toBe("")
  })

  it("labels the instance with its source path wherever that fits", () => {
    expect(formatDevInstanceLabel(buildDevIdentity())).toBe(
      "C:…\\all-api-hub\\temp",
    )
    expect(
      formatDevInstanceLabel(
        buildDevIdentity({ pathTail: null, badgeText: "TEM" }),
      ),
    ).toBe("TEM")
  })

  it("shortens the label on request", () => {
    expect(formatDevInstanceLabel(buildDevIdentity(), 10)).toBe("…-hub\\temp")
  })

  it("suffixes page titles with the shortened path", () => {
    expect(formatDevTitleSuffix(buildDevIdentity())).toBe(
      " · C:…\\all-api-hub\\temp",
    )
    expect(formatDevTitleSuffix(EMPTY_DEV_IDENTITY)).toBe("")
  })
})
