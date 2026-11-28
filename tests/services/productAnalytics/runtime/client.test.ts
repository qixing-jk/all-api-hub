import type { PostHogConfig } from "posthog-js/dist/module.no-external"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
} from "~/services/productAnalytics/contracts"
import { DISTRIBUTION_CHANNEL } from "~/utils/core/distributionChannel"

const {
  posthogMocks,
  posthogModuleLoadMock,
  preferenceMocks,
  getExtensionVersionMock,
  i18nCoreMock,
  mockIsDevBuild,
  mockLoggerDebug,
} = vi.hoisted(() => ({
  posthogMocks: {
    init: vi.fn(),
    capture: vi.fn(),
    getFeatureFlagPayload: vi.fn(),
  },
  posthogModuleLoadMock: vi.fn(),
  preferenceMocks: {
    isEnabled: vi.fn(),
    getOrCreateAnonymousId: vi.fn(),
    getAnonymousIdIfEnabled: vi.fn(),
    withAnonymousIdIfEnabled: vi.fn(),
  },
  getExtensionVersionMock: vi.fn(() => "3.37.0"),
  i18nCoreMock: {
    resolvedLanguage: "en" as string | undefined,
    language: "en",
  },
  mockIsDevBuild: vi.fn(() => false),
  mockLoggerDebug: vi.fn(),
}))

vi.mock("posthog-js/dist/module.no-external", () => {
  posthogModuleLoadMock()
  return { default: posthogMocks }
})

vi.mock("~/services/productAnalytics/configuration/preferences", () => ({
  productAnalyticsPreferences: preferenceMocks,
}))

vi.mock("~/utils/browser/runtime", () => ({
  getExtensionVersion: getExtensionVersionMock,
}))

