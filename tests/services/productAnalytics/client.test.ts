import type { PostHogConfig } from "posthog-js/dist/module.no-external"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PAGE_IDS,
} from "~/services/productAnalytics/events"

const { posthogMocks, preferenceMocks, getManifestMock } = vi.hoisted(() => ({
  posthogMocks: {
    init: vi.fn(),
    capture: vi.fn(),
  },
  preferenceMocks: {
    isEnabled: vi.fn(),
    getOrCreateAnonymousId: vi.fn(),
    getAnonymousIdIfEnabled: vi.fn(),
    withAnonymousIdIfEnabled: vi.fn(),
  },
  getManifestMock: vi.fn(() => ({ version: "3.37.0" })),
}))

vi.mock("posthog-js/dist/module.no-external", () => ({
  default: posthogMocks,
}))

vi.mock("~/services/productAnalytics/preferences", () => ({
  productAnalyticsPreferences: preferenceMocks,
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getManifest: getManifestMock,
}))

async function importClient() {
  const module = await import("~/services/productAnalytics/client")
  return module.productAnalyticsClient
}

function getPostHogConfig(): Partial<PostHogConfig> {
  return posthogMocks.init.mock.calls[0]?.[1] ?? {}
}

describe("productAnalyticsClient", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "")
    preferenceMocks.isEnabled.mockResolvedValue(true)
    preferenceMocks.getOrCreateAnonymousId.mockResolvedValue("analytics-123")
    preferenceMocks.getAnonymousIdIfEnabled.mockResolvedValue("analytics-123")
    preferenceMocks.withAnonymousIdIfEnabled.mockImplementation(
      async (work: (anonymousId: string) => Promise<boolean>) =>
        await work("analytics-123"),
    )
    getManifestMock.mockReturnValue({ version: "3.37.0" })
    vi.stubGlobal("navigator", {
      language: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("no-ops when analytics is disabled", async () => {
    preferenceMocks.isEnabled.mockResolvedValue(false)
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.init).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("no-ops when PostHog config is missing", async () => {
    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.init).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("initializes PostHog with privacy-sensitive defaults disabled", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.init).toHaveBeenCalledTimes(1)
    expect(posthogMocks.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://posthog.example",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      save_referrer: false,
      save_campaign_params: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      disable_persistence: true,
      bootstrap: {
        distinctID: "analytics-123",
      },
    })
    expect(getPostHogConfig().before_send).toBeUndefined()
  })

  it("initializes PostHog once while capturing multiple successful events", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)
    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.init).toHaveBeenCalledTimes(1)
    expect(posthogMocks.capture).toHaveBeenCalledTimes(2)
  })

  it("adds anonymous distinct id and shared context to captured events while stripping urls", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        url: "https://private.example/path",
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledWith("page_viewed", {
      app_version: "3.37.0",
      browser_family: "chromium",
      ui_language: "en-US",
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("uses a fixed distinct id in development mode", async () => {
    vi.stubEnv("MODE", "development")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledWith("app_opened", {
      app_version: "3.37.0",
      browser_family: "chromium",
      ui_language: "en-US",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
    expect(posthogMocks.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        bootstrap: {
          distinctID: "analytics-development",
        },
      }),
    )
  })

  it("captures site ecosystem snapshots even when sanitized properties are empty", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot, {
        url: "https://private.example/path",
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot,
      {
        app_version: "3.37.0",
        browser_family: "chromium",
        ui_language: "en-US",
      },
    )
  })

  it("does not capture non-snapshot events when sanitizer removes every property", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        url: "https://private.example/path",
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("does not capture when analytics is disabled before locked capture work", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    preferenceMocks.withAnonymousIdIfEnabled.mockResolvedValue(null)

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(preferenceMocks.getOrCreateAnonymousId).not.toHaveBeenCalled()
    expect(preferenceMocks.getAnonymousIdIfEnabled).not.toHaveBeenCalled()
    expect(preferenceMocks.withAnonymousIdIfEnabled).toHaveBeenCalledTimes(1)
    expect(posthogMocks.init).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("runs PostHog initialization and capture inside the enabled anonymous-id work", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    let captureWork: ((anonymousId: string) => Promise<boolean>) | undefined
    preferenceMocks.withAnonymousIdIfEnabled.mockImplementationOnce(
      async (work: (anonymousId: string) => Promise<boolean>) => {
        captureWork = work
        return false
      },
    )

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(captureWork).toEqual(expect.any(Function))
    expect(posthogMocks.init).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()

    await expect(captureWork?.("analytics-locked")).resolves.toBe(true)

    expect(posthogMocks.init).toHaveBeenCalledTimes(1)
    expect(posthogMocks.capture).toHaveBeenCalledWith("app_opened", {
      app_version: "3.37.0",
      browser_family: "chromium",
      ui_language: "en-US",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
  })

  it("does not register before_send event amendment", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        token: "secret",
        url: "https://private.example/path",
      }),
    ).resolves.toBe(true)

    expect(getPostHogConfig().before_send).toBeUndefined()
    expect(posthogMocks.capture).toHaveBeenCalledWith("page_viewed", {
      app_version: "3.37.0",
      browser_family: "chromium",
      ui_language: "en-US",
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
