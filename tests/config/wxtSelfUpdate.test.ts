import { afterEach, describe, expect, it, vi } from "vitest"

import packageJson from "~~/package.json"
import wxtConfig from "~~/wxt.config"

afterEach(() => vi.unstubAllEnvs())

const SELF_UPDATE_URL =
  "https://github.com/qixing-jk/all-api-hub/releases/latest/download/updates.xml"

function buildManifest(
  browser = "chrome",
  command: "build" | "serve" = "build",
): Record<string, unknown> {
  const manifest = wxtConfig.manifest
  if (typeof manifest !== "function") {
    throw new Error("Expected manifest factory")
  }
  return manifest({
    browser,
    command,
    mode: "production",
    manifestVersion: 3,
  }) as Record<string, unknown>
}

/** Build a manifest for an explicit distribution channel. */
function buildManifestWithChannel(
  browser: string,
  channel: string,
): Record<string, unknown> {
  vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", channel)
  return buildManifest(browser)
}

describe("self-hosted Chromium updates", () => {
  it("gives consecutive nightly CRX builds increasing browser versions without a package bump", () => {
    vi.stubEnv("AAH_SELF_UPDATE_URL", SELF_UPDATE_URL)
    vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", "github-nightly")
    const samples = [
      ["2026-10-26T04:59:59.999Z", "2026.1026.459.59999"],
      ["2026-10-26T05:00:00.000Z", "2026.1026.500.0"],
      ["2026-10-26T05:00:00.001Z", "2026.1026.500.1"],
      ["2026-10-27T00:00:00.000Z", "2026.1027.0.0"],
      ["2026-11-01T00:00:00.000Z", "2026.1101.0.0"],
      ["2027-01-01T00:00:00.000Z", "2027.101.0.0"],
    ]
    for (const [buildTime, version] of samples) {
      vi.stubEnv("AAH_CRX_BUILD_TIME", buildTime)
      const manifest = buildManifest()
      expect(manifest.version).toBe(version)
      expect(manifest.version_name).toBe(`${packageJson.version} nightly`)
    }
  })

  it.each([
    ["chrome", "github-release", "build", SELF_UPDATE_URL],
    ["chrome", "github-nightly", "build", ""],
    ["chrome", "github-nightly", "serve", SELF_UPDATE_URL],
    ["chrome", "chrome-web-store", "build", SELF_UPDATE_URL],
    ["edge", "edge-addons", "build", SELF_UPDATE_URL],
    ["firefox", "github-nightly", "build", SELF_UPDATE_URL],
    ["safari", "github-nightly", "build", SELF_UPDATE_URL],
  ] as const)(
    "preserves package versions for %s %s %s builds",
    (browser, channel, command, url) => {
      vi.stubEnv("AAH_SELF_UPDATE_URL", url)
      vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", channel)
      vi.stubEnv("AAH_CRX_BUILD_TIME", "invalid")
      const manifest = buildManifest(browser, command)
      expect(manifest.version).toBeUndefined()
      expect(manifest.version_name).toBeUndefined()
    },
  )

  it("rejects an invalid nightly build timestamp before producing an uninstallable CRX", () => {
    vi.stubEnv("AAH_SELF_UPDATE_URL", SELF_UPDATE_URL)
    vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", "github-nightly")
    vi.stubEnv("AAH_CRX_BUILD_TIME", "invalid")
    expect(() => buildManifest()).toThrow(/AAH_CRX_BUILD_TIME/)
  })

  it("bakes update_url only when a self-update URL is provided", () => {
    vi.stubEnv("AAH_SELF_UPDATE_URL", SELF_UPDATE_URL)
    vi.stubEnv("AAH_DISTRIBUTION_CHANNEL", "github-release")
    expect(buildManifest().update_url).toBe(SELF_UPDATE_URL)
  })

  it("omits update_url for a normal build so stock browsers can install the ZIP", () => {
    // A baked update_url makes Chrome reject an off-store package with
    // CRX_REQUIRED_PROOF_MISSING unless admin policy allows the extension.
    expect(buildManifest().update_url).toBeUndefined()
  })

  it("never writes update_url into Firefox, Safari, or dev-serve manifests", () => {
    vi.stubEnv("AAH_SELF_UPDATE_URL", SELF_UPDATE_URL)
    expect(buildManifest("firefox", "build").update_url).toBeUndefined()
    expect(buildManifest("safari", "build").update_url).toBeUndefined()
    expect(buildManifest("chrome", "serve").update_url).toBeUndefined()
  })

  it("refuses to bake update_url into store-channel builds even when the URL leaks", () => {
    // The guard must not depend on packaging remembering to unset the variable:
    // a store submission with a self-hosted update URL would be rejected or
    // routed to the wrong update source.
    vi.stubEnv("AAH_SELF_UPDATE_URL", SELF_UPDATE_URL)
    expect(
      buildManifestWithChannel("chrome", "chrome-web-store").update_url,
    ).toBeUndefined()
    expect(
      buildManifestWithChannel("edge", "edge-addons").update_url,
    ).toBeUndefined()
    expect(
      buildManifestWithChannel("firefox", "firefox-amo").update_url,
    ).toBeUndefined()
  })
})
