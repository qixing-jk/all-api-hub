import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { SITE_TYPES } from "~/constants/siteType"
import { createDefaultPreferences } from "~/services/preferences/userPreferences"
import {
  handleProductAnalyticsMessage,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  setupProductAnalyticsAccountChangeListener,
  setupProductAnalyticsMessagingListeners,
  setupProductAnalyticsPreferencesChangeListener,
} from "~/services/productAnalytics"
import { ProductAnalyticsMessageTypes } from "~/services/productAnalytics/messaging"

const {
  captureMock,
  getAllAccountsMock,
  getPreferencesMock,
  mockIsDevBuild,
  mockLoggerDebug,
  mockOnProductAnalyticsMessage,
  preferenceMocks,
  stateMocks,
} = vi.hoisted(() => ({
  captureMock: vi.fn(),
  getAllAccountsMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  mockIsDevBuild: vi.fn(() => false),
  mockLoggerDebug: vi.fn(),
  mockOnProductAnalyticsMessage: vi.fn(() => vi.fn()),
  preferenceMocks: {
    isEnabled: vi.fn(),
  },
  stateMocks: {
    getState: vi.fn(),
    getShieldBypassSummaryState: vi.fn(),
    setLastSettingsSnapshotAt: vi.fn(),
    setLastSiteEcosystemSnapshotAt: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/client", () => ({
  productAnalyticsClient: {
    capture: captureMock,
  },
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

vi.mock("~/services/productAnalytics/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/messaging")
    >()
  return {
    ...actual,
    onProductAnalyticsMessage: mockOnProductAnalyticsMessage,
  }
})

vi.mock("~/services/productAnalytics/preferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/preferences")
    >()
  return {
    ...actual,
    productAnalyticsPreferences: {
      ...actual.productAnalyticsPreferences,
      ...preferenceMocks,
    },
  }
})

vi.mock("~/services/productAnalytics/state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/state")>()
  return {
    ...actual,
    productAnalyticsState: {
      ...actual.productAnalyticsState,
      ...stateMocks,
    },
  }
})

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: getAllAccountsMock,
  },
  ACCOUNT_STORAGE_KEYS: {
    ACCOUNTS: "site_accounts",
  },
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: getPreferencesMock,
    },
  }
})

