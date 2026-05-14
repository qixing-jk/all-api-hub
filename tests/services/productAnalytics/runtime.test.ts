import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  handleProductAnalyticsMessage,
  PRODUCT_ANALYTICS_EVENTS,
  setupProductAnalyticsAccountChangeListener,
} from "~/services/productAnalytics"

const { captureMock, getAllAccountsMock, preferenceMocks } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  getAllAccountsMock: vi.fn(),
  preferenceMocks: {
    getState: vi.fn(),
    isEnabled: vi.fn(),
    setLastSiteEcosystemSnapshotAt: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/client", () => ({
  productAnalyticsClient: {
    capture: captureMock,
  },
}))

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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: getAllAccountsMock,
  },
  ACCOUNT_STORAGE_KEYS: {
    ACCOUNTS: "site_accounts",
  },
}))

describe("product analytics runtime", () => {
  const originalBrowser = (globalThis as any).browser

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"))
    captureMock.mockResolvedValue(true)
    preferenceMocks.isEnabled.mockResolvedValue(true)
    preferenceMocks.getState.mockResolvedValue({})
    preferenceMocks.setLastSiteEcosystemSnapshotAt.mockResolvedValue(true)
    getAllAccountsMock.mockResolvedValue([])
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
  })

  it("captures valid runtime events and responds success", async () => {
    const sendResponse = vi.fn()

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackEvent,
        eventName: PRODUCT_ANALYTICS_EVENTS.PageViewed,
        properties: {
          page_id: "options_basic_settings",
          entrypoint: "options",
        },
      },
      sendResponse,
    )

    expect(captureMock).toHaveBeenCalledWith("page_viewed", {
      page_id: "options_basic_settings",
      entrypoint: "options",
    })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("ignores invalid runtime events", async () => {
    const sendResponse = vi.fn()

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackEvent,
        eventName: "unknown_event",
        properties: {},
      },
      sendResponse,
    )

    expect(captureMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false })
  })

  it("sends rate-limited site ecosystem snapshots", async () => {
    const sendResponse = vi.fn()
    getAllAccountsMock.mockResolvedValue([
      {
        id: "a1",
        site_url: "https://private.example",
        site_type: SITE_TYPES.NEW_API,
      },
    ])

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot,
        reason: "startup",
      },
      sendResponse,
    )

    expect(captureMock).toHaveBeenCalledWith(
      "site_ecosystem_snapshot",
      expect.objectContaining({
        total_account_count_bucket: "1",
        distinct_site_count_bucket: "1",
      }),
    )
    expect(captureMock).toHaveBeenCalledWith("site_type_present", {
      site_type: SITE_TYPES.NEW_API,
      account_count_bucket: "1",
    })
    expect(preferenceMocks.setLastSiteEcosystemSnapshotAt).toHaveBeenCalledWith(
      Date.parse("2026-05-12T00:00:00.000Z"),
    )
    expect(sendResponse).toHaveBeenCalledWith({ success: true })

    vi.clearAllMocks()
    preferenceMocks.isEnabled.mockResolvedValue(true)
    preferenceMocks.getState.mockResolvedValue({
      lastSiteEcosystemSnapshotAt: Date.parse("2026-05-12T00:00:00.000Z"),
    })

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot,
        reason: "manual",
      },
      sendResponse,
    )

    expect(getAllAccountsMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
    expect(
      preferenceMocks.setLastSiteEcosystemSnapshotAt,
    ).not.toHaveBeenCalled()
  })

  it("does not load accounts when analytics is disabled", async () => {
    const sendResponse = vi.fn()
    preferenceMocks.isEnabled.mockResolvedValue(false)

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot,
        reason: "startup",
      },
      sendResponse,
    )

    expect(getAllAccountsMock).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false })
  })

  it("does not update snapshot cadence when the aggregate event capture returns false", async () => {
    const sendResponse = vi.fn()
    getAllAccountsMock.mockResolvedValue([
      {
        id: "a1",
        site_url: "https://private.example",
        site_type: SITE_TYPES.NEW_API,
      },
    ])
    captureMock.mockResolvedValueOnce(false)

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot,
        reason: "startup",
      },
      sendResponse,
    )

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(
      preferenceMocks.setLastSiteEcosystemSnapshotAt,
    ).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false })
  })

  it("does not update snapshot cadence when a later per-site event capture returns false", async () => {
    const sendResponse = vi.fn()
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

    await handleProductAnalyticsMessage(
      {
        action: RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot,
        reason: "startup",
      },
      sendResponse,
    )

    expect(captureMock).toHaveBeenCalledTimes(2)
    expect(
      preferenceMocks.setLastSiteEcosystemSnapshotAt,
    ).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false })
  })

  it("debounces local account storage changes and cleanup removes the listener", async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    ;(globalThis as any).browser = {
      storage: {
        onChanged: {
          addListener,
          removeListener,
        },
      },
    }

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

  it("keeps account change listener setup idempotent in one runtime context", async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    ;(globalThis as any).browser = {
      storage: {
        onChanged: {
          addListener,
          removeListener,
        },
      },
    }

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
