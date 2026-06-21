import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { STORAGE_KEYS } from "~/services/core/storageKeys"

const {
  createAlarmMock,
  getAlarmMock,
  getExtensionVersionMock,
  getExtensionUrlMock,
  getManagementSelfMock,
  getManifestMock,
  getRuntimeIdMock,
  hasAlarmsApiMock,
  onAlarmMock,
  requestRuntimeUpdateCheckMock,
  withExtensionStorageWriteLockMock,
} = vi.hoisted(() => ({
  createAlarmMock: vi.fn(),
  getAlarmMock: vi.fn(),
  getExtensionVersionMock: vi.fn(() => "3.32.0"),
  getExtensionUrlMock: vi.fn((path: string) =>
    (globalThis as any).browser.runtime.getURL(path),
  ),
  getManagementSelfMock: vi.fn(async () => {
    const getSelf = (globalThis as any).browser?.management?.getSelf
    return typeof getSelf === "function" ? await getSelf() : null
  }),
  getManifestMock: vi.fn(() => ({
    manifest_version: 3,
    version: "3.32.0",
    optional_permissions: [],
  })),
  getRuntimeIdMock: vi.fn(() => (globalThis as any).browser?.runtime?.id),
  hasAlarmsApiMock: vi.fn(() => true),
  onAlarmMock: vi.fn(),
  requestRuntimeUpdateCheckMock: vi.fn(),
  withExtensionStorageWriteLockMock: vi.fn(
    async (_key: string, work: () => Promise<unknown>) => await work(),
  ),
}))

vi.mock("@plasmohq/storage", () => {
  const store = new Map<string, unknown>()
  const set = vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  })
  const get = vi.fn(async (key: string) => store.get(key))

  function Storage(this: any) {
    this.set = set
    this.get = get
  }

  ;(Storage as any).__store = store
  ;(Storage as any).__mocks = { set, get }

  return { Storage, __esModule: true }
})

vi.mock("~/services/core/storageWriteLock", () => ({
  withExtensionStorageWriteLock: withExtensionStorageWriteLockMock,
}))

vi.mock("~/utils/browser/browserApi", () => ({
  createAlarm: createAlarmMock,
  getAlarm: getAlarmMock,
  getExtensionVersion: getExtensionVersionMock,
  getExtensionURL: getExtensionUrlMock,
  getManagementSelf: getManagementSelfMock,
  getManifest: getManifestMock,
  getRuntimeId: getRuntimeIdMock,
  hasAlarmsAPI: hasAlarmsApiMock,
  onAlarm: onAlarmMock,
  requestRuntimeUpdateCheck: requestRuntimeUpdateCheckMock,
}))

