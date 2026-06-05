import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  getManifestMock,
  formatDevActionTitleMock,
  getDevBadgeTextMock,
  loggerDebugMock,
} = vi.hoisted(() => ({
  getManifestMock: vi.fn(),
  formatDevActionTitleMock: vi.fn(),
  getDevBadgeTextMock: vi.fn(),
  loggerDebugMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getManifest: (...args: unknown[]) => getManifestMock(...args),
  }
})

vi.mock("~/utils/core/devBranding", () => ({
  formatDevActionTitle: (...args: unknown[]) =>
    formatDevActionTitleMock(...args),
  getDevBadgeText: (...args: unknown[]) => getDevBadgeTextMock(...args),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: (...args: unknown[]) => loggerDebugMock(...args),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

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
    formatDevActionTitleMock.mockReturnValue("All API Hub (dev main@abc1234)")
    getDevBadgeTextMock.mockReturnValue("DEV")
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

  it("applies the dev badge and title through browser.action when available", async () => {
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

    expect(formatDevActionTitleMock).toHaveBeenCalledWith(
      "All API Hub",
      "dev main@abc1234",
    )
    expect(setBadgeText).toHaveBeenCalledWith({ text: "DEV" })
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#DC2626" })
    expect(setTitle).toHaveBeenCalledWith({
      title: "All API Hub (dev main@abc1234)",
    })
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
      title: "All API Hub (dev main@abc1234)",
    })
    expect(getDevBadgeTextMock).not.toHaveBeenCalled()
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
      "Failed to apply toolbar badge/title",
      brandingError,
    )
  })
})