vi.mock("~/utils/core/environment", () => ({
  isDevBuild: mockIsDevBuild,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: mockLoggerDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock("~/utils/i18n/core", () => ({
  default: i18nCoreMock,
}))

async function importClient() {
  const module = await import("~/services/productAnalytics/runtime/client")
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
    posthogMocks.getFeatureFlagPayload.mockReturnValue(null)
    getExtensionVersionMock.mockReturnValue("3.37.0")
    i18nCoreMock.resolvedLanguage = "en"
    i18nCoreMock.language = "en"
    mockIsDevBuild.mockReturnValue(false)
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

  it("defers loading PostHog until the first eligible capture", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    expect(posthogModuleLoadMock).not.toHaveBeenCalled()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)

    expect(posthogModuleLoadMock).toHaveBeenCalledTimes(1)
    expect(posthogMocks.init).toHaveBeenCalledTimes(1)
    expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
  })

  describe("full passive analytics collection", () => {
    const passiveEvents = [
      [
        PRODUCT_ANALYTICS_EVENTS.AutoCheckinRunSummaryCaptured,
        { run_kind: "daily", entrypoint: "background", total_accounts: 2 },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.AutoCheckinAccountGroupCaptured,
        {
          run_kind: "daily",
          entrypoint: "background",
          site_type: "new-api",
          total_accounts: 2,
        },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
        { entrypoint: "background", account_auto_refresh_enabled: false },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot,
        { total_account_count: 2 },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.SiteTypePresent,
        { site_type: "new-api", account_count: 2 },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured,
        { entrypoint: "background", shield_bypass_prompt_shown_count: 1 },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          action_id: "run_auto_checkin_now",
          entrypoint: "options",
          source_kind: "auto",
          result: "success",
        },
      ],
      [
        PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
        { action_id: "show_star_promotion_prompt", entrypoint: "popup" },
      ],
    ] as const

    beforeEach(() => {
      vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
      vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    })

    it.each(["installation-0", "installation-1", "installation-12"])(
      "captures every passive and foreground event for %s across worker reloads",
      async (anonymousId) => {
        preferenceMocks.withAnonymousIdIfEnabled.mockImplementation(
          async (work) => work(anonymousId),
        )
        for (let restart = 0; restart < 3; restart++) {
          vi.resetModules()
          const client = await importClient()
          for (const [event, properties] of passiveEvents) {
            await expect(client.capture(event, properties)).resolves.toBe(true)
          }
          for (const [event, properties] of [
            [PRODUCT_ANALYTICS_EVENTS.AppOpened, { entrypoint: "options" }],
            [
              PRODUCT_ANALYTICS_EVENTS.PageViewed,
              { entrypoint: "options", page_id: "options_account_management" },
            ],
            [
              PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
              {
                entrypoint: "options",
                action_id: "create_account",
                result: "success",
              },
            ],
            [
              PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
              {
                entrypoint: "options",
                action_id: "run_account_auto_detect",
                result: "action_required",
              },
            ],
            [
              PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
              {
                entrypoint: "options",
                action_id: "run_auto_checkin_now",
                result: "success",
              },
            ],
          ] as const) {
            await expect(client.capture(event, properties)).resolves.toBe(true)
          }
        }
        expect(posthogMocks.capture).toHaveBeenCalledTimes(39)
      },
    )

    it("strips caller-provided collection metadata from passive events", async () => {
      preferenceMocks.withAnonymousIdIfEnabled.mockImplementation(
        async (work) => work("installation-1"),
      )
      const client = await importClient()
      for (const [event, properties] of passiveEvents) {
        await expect(
          client.capture(event, {
            ...properties,
            analytics_sample_rate: 999,
            analytics_policy_version: "private",
          }),
        ).resolves.toBe(true)
      }
      expect(posthogMocks.capture).toHaveBeenCalledTimes(passiveEvents.length)
      for (const [, properties] of posthogMocks.capture.mock.calls) {
        expect(properties).not.toHaveProperty("analytics_sample_rate")
        expect(properties).not.toHaveProperty("analytics_policy_version")
      }
    })
  })

  describe("storage failure reporting across worker lifetimes", () => {
    let sessionValues: Record<string, unknown>
    const session = {
      get: vi.fn(async () => structuredClone(sessionValues)),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(sessionValues, structuredClone(values))
      }),
    }
    const failure = {
      storage_area: "local",
      storage_operation: "auto_checkin_status",
      storage_failure_stage: "write",
      error_name: "Error",
    }

    beforeEach(() => {
      sessionValues = {}
      session.get.mockClear()
      session.set.mockClear()
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-11-10T00:00:00Z"))
      vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
      vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
      vi.stubGlobal("browser", { storage: { session } })
    })

    afterEach(() => vi.useRealTimers())

    it("keeps the daily cooldown after every background restart", async () => {
      for (let minute = 0; minute < 10; minute++) {
        vi.resetModules()
        vi.setSystemTime(new Date(`2026-11-10T00:0${minute}:00Z`))
        const client = await importClient()
        await client.capture(
          PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed,
          failure,
        )
      }
      expect(posthogMocks.capture).toHaveBeenCalledTimes(1)

      vi.resetModules()
      vi.setSystemTime(new Date("2026-11-11T00:00:00Z"))
      const client = await importClient()
      await expect(
        client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure),
      ).resolves.toBe(true)
      expect(posthogMocks.capture).toHaveBeenCalledTimes(2)
    })

    it("does not spend the diagnostic budget repeatedly throughout one day", async () => {
      for (let hour = 0; hour < 24; hour++) {
        vi.resetModules()
        vi.setSystemTime(
          new Date("2026-11-10T00:00:00Z").getTime() + hour * 3600000,
        )
        await (
          await importClient()
        ).capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure)
      }
      expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date("2026-11-11T00:00:00Z"))
      await (
        await importClient()
      ).capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure)
      expect(posthogMocks.capture).toHaveBeenCalledTimes(2)
    })

    it("admits concurrent duplicates once and preserves independent operation and stage slots", async () => {
      const client = await importClient()
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, {
            ...failure,
            error_name: index % 2 === 0 ? "Error" : "QuotaExceededError",
          }),
        ),
      )
      expect(results.filter(Boolean)).toHaveLength(1)

      await Promise.all([
        client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, {
          ...failure,
          storage_operation: "product_analytics_state",
        }),
        client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, {
          ...failure,
          storage_failure_stage: "read",
        }),
      ])
      vi.resetModules()
      const restarted = await importClient()
      for (const properties of [
        failure,
        { ...failure, storage_operation: "product_analytics_state" },
        { ...failure, storage_failure_stage: "read" },
      ]) {
        await expect(
          restarted.capture(
            PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed,
            properties,
          ),
        ).resolves.toBe(false)
      }
      expect(posthogMocks.capture).toHaveBeenCalledTimes(3)
    })

    it.each(["read", "write", "unsupported"])(
      "suppresses diagnostics when session storage is %s, without blocking foreground analytics",
      async (mode) => {
        if (mode === "read") {
          session.get.mockRejectedValueOnce(new Error("session read failed"))
        } else if (mode === "write") {
          session.set.mockRejectedValueOnce(new Error("session write failed"))
        } else {
          vi.stubGlobal("browser", { storage: {} })
        }
        const client = await importClient()
        await expect(
          client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure),
        ).resolves.toBe(false)
        expect(posthogMocks.capture).not.toHaveBeenCalled()
        expect(posthogMocks.init).not.toHaveBeenCalled()
        if (mode === "read") expect(session.set).not.toHaveBeenCalled()

        await expect(
          client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          }),
        ).resolves.toBe(true)
        expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
      },
    )

    it("retains admission if the SDK fails after reservation", async () => {
      posthogMocks.capture.mockImplementationOnce(() => {
        throw new Error("SDK capture failed")
      })
      const client = await importClient()
      await expect(
        client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure),
      ).resolves.toBe(false)
      vi.resetModules()
      const restarted = await importClient()
      await expect(
        restarted.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure),
      ).resolves.toBe(false)
      expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
    })

    it("starts fresh after browser session storage is cleared", async () => {
      const client = await importClient()
      await client.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure)
      sessionValues = {}
      vi.resetModules()
      const restarted = await importClient()
      await expect(
        restarted.capture(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, failure),
      ).resolves.toBe(true)
      expect(posthogMocks.capture).toHaveBeenCalledTimes(2)
    })

    it.each(["disabled", "unconfigured", "invalid payload"])(
      "does not reserve admission when capture is %s",
      async (mode) => {
        if (mode === "disabled")
          preferenceMocks.isEnabled.mockResolvedValue(false)
        if (mode === "unconfigured")
          vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "")
        const client = await importClient()
        await expect(
          client.capture(
            PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed,
            mode === "invalid payload" ? { error_name: "Error" } : failure,
          ),
        ).resolves.toBe(false)
        expect(session.get).not.toHaveBeenCalled()
        expect(session.set).not.toHaveBeenCalled()
        expect(posthogMocks.capture).not.toHaveBeenCalled()
      },
    )
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
    vi.stubEnv("DEV", false)
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
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.EdgeAddons,
    )
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        url: "https://private.example/path",
        distribution_channel: "https://private.example/forged",
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledWith("page_viewed", {
      app_version: "3.37.0",
      browser_family: "chromium",
      distribution_channel: "edge-addons",
      ui_language: "en",
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("uses the current interface language instead of the browser language", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    i18nCoreMock.resolvedLanguage = "ja"
    i18nCoreMock.language = "ja"

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledWith("app_opened", {
      app_version: "3.37.0",
      browser_family: "chromium",
      distribution_channel: "unknown",
      ui_language: "ja",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
  })

  it("uses a fixed distinct id in development builds", async () => {
    vi.stubEnv("MODE", "development")
    vi.stubEnv("DEV", true)
    mockIsDevBuild.mockReturnValue(true)
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
      distribution_channel: "unknown",
      ui_language: "en",
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

  it("uses the development distinct id in custom development build modes", async () => {
    vi.stubEnv("MODE", "local")
    vi.stubEnv("DEV", true)
    mockIsDevBuild.mockReturnValue(true)
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(true)

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
        distribution_channel: "unknown",
        ui_language: "en",
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

  it("does not capture events disabled by the PostHog analytics policy payload", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    posthogMocks.getFeatureFlagPayload.mockReturnValue({
      disabledEvents: [PRODUCT_ANALYTICS_EVENTS.PageViewed],
    })

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.init).toHaveBeenCalledTimes(1)
    expect(posthogMocks.getFeatureFlagPayload).toHaveBeenCalledWith(
      "aah-product-analytics-policy",
    )
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("does not capture feature action events disabled by feature id", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    posthogMocks.getFeatureFlagPayload.mockReturnValue({
      disabledFeatureIds: [PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin],
    })

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted, {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("does not capture feature action events disabled by action id", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    posthogMocks.getFeatureFlagPayload.mockReturnValue({
      disabledActionIds: [PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow],
    })

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted, {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: "success",
      }),
    ).resolves.toBe(false)

    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it("ignores malformed analytics policy payload fields safely", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    posthogMocks.getFeatureFlagPayload.mockReturnValue({
      disabledEvents: PRODUCT_ANALYTICS_EVENTS.PageViewed,
      disabledFeatureIds: {
        value: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      },
      disabledActionIds: [
        PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
        123,
        null,
      ],
    })

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.PageViewed, {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)

    expect(posthogMocks.capture).toHaveBeenCalledTimes(1)
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

  it("returns false without debug logging when capture work throws outside dev builds", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    preferenceMocks.withAnonymousIdIfEnabled.mockRejectedValueOnce(
      new Error("anonymous id unavailable"),
    )

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(mockLoggerDebug).not.toHaveBeenCalled()
  })

  it("logs capture work failures in custom development build modes", async () => {
    vi.stubEnv("MODE", "local")
    vi.stubEnv("DEV", true)
    mockIsDevBuild.mockReturnValue(true)
    vi.stubEnv("VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test")
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    preferenceMocks.withAnonymousIdIfEnabled.mockRejectedValueOnce(
      new Error("anonymous id unavailable"),
    )

    const client = await importClient()

    await expect(
      client.capture(PRODUCT_ANALYTICS_EVENTS.AppOpened, {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      }),
    ).resolves.toBe(false)

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Failed to capture product analytics event",
      expect.any(Error),
    )
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
      distribution_channel: "unknown",
      ui_language: "en",
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
      distribution_channel: "unknown",
      ui_language: "en",
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
