import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { PRODUCT_ANNOUNCEMENT_REFRESH_ALARM } from "~/services/productAnnouncements/constants"
import { productAnnouncementService } from "~/services/productAnnouncements/service"
import { productAnnouncementStorage } from "~/services/productAnnouncements/storage"

const fetchMock = vi.fn()
const storage = new Storage({ area: "local" })
const browserApiMocks = vi.hoisted(() => ({
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  getManifest: vi.fn(),
  onAlarm: vi.fn(),
}))

vi.mock("~~/public/product-announcements.json", () => ({
  default: {
    schemaVersion: 1,
    defaultLocale: "zh-CN",
    announcements: [
      {
        id: "bundled-notice",
        revision: 1,
        severity: "warning",
        priority: 1,
        affectedVersions: ">=3.0.0",
        startsAt: "2026-01-01T00:00:00Z",
        expiresAt: "2027-01-01T00:00:00Z",
        content: {
          "zh-CN": {
            title: "Bundled notice",
            message: "Bundled fallback notice",
          },
        },
      },
    ],
    _examples: {
      devAnnouncements: [
        {
          id: "dev-critical-announcement",
          revision: 1,
          severity: "critical",
          priority: 100,
          affectedVersions: "*",
          startsAt: "2026-01-01T00:00:00Z",
          expiresAt: "2027-01-01T00:00:00Z",
          content: {
            "zh-CN": {
              title: "[DEV] Critical risk",
              message: "Development critical announcement",
            },
          },
        },
      ],
    },
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    createAlarm: browserApiMocks.createAlarm,
    getAlarm: browserApiMocks.getAlarm,
    getManifest: browserApiMocks.getManifest,
    onAlarm: browserApiMocks.onAlarm,
  }
})

function resetServiceState() {
  ;(productAnnouncementService as any).isInitialized = false
  ;(productAnnouncementService as any).refreshPromise = null
}

describe("product announcement service", () => {
  beforeEach(async () => {
    resetServiceState()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }),
    })
    browserApiMocks.getAlarm.mockResolvedValue({
      name: PRODUCT_ANNOUNCEMENT_REFRESH_ALARM,
    })
    browserApiMocks.getManifest.mockReturnValue({
      manifest_version: 3,
      name: "All API Hub",
      version: "3.44.0",
    })
    browserApiMocks.onAlarm.mockReturnValue(() => {})
    await productAnnouncementStorage.setState({
      schemaVersion: 1,
      dismissed: {},
      seenAt: {},
      lastShownAt: {},
    })
  })

  it("returns cached state immediately when refresh fails", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = Date.parse("2026-06-05T00:00:00Z")
      state.cachedFeed = {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }
    })
    fetchMock.mockRejectedValue(new Error("network failed"))

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      cachedFeed: {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      },
    })
  })

  it("marks visible notice ids as seen without dismissing them", async () => {
    await productAnnouncementService.markSeen(["notice-a"], 123)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      seenAt: { "notice-a": 123 },
      dismissed: {},
    })
  })

  it("trims notice ids before marking them as seen", async () => {
    await productAnnouncementService.markSeen([" notice-a ", "   "], 123)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      seenAt: { "notice-a": 123 },
      dismissed: {},
    })
  })

  it("ignores empty seen id batches", async () => {
    await productAnnouncementService.markSeen([" notice-a "], 123)
    await productAnnouncementService.markSeen(["   "], 456)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      seenAt: { "notice-a": 123 },
    })
  })

  it("dismisses a notice revision", async () => {
    await productAnnouncementService.dismiss(" notice-a ", 2)

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: { "notice-a": 2 },
    })
  })

  it("restores a dismissed notice revision", async () => {
    await productAnnouncementService.dismiss(" notice-a ", 2)

    await productAnnouncementService.restore(" notice-a ")

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: {},
    })
    await expect(
      storage.get(STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE),
    ).resolves.toMatchObject({
      dismissed: {},
    })
  })

  it("ignores whitespace-only restore ids", async () => {
    await productAnnouncementService.dismiss(" notice-a ", 2)

    await productAnnouncementService.restore("   ")

    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      dismissed: { "notice-a": 2 },
    })
  })

  it("restores dismissed bundled development announcements into the active risk view", async () => {
    vi.stubEnv("MODE", "development")

    await productAnnouncementService.dismiss("dev-critical-announcement", 1)
    const dismissedState = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })
    expect(
      dismissedState.view.dismissedNotices.map((notice) => notice.id),
    ).toContain("dev-critical-announcement")

    await productAnnouncementService.restore("dev-critical-announcement")

    const restoredState = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })
    expect(
      restoredState.view.activeNotices.map((notice) => notice.id),
    ).toContain("dev-critical-announcement")
    expect(restoredState.view.primaryRiskNotice?.id).toBe(
      "dev-critical-announcement",
    )
  })

  it("ignores whitespace-only dismiss ids", async () => {
    await productAnnouncementService.dismiss("   ", 2)

    const state = await productAnnouncementStorage.getState()
    expect(state.dismissed).toEqual({})
  })

  it("treats unsupported HTTP 200 remote feeds as refresh failures", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 999,
        defaultLocale: "zh-CN",
        announcements: [],
      }),
    })

    await expect(
      productAnnouncementService.refreshRemoteFeed(123),
    ).resolves.toBe(false)

    const state = await productAnnouncementStorage.getState()
    expect(state.lastFetchedAt).toBeUndefined()
    expect(state.cachedFeed).toBeUndefined()
  })

  it("treats non-success remote responses as refresh failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("body should not be read")
      },
    })

    await expect(
      productAnnouncementService.refreshRemoteFeed(123),
    ).resolves.toBe(false)

    const state = await productAnnouncementStorage.getState()
    expect(state.lastFetchedAt).toBeUndefined()
    expect(state.cachedFeed).toBeUndefined()
  })

  it("treats malformed HTTP 200 remote feeds as refresh failures", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: "not-an-array",
      }),
    })

    await expect(
      productAnnouncementService.refreshRemoteFeed(123),
    ).resolves.toBe(false)

    const state = await productAnnouncementStorage.getState()
    expect(state.lastFetchedAt).toBeUndefined()
    expect(state.cachedFeed).toBeUndefined()
  })

  it("times out a stuck remote refresh and clears the single-flight promise", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"))
        })
      })
    })

    try {
      const refresh = productAnnouncementService.refreshRemoteFeed(123)

      await vi.advanceTimersByTimeAsync(15_000)

      await expect(refresh).resolves.toBe(false)
      expect((productAnnouncementService as any).refreshPromise).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to bundled notices when persisted cached feed is malformed", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: 999,
        defaultLocale: "zh-CN",
        announcements: [],
      }
    })

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices).toMatchObject([{ id: "bundled-notice" }])
    expect(state.lastFetchedAt).toBe(100)
  })

  it("falls back to bundled notices when persisted cached feed has malformed shape", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: "not-an-array",
      }
    })

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices).toMatchObject([{ id: "bundled-notice" }])
    expect(state.lastFetchedAt).toBe(100)
  })

  it("injects bundled development examples only in development mode", async () => {
    vi.stubEnv("MODE", "development")

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices.map((notice) => notice.id)).toEqual([
      "dev-critical-announcement",
      "bundled-notice",
    ])
    expect(state.view.primaryRiskNotice?.id).toBe("dev-critical-announcement")
  })

  it("merges bundled development examples with cached remote notices in development mode", async () => {
    vi.stubEnv("MODE", "development")
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [
          {
            id: "cached-info",
            revision: 1,
            severity: "info",
            priority: 1,
            affectedVersions: "*",
            startsAt: "2026-01-01T00:00:00Z",
            expiresAt: "2027-01-01T00:00:00Z",
            content: {
              "zh-CN": {
                title: "Cached info",
                message: "Cached remote notice",
              },
            },
          },
        ],
      }
    })

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices.map((notice) => notice.id)).toEqual([
      "dev-critical-announcement",
      "cached-info",
    ])
    await expect(productAnnouncementStorage.getState()).resolves.toMatchObject({
      cachedFeed: {
        announcements: [expect.objectContaining({ id: "cached-info" })],
      },
    })
  })

  it("does not inject bundled development examples outside development mode", async () => {
    vi.stubEnv("MODE", "production")

    const state = await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(state.view.notices.map((notice) => notice.id)).toEqual([
      "bundled-notice",
    ])
  })

  it("starts a non-blocking refresh when cache is missing", async () => {
    await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("starts a non-blocking refresh when cache is missing even with a fresh timestamp", async () => {
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = Date.parse("2026-06-06T00:00:00Z") - 1000
    })

    await productAnnouncementService.getCurrentState({
      locale: "zh-CN",
      currentVersion: "3.44.0",
      now: Date.parse("2026-06-06T00:00:00Z"),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("starts a single non-blocking refresh for concurrent stale reads", async () => {
    let resolveFetch!: (value: unknown) => void
    const fetchDeferred = new Promise((resolve) => {
      resolveFetch = resolve
    })
    fetchMock.mockReturnValue(fetchDeferred)
    await productAnnouncementStorage.updateState((state) => {
      state.lastFetchedAt = 100
      state.cachedFeed = {
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }
    })

    await Promise.all([
      productAnnouncementService.getCurrentState({
        locale: "zh-CN",
        currentVersion: "3.44.0",
        now: Date.parse("2026-06-06T00:00:00Z"),
      }),
      productAnnouncementService.getCurrentState({
        locale: "zh-CN",
        currentVersion: "3.44.0",
        now: Date.parse("2026-06-06T00:00:00Z"),
      }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        defaultLocale: "zh-CN",
        announcements: [],
      }),
    })
    await vi.waitFor(() => {
      expect((productAnnouncementService as any).refreshPromise).toBeNull()
    })
  })

  it("initializes once and triggers the initial refresh path", async () => {
    const service = new (
      productAnnouncementService as any
    ).constructor() as typeof productAnnouncementService

    await service.initialize()
    await service.initialize()

    expect(browserApiMocks.onAlarm).toHaveBeenCalledTimes(1)
    expect(browserApiMocks.getAlarm).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("ignores unrelated alarms and creates the refresh alarm when missing", async () => {
    browserApiMocks.getAlarm.mockResolvedValue(null)

    await productAnnouncementService.initialize()

    const alarmHandler = browserApiMocks.onAlarm.mock.calls[0]?.[0]
    await alarmHandler({ name: "other-alarm" })

    expect(browserApiMocks.createAlarm).toHaveBeenCalledWith(
      PRODUCT_ANNOUNCEMENT_REFRESH_ALARM,
      {
        delayInMinutes: 720,
        periodInMinutes: 720,
      },
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refreshes the remote feed when the product announcement alarm fires", async () => {
    await productAnnouncementService.initialize()
    await vi.waitFor(() => {
      expect((productAnnouncementService as any).refreshPromise).toBeNull()
    })

    const alarmHandler = browserApiMocks.onAlarm.mock.calls[0]?.[0]
    await alarmHandler({ name: PRODUCT_ANNOUNCEMENT_REFRESH_ALARM })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
