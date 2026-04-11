import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"

const {
  createAlarmMock,
  getAlarmMock,
  getManifestMock,
  hasAlarmsApiMock,
  onAlarmMock,
  withExtensionStorageWriteLockMock,
} = vi.hoisted(() => ({
  createAlarmMock: vi.fn(),
  getAlarmMock: vi.fn(),
  getManifestMock: vi.fn(() => ({
    manifest_version: 3,
    version: "3.32.0",
    optional_permissions: [],
  })),
  hasAlarmsApiMock: vi.fn(() => true),
  onAlarmMock: vi.fn(),
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
  getManifest: getManifestMock,
  hasAlarmsAPI: hasAlarmsApiMock,
  onAlarm: onAlarmMock,
}))

describe("releaseUpdateService", () => {
  const originalBrowser = (globalThis as any).browser
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.clear()
    ;(globalThis as any).browser = {
      runtime: {
        id: "test-extension-id",
        getURL: vi.fn(() => "chrome-extension://test-extension-id/"),
      },
      management: {
        getSelf: vi.fn().mockResolvedValue({ installType: "normal" }),
      },
    }

    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
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
    ;(globalThis as any).browser = {
      runtime: {
        id: "{bc73541a-133d-4b50-b261-36ea20df0d24}",
        getURL: vi.fn(() => "moz-extension://firefox-extension/"),
      },
    }

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
})
