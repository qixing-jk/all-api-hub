import { afterEach, describe, expect, it, vi } from "vitest"
import type { ConfigEnv } from "wxt"

import wxtConfig from "~~/wxt.config"

async function permissionsFor(browser: string) {
  if (typeof wxtConfig.manifest !== "function")
    throw new Error("Expected a manifest factory")
  return wxtConfig.manifest({
    command: "build",
    browser,
    manifestVersion: browser === "firefox" ? 2 : 3,
    mode: "production",
  } as ConfigEnv)
}

describe("request-header permission lifecycle", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("keeps Chromium-only E2E permission promotion out of Safari builds", async () => {
    vi.stubEnv("AAH_E2E_BUILD_VARIANT", "dnr-required")
    vi.resetModules()
    const { default: variantConfig } = await import("~~/wxt.config")
    if (typeof variantConfig.manifest !== "function")
      throw new Error("Expected a manifest factory")
    const manifest = variantConfig.manifest({
      command: "build",
      browser: "safari",
      manifestVersion: 3,
      mode: "test",
    } as ConfigEnv)
    expect(manifest.permissions).not.toContain("cookies")
    expect(manifest.permissions).not.toContain("sidePanel")
    expect(manifest.optional_permissions).toEqual(
      expect.arrayContaining([
        "cookies",
        "declarativeNetRequestWithHostAccess",
      ]),
    )
  })
  it("initializes Chromium DNR at extension load while Cookie access stays optional", async () => {
    const manifest = await permissionsFor("chrome")
    expect(manifest.permissions).toContain(
      "declarativeNetRequestWithHostAccess",
    )
    expect(manifest.optional_permissions).not.toContain(
      "declarativeNetRequestWithHostAccess",
    )
    expect(manifest.permissions).not.toContain("cookies")
    expect(manifest.optional_permissions).toContain("cookies")
    expect(manifest.host_permissions).toEqual(["<all_urls>"])
  })

  it("retains Firefox optional interception permissions", async () => {
    const manifest = await permissionsFor("firefox")
    expect(manifest.permissions).not.toContain(
      "declarativeNetRequestWithHostAccess",
    )
    expect(manifest.optional_permissions).toEqual(
      expect.arrayContaining(["cookies", "webRequest", "webRequestBlocking"]),
    )
  })

  it("keeps Safari optional permissions separate from Chromium requirements", async () => {
    const manifest = await permissionsFor("safari")
    expect(manifest.browser_specific_settings).toBeUndefined()
    expect(manifest.permissions).not.toContain(
      "declarativeNetRequestWithHostAccess",
    )
    expect(manifest.optional_permissions).toEqual(
      expect.arrayContaining([
        "cookies",
        "declarativeNetRequestWithHostAccess",
      ]),
    )
  })
})
