import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EMPTY_DEV_IDENTITY } from "~/utils/core/devIdentity"
import {
  buildDevIdentity,
  DEV_IDENTITY_FIXTURE_BADGE_TEXT,
  DEV_IDENTITY_FIXTURE_COLOR,
  DEV_IDENTITY_FIXTURE_PATH,
} from "~~/tests/test-utils/devIdentityFixtures"

const { getManifestMock, getDevIdentityMock, loggerDebugMock } = vi.hoisted(
  () => ({
    getManifestMock: vi.fn(),
    getDevIdentityMock: vi.fn(),
    loggerDebugMock: vi.fn(),
  }),
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getManifest: (...args: unknown[]) => getManifestMock(...args),
  }
})

vi.mock("~/utils/browser/extensionIdentity", () => ({
  getDevIdentity: (...args: unknown[]) => getDevIdentityMock(...args),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: (...args: unknown[]) => loggerDebugMock(...args),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const DEV_IDENTITY = buildDevIdentity()

async function importFreshModule() {
  vi.resetModules()
  return await import("~/entrypoints/background/devActionBranding")
}

describe("applyDevActionBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("MODE", "development")
    getManifestMock.mockReturnValue({
      name: "All API Hub",
      version_name: "dev main@abc1234",
    })
    getDevIdentityMock.mockReturnValue(DEV_IDENTITY)
    ;(globalThis as any).browser = {}
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("skips branding outside development mode", async () => {
    vi.stubEnv("MODE", "production")
    const setBadgeText = vi.fn()
    ;(globalThis as any).browser = {
      action: {
        setBadgeText,
      },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await applyDevActionBranding()

    expect(setBadgeText).not.toHaveBeenCalled()
    expect(getManifestMock).not.toHaveBeenCalled()
  })

  it("applies the instance color, code and path through browser.action", async () => {
    const setBadgeText = vi.fn().mockResolvedValue(undefined)
    const setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined)
    const setTitle = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      action: {
        setBadgeText,
        setBadgeBackgroundColor,
        setTitle,
      },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await applyDevActionBranding()

    expect(setBadgeText).toHaveBeenCalledWith({
      text: DEV_IDENTITY_FIXTURE_BADGE_TEXT,
    })
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: DEV_IDENTITY_FIXTURE_COLOR,
    })
    expect(setTitle).toHaveBeenCalledWith({
      title: `All API Hub (dev main@abc1234) · ${DEV_IDENTITY_FIXTURE_PATH}`,
    })
  })

  it("keeps the badge background when the identity carries no color", async () => {
    getDevIdentityMock.mockReturnValue(EMPTY_DEV_IDENTITY)
    const setBadgeText = vi.fn().mockResolvedValue(undefined)
    const setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      action: { setBadgeText, setBadgeBackgroundColor },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await applyDevActionBranding()

    expect(setBadgeText).toHaveBeenCalledWith({ text: "DEV" })
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled()
  })

  it("falls back to browser.browserAction and tolerates missing badge helpers", async () => {
    const setTitle = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      browserAction: {
        setTitle,
      },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await applyDevActionBranding()

    expect(setTitle).toHaveBeenCalledWith({
      title: `All API Hub (dev main@abc1234) · ${DEV_IDENTITY_FIXTURE_PATH}`,
    })
  })

  it("returns quietly when no toolbar action API is available", async () => {
    ;(globalThis as any).browser = {}

    const { applyDevActionBranding } = await importFreshModule()

    await expect(applyDevActionBranding()).resolves.toBeUndefined()
    expect(getManifestMock).not.toHaveBeenCalled()
  })

  it("logs and swallows action-branding failures", async () => {
    const brandingError = new Error("setBadgeText failed")
    ;(globalThis as any).browser = {
      action: {
        setBadgeText: vi.fn().mockRejectedValue(brandingError),
      },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await expect(applyDevActionBranding()).resolves.toBeUndefined()
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "Failed to apply toolbar badge text",
      brandingError,
    )
  })

  it("keeps the tooltip when the badge color is rejected", async () => {
    // A rejected color must not cost the other settings, which is how the badge
    // once ended up default-colored and untooltipped at the same time.
    const colorError = new Error("The color specification could not be parsed.")
    const setBadgeBackgroundColor = vi.fn().mockRejectedValue(colorError)
    const setTitle = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      action: { setBadgeBackgroundColor, setTitle },
    }

    const { applyDevActionBranding } = await importFreshModule()

    await applyDevActionBranding()

    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: DEV_IDENTITY_FIXTURE_COLOR,
    })
    expect(setTitle).toHaveBeenCalledWith({
      title: `All API Hub (dev main@abc1234) · ${DEV_IDENTITY_FIXTURE_PATH}`,
    })
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "Failed to apply toolbar badge color",
      colorError,
    )
  })
})