describe("releaseUpdateService", () => {
  const originalFetch = globalThis.fetch
  const browserAny = fakeBrowser as any

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.clear()
    browserAny.runtime.id = "test-extension-id"
    browserAny.runtime.getURL = vi.fn(
      () => "chrome-extension://test-extension-id/",
    )
    browserAny.management.getSelf = vi
      .fn()
      .mockResolvedValue({ installType: "normal" })

    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("marks Chromium development installs as eligible and stores latest stable status", async () => {
    ;(globalThis as any).browser.management.getSelf.mockResolvedValueOnce({
      installType: "development",
    })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: "v3.40.0",
        html_url:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      }),
    } as Response)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status).toMatchObject({
      eligible: true,
      reason: "chromium-development",
      currentVersion: "3.32.0",
      latestVersion: "3.40.0",
      updateAvailable: true,
      releaseUrl:
        "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      lastError: null,
    })
    expect(status.checkedAt).toEqual(expect.any(Number))

    const { Storage } = await import("@plasmohq/storage")
    expect(
      (Storage as any).__store.get(STORAGE_KEYS.RELEASE_UPDATE_STATUS),
    ).toEqual(
      expect.objectContaining({
        eligible: true,
        latestVersion: "3.40.0",
      }),
    )
  })

  it("classifies Firefox installs as ambiguous when install type cannot disambiguate origin", async () => {
    browserAny.runtime.id = "{bc73541a-133d-4b50-b261-36ea20df0d24}"
    browserAny.runtime.getURL = vi.fn(
      () => "moz-extension://firefox-extension/",
    )
    browserAny.management.getSelf = undefined

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      eligible: false,
      reason: "firefox-ambiguous",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("classifies Chromium installs as API-unavailable when management self lookup fails", async () => {
    ;(globalThis as any).browser.management.getSelf.mockRejectedValueOnce(
      new Error("management unavailable"),
    )

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      eligible: false,
      reason: "api-unavailable",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("classifies Chromium installs as API-unavailable when management self returns no info", async () => {
    ;(globalThis as any).browser.management.getSelf.mockResolvedValueOnce(null)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      eligible: false,
      reason: "api-unavailable",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("keeps Firefox installs ambiguous even when management self reports development", async () => {
    browserAny.runtime.id = "{bc73541a-133d-4b50-b261-36ea20df0d24}"
    browserAny.runtime.getURL = vi.fn(
      () => "moz-extension://firefox-extension/",
    )
    ;(globalThis as any).browser.management.getSelf.mockResolvedValueOnce({
      installType: "development",
    })

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      eligible: false,
      reason: "firefox-ambiguous",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("classifies known Chromium store builds as browser-store check eligible", async () => {
    browserAny.runtime.id = "lapnciffpekdengooeolaienkeoilfeo"

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      eligible: true,
      reason: "store-build",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
      storeUpdate: {
        supported: true,
        status: "not_checked",
        version: null,
      },
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("checks GitHub and the browser store for known Chromium store builds", async () => {
    browserAny.runtime.id = "lapnciffpekdengooeolaienkeoilfeo"
    requestRuntimeUpdateCheckMock.mockResolvedValueOnce({
      status: "update_available",
      version: "3.40.0",
    })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: "v3.40.0",
        html_url:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      }),
    } as Response)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status).toMatchObject({
      eligible: true,
      reason: "store-build",
      currentVersion: "3.32.0",
      latestVersion: "3.40.0",
      updateAvailable: true,
      storeUpdate: {
        supported: true,
        status: "update_available",
        version: "3.40.0",
      },
    })
    expect(requestRuntimeUpdateCheckMock).toHaveBeenCalledTimes(1)
  })

  it("falls back when the browser store update API is unavailable", async () => {
    browserAny.runtime.id = "lapnciffpekdengooeolaienkeoilfeo"
    requestRuntimeUpdateCheckMock.mockResolvedValueOnce(null)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: "v3.40.0",
        html_url:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      }),
    } as Response)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status.storeUpdate).toEqual({
      supported: false,
      status: "unsupported",
      version: null,
    })
  })

  it("records browser store update check failures without failing release checks", async () => {
    browserAny.runtime.id = "lapnciffpekdengooeolaienkeoilfeo"
    requestRuntimeUpdateCheckMock.mockRejectedValueOnce(
      new Error("store check failed"),
    )
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: "v3.40.0",
        html_url:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      }),
    } as Response)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status).toMatchObject({
      latestVersion: "3.40.0",
      lastError: null,
      storeUpdate: {
        supported: true,
        status: "failed",
        version: null,
      },
    })
  })

  it("reuses same-version store update metadata from storage", async () => {
    browserAny.runtime.id = "lapnciffpekdengooeolaienkeoilfeo"
    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.set(STORAGE_KEYS.RELEASE_UPDATE_STATUS, {
      eligible: true,
      reason: "store-build",
      currentVersion: "3.32.0",
      latestVersion: "3.40.0",
      updateAvailable: true,
      releaseUrl:
        "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      checkedAt: 123,
      lastError: null,
      storeUpdate: {
        supported: true,
        status: "no_update",
        version: "3.32.0",
      },
    })

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.getStatus()

    expect(status).toMatchObject({
      latestVersion: "3.40.0",
      updateAvailable: true,
      storeUpdate: {
        supported: true,
        status: "no_update",
        version: "3.32.0",
      },
    })
  })

  it("registers the daily alarm once and preserves an existing matching schedule", async () => {
    getAlarmMock.mockResolvedValueOnce({
      name: "releaseUpdateDailyCheck",
      periodInMinutes: 24 * 60,
    })

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    await releaseUpdateService.initialize()
    await releaseUpdateService.initialize()

    expect(onAlarmMock).toHaveBeenCalledTimes(1)
    expect(getAlarmMock).toHaveBeenCalledWith("releaseUpdateDailyCheck")
    expect(createAlarmMock).not.toHaveBeenCalled()
  })

  it("memoizes concurrent initialization so alarm handlers are only registered once", async () => {
    let resolveAlarm: (() => void) | undefined

    getAlarmMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAlarm = () => resolve(null)
        }),
    )

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const first = releaseUpdateService.initialize()
    const second = releaseUpdateService.initialize()

    await vi.waitFor(() => {
      expect(resolveAlarm).toEqual(expect.any(Function))
    })

    if (resolveAlarm) {
      resolveAlarm()
    }
    await Promise.all([first, second])

    expect(getAlarmMock).toHaveBeenCalledTimes(1)
    expect(onAlarmMock).toHaveBeenCalledTimes(1)
    expect(createAlarmMock).toHaveBeenCalledTimes(1)
  })

  it("registers the alarm listener only once when initialization retries after a setup failure", async () => {
    createAlarmMock
      .mockRejectedValueOnce(new Error("alarm setup failed"))
      .mockResolvedValueOnce(undefined)

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    await expect(releaseUpdateService.initialize()).rejects.toThrow(
      "alarm setup failed",
    )
    expect(onAlarmMock).not.toHaveBeenCalled()

    await releaseUpdateService.initialize()

    expect(onAlarmMock).toHaveBeenCalledTimes(1)
  })

  it("returns the base status without fetching and clears stale release metadata when the install is ineligible", async () => {
    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.set(STORAGE_KEYS.RELEASE_UPDATE_STATUS, {
      eligible: true,
      reason: "chromium-development",
      currentVersion: "3.32.0",
      latestVersion: "3.40.0",
      updateAvailable: true,
      releaseUrl:
        "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.40.0",
      checkedAt: 123,
      lastError: "old error",
    })

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status).toMatchObject({
      eligible: false,
      reason: "unknown",
      currentVersion: "3.32.0",
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
      checkedAt: null,
      lastError: null,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()

    expect(
      (Storage as any).__store.get(STORAGE_KEYS.RELEASE_UPDATE_STATUS),
    ).toEqual(
      expect.objectContaining({
        eligible: false,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
        checkedAt: null,
        lastError: null,
      }),
    )
  })

  it("stores release fetch failures for eligible installs", async () => {
    ;(globalThis as any).browser.management.getSelf.mockResolvedValueOnce({
      installType: "development",
    })
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(
      new Error("release lookup failed"),
    )

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    const status = await releaseUpdateService.checkNow()

    expect(status).toMatchObject({
      eligible: true,
      latestVersion: null,
      updateAvailable: false,
      lastError: "release lookup failed",
    })
    expect(status.checkedAt).toEqual(expect.any(Number))
  })
})
