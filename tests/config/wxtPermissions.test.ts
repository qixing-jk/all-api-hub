import { describe, expect, it } from "vitest"
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

  it("keeps Safari permission changes deferred", async () => {
    const manifest = await permissionsFor("safari")
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