describe("product analytics runtime", () => {
  const originalBrowser = (globalThis as any).browser

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"))
    captureMock.mockResolvedValue(true)
    preferenceMocks.isEnabled.mockResolvedValue(true)
    stateMocks.getState.mockResolvedValue({})
    stateMocks.getShieldBypassSummaryState.mockResolvedValue({})
    stateMocks.setLastSettingsSnapshotAt.mockResolvedValue(true)
    stateMocks.setLastSiteEcosystemSnapshotAt.mockResolvedValue(true)
    getAllAccountsMock.mockResolvedValue([])
    getPreferencesMock.mockResolvedValue(createDefaultPreferences())
    mockIsDevBuild.mockReturnValue(false)
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
  })

  it("captures valid runtime events and responds success", async () => {
    await expect(
      handleProductAnalyticsMessage(ProductAnalyticsMessageTypes.TrackEvent, {
        eventName: PRODUCT_ANALYTICS_EVENTS.PageViewed,
        properties: {
          page_id: "options_basic_settings",
          entrypoint: "options",
        },
      }),
    ).resolves.toEqual({ success: true })

    expect(captureMock).toHaveBeenCalledWith("page_viewed", {
      page_id: "options_basic_settings",
      entrypoint: "options",
    })
  })

  it("sends one rate-limited aggregate settings snapshot", async () => {
    getPreferencesMock.mockResolvedValue(
      createDefaultPreferences(Date.parse("2026-05-12T00:00:00.000Z")),
    )

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: true })

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledWith(
      "settings_snapshot_captured",
      expect.objectContaining({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        account_auto_refresh_enabled: false,
        webdav_configured: false,
      }),
    )
    expect(stateMocks.setLastSettingsSnapshotAt).toHaveBeenCalledWith(
      Date.parse("2026-05-12T00:00:00.000Z"),
    )
    vi.clearAllMocks()
    preferenceMocks.isEnabled.mockResolvedValue(true)
    stateMocks.getState.mockResolvedValue({
      lastSettingsSnapshotAt: Date.parse("2026-05-12T00:00:00.000Z"),
    })
    stateMocks.setLastSiteEcosystemSnapshotAt.mockResolvedValue(true)
    stateMocks.setLastSettingsSnapshotAt.mockResolvedValue(true)

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
        {
          reason: "manual",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(getPreferencesMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
    expect(stateMocks.setLastSettingsSnapshotAt).not.toHaveBeenCalled()
  })

  it("does not update settings snapshot cadence when aggregate snapshot capture returns false", async () => {
    captureMock.mockResolvedValueOnce(false)

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(stateMocks.setLastSettingsSnapshotAt).not.toHaveBeenCalled()
  })

  it("ignores invalid runtime events", async () => {
    await expect(
      handleProductAnalyticsMessage(ProductAnalyticsMessageTypes.TrackEvent, {
        eventName: "unknown_event",
        properties: {},
      }),
    ).resolves.toEqual({ success: false })

    expect(captureMock).not.toHaveBeenCalled()
  })

  it("ignores unsupported runtime message types", async () => {
    await expect(
      handleProductAnalyticsMessage(
        "unknown" as Parameters<typeof handleProductAnalyticsMessage>[0],
        {},
      ),
    ).resolves.toEqual({ success: false })

    expect(captureMock).not.toHaveBeenCalled()
  })

  it("returns a runtime failure when event capture throws", async () => {
    captureMock.mockRejectedValueOnce(new Error("capture unavailable"))

    await expect(
      handleProductAnalyticsMessage(ProductAnalyticsMessageTypes.TrackEvent, {
        eventName: PRODUCT_ANALYTICS_EVENTS.PageViewed,
        properties: {
          page_id: "options_basic_settings",
          entrypoint: "options",
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: "capture unavailable",
    })

    expect(mockLoggerDebug).not.toHaveBeenCalled()
  })

  it("logs runtime capture failures in custom development build modes", async () => {
    captureMock.mockRejectedValueOnce(new Error("capture unavailable"))
    mockIsDevBuild.mockReturnValue(true)

    await expect(
      handleProductAnalyticsMessage(ProductAnalyticsMessageTypes.TrackEvent, {
        eventName: PRODUCT_ANALYTICS_EVENTS.PageViewed,
        properties: {
          page_id: "options_basic_settings",
          entrypoint: "options",
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: "capture unavailable",
    })

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Product analytics runtime request failed",
      expect.any(Error),
    )
  })

  it("registers typed product analytics listeners once", () => {
    setupProductAnalyticsMessagingListeners()
    setupProductAnalyticsMessagingListeners()

    expect(mockOnProductAnalyticsMessage).toHaveBeenCalledTimes(3)
    expect(mockOnProductAnalyticsMessage).toHaveBeenNthCalledWith(
      1,
      ProductAnalyticsMessageTypes.TrackEvent,
      expect.any(Function),
    )
    expect(mockOnProductAnalyticsMessage).toHaveBeenNthCalledWith(
      2,
      ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
      expect.any(Function),
    )
    expect(mockOnProductAnalyticsMessage).toHaveBeenNthCalledWith(
      3,
      ProductAnalyticsMessageTypes.TrackSettingsSnapshot,
      expect.any(Function),
    )
  })

  it("sends rate-limited site ecosystem snapshots", async () => {
    getAllAccountsMock.mockResolvedValue([
      {
        id: "a1",
        site_url: "https://private.example",
        site_type: SITE_TYPES.NEW_API,
      },
    ])

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: true })

    expect(captureMock).toHaveBeenCalledWith(
      "site_ecosystem_snapshot",
      expect.objectContaining({
        total_account_count: 1,
        distinct_site_count: 1,
      }),
    )
    expect(captureMock).toHaveBeenCalledWith("site_type_present", {
      site_type: SITE_TYPES.NEW_API,
      account_count: 1,
    })
    expect(stateMocks.setLastSiteEcosystemSnapshotAt).toHaveBeenCalledWith(
      Date.parse("2026-05-12T00:00:00.000Z"),
    )
    vi.clearAllMocks()
    preferenceMocks.isEnabled.mockResolvedValue(true)
    stateMocks.getState.mockResolvedValue({
      lastSiteEcosystemSnapshotAt: Date.parse("2026-05-12T00:00:00.000Z"),
    })

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
        {
          reason: "manual",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(getAllAccountsMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
    expect(stateMocks.setLastSiteEcosystemSnapshotAt).not.toHaveBeenCalled()
  })

  it("does not load accounts when analytics is disabled", async () => {
    preferenceMocks.isEnabled.mockResolvedValue(false)

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(getAllAccountsMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("does not update snapshot cadence when the aggregate event capture returns false", async () => {
    getAllAccountsMock.mockResolvedValue([
      {
        id: "a1",
        site_url: "https://private.example",
        site_type: SITE_TYPES.NEW_API,
      },
    ])
    captureMock.mockResolvedValueOnce(false)

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(stateMocks.setLastSiteEcosystemSnapshotAt).not.toHaveBeenCalled()
  })

  it("does not update snapshot cadence when a later per-site event capture returns false", async () => {
    getAllAccountsMock.mockResolvedValue([
      {
        id: "a1",
        site_url: "https://private.example",
        site_type: SITE_TYPES.NEW_API,
      },
      {
        id: "a2",
        site_url: "https://other.example",
        site_type: SITE_TYPES.ONE_API,
      },
    ])
    captureMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)

    await expect(
      handleProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackSiteEcosystemSnapshot,
        {
          reason: "startup",
        },
      ),
    ).resolves.toEqual({ success: false })

    expect(captureMock).toHaveBeenCalledTimes(2)
    expect(stateMocks.setLastSiteEcosystemSnapshotAt).not.toHaveBeenCalled()
  })

  it("logs startup site ecosystem snapshot failures in dev builds", async () => {
    getAllAccountsMock.mockRejectedValueOnce(new Error("accounts unavailable"))
    mockIsDevBuild.mockReturnValue(true)

    const { triggerStartupSiteEcosystemSnapshot } = await import(
      "~/services/productAnalytics/runtime"
    )

    triggerStartupSiteEcosystemSnapshot()
    await vi.runAllTimersAsync()

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Product analytics snapshot failed",
      expect.any(Error),
    )
  })

  it("logs startup settings snapshot failures in dev builds", async () => {
    stateMocks.getState.mockRejectedValueOnce(new Error("state unavailable"))
    mockIsDevBuild.mockReturnValue(true)

    const { triggerStartupSettingsSnapshot } = await import(
      "~/services/productAnalytics/runtime"
    )

    triggerStartupSettingsSnapshot()
    await vi.runAllTimersAsync()

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Product analytics settings snapshot failed",
      expect.any(Error),
    )
  })

  it("logs startup shield bypass summary failures in dev builds", async () => {
    mockIsDevBuild.mockReturnValue(true)
    stateMocks.getShieldBypassSummaryState.mockRejectedValueOnce(
      new Error("shield summary unavailable"),
    )

    const { triggerStartupShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/runtime"
    )

    triggerStartupShieldBypassDailySummary()
    await vi.runAllTimersAsync()

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Product analytics shield bypass summary failed",
      expect.any(Error),
    )
  })

  it("debounces local account storage changes and cleanup removes the listener", async () => {
    const addListener = vi.spyOn(fakeBrowser.storage.onChanged, "addListener")
    const removeListener = vi.spyOn(
      fakeBrowser.storage.onChanged,
      "removeListener",
    )

    const cleanup = setupProductAnalyticsAccountChangeListener()
    const handler = addListener.mock.calls[0][0]

    handler({ site_accounts: {} }, "sync")
    handler({ other_key: {} }, "local")
    await vi.advanceTimersByTimeAsync(2_000)
    expect(captureMock).not.toHaveBeenCalled()

    handler({ site_accounts: {} }, "local")
    handler({ site_accounts: {} }, "local")
    await vi.advanceTimersByTimeAsync(1_999)
    expect(captureMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(captureMock).toHaveBeenCalled()

    handler({ site_accounts: {} }, "local")
    cleanup()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(removeListener).toHaveBeenCalledWith(handler)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it("debounces local preference storage changes and cleanup removes the listener", async () => {
    const addListener = vi.spyOn(fakeBrowser.storage.onChanged, "addListener")
    const removeListener = vi.spyOn(
      fakeBrowser.storage.onChanged,
      "removeListener",
    )

    const cleanup = setupProductAnalyticsPreferencesChangeListener()
    const handler = addListener.mock.calls[0][0]

    handler({ user_preferences: {} }, "sync")
    handler({ other_key: {} }, "local")
    await vi.advanceTimersByTimeAsync(2_000)
    expect(captureMock).not.toHaveBeenCalled()

    handler({ user_preferences: {} }, "local")
    handler({ user_preferences: {} }, "local")
    await vi.advanceTimersByTimeAsync(1_999)
    expect(captureMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(captureMock).toHaveBeenCalledTimes(1)

    handler({ user_preferences: {} }, "local")
    cleanup()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(removeListener).toHaveBeenCalledWith(handler)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it("keeps preference change listener setup idempotent in one runtime context", async () => {
    const addListener = vi.spyOn(fakeBrowser.storage.onChanged, "addListener")
    const removeListener = vi.spyOn(
      fakeBrowser.storage.onChanged,
      "removeListener",
    )

    const firstCleanup = setupProductAnalyticsPreferencesChangeListener()
    const secondCleanup = setupProductAnalyticsPreferencesChangeListener()
    const handler = addListener.mock.calls[0][0]

    expect(addListener).toHaveBeenCalledTimes(1)

    handler({ user_preferences: {} }, "local")
    await vi.advanceTimersByTimeAsync(2_000)
    expect(captureMock).toHaveBeenCalledTimes(1)

    secondCleanup()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith(handler)

    handler({ user_preferences: {} }, "local")
    firstCleanup()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it("keeps account change listener setup idempotent in one runtime context", async () => {
    const addListener = vi.spyOn(fakeBrowser.storage.onChanged, "addListener")
    const removeListener = vi.spyOn(
      fakeBrowser.storage.onChanged,
      "removeListener",
    )

    const firstCleanup = setupProductAnalyticsAccountChangeListener()
    const secondCleanup = setupProductAnalyticsAccountChangeListener()
    const handler = addListener.mock.calls[0][0]

    expect(addListener).toHaveBeenCalledTimes(1)

    handler({ site_accounts: {} }, "local")
    await vi.advanceTimersByTimeAsync(2_000)
    expect(captureMock).toHaveBeenCalledTimes(1)

    secondCleanup()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith(handler)

    handler({ site_accounts: {} }, "local")
    firstCleanup()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})
