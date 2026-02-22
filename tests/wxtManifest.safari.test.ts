import { describe, expect, it } from "vitest"

import { createExtensionManifest } from "~/wxt.manifest"

describe("wxt manifest (Safari)", () => {
  it("does not request sidePanel permission for Safari", () => {
    const manifest = createExtensionManifest("safari")

    expect(manifest.permissions ?? []).not.toContain("sidePanel")
    expect(manifest.optional_permissions ?? []).not.toContain(
      "declarativeNetRequestWithHostAccess",
    )
  })

  it("keeps sidePanel permission for Chrome", () => {
    const manifest = createExtensionManifest("chrome")

    expect(manifest.permissions ?? []).toContain("sidePanel")
    expect(manifest.optional_permissions ?? []).toContain(
      "declarativeNetRequestWithHostAccess",
    )
  })
})
