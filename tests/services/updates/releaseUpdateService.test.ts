import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { DISTRIBUTION_CHANNEL } from "~/utils/core/distributionChannel"

vi.mock("~/utils/browser/runtimeUpdateCheck", () => ({
  requestRuntimeUpdateCheck: requestRuntimeUpdateCheckMock,
}))

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
  getManifestMock: vi.fn<() => Record<string, unknown>>(() => ({
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

vi.mock("~/utils/browser/alarms", () => ({
  createAlarm: createAlarmMock,
  getAlarm: getAlarmMock,
  hasAlarmsAPI: hasAlarmsApiMock,
  onAlarm: onAlarmMock,
}))
vi.mock("~/utils/browser/runtime", () => ({
  getExtensionVersion: getExtensionVersionMock,
  getExtensionURL: getExtensionUrlMock,
  getManagementSelf: getManagementSelfMock,
  getManifest: getManifestMock,
  getRuntimeId: getRuntimeIdMock,
}))

describe("releaseUpdateService", () => {
  const originalFetch = globalThis.fetch
  const browserAny = fakeBrowser as any

  beforeEach(async () => {
    vi.stubGlobal("__AAH_DISTRIBUTION_CHANNEL__", DISTRIBUTION_CHANNEL.Unknown)
    vi.resetModules()
    vi.clearAllMocks()
    // A plain packaged ZIP has no update_url; tests that need one override it.
    getManifestMock.mockReturnValue({
      manifest_version: 3,
      version: "3.32.0",
      optional_permissions: [],
    })

    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.clear()
    browserAny.runtime.id = "test-extension-id"
    browserAny.runtime.getURL = vi.fn(
      () => "chrome-extension://test-extension-id/",
    )
    browserAny.management.getSelf = vi
      .fn()
      .mockResolvedValue({ installType: "normal" })

    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it("checks AMO for a marked Firefox store build without claiming an update is installed", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.FirefoxAmo,
    )
    browserAny.runtime.getURL = vi.fn(
      () => "moz-extension://firefox-extension/",
    )
    browserAny.management.getSelf = undefined
    vi.mocked(globalThis.fetch).mockImplementation(
      async (url) =>
        ({
          ok: true,
          json: async () =>
            String(url).includes("addons.mozilla.org")
              ? { current_version: { version: "3.40.0" } }
              : { tag_name: "v3.41.0" },
        }) as Response,
    )
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    const status = await releaseUpdateService.checkNow()
    expect(status).toMatchObject({
      eligible: true,
      reason: "firefox-amo",
      latestVersion: "3.40.0",
      updateAvailable: true,
      storeUpdate: { status: "unsupported" },
    })
    expect(status.releaseUrl).toContain("addons.mozilla.org")
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("addons.mozilla.org/api/v5/addons/addon/"),
      expect.anything(),
    )
    expect(requestRuntimeUpdateCheckMock).not.toHaveBeenCalled()
  })

  it.each([
    [DISTRIBUTION_CHANNEL.ChromeWebStore, "store-build"],
    [DISTRIBUTION_CHANNEL.EdgeAddons, "store-build"],
    [DISTRIBUTION_CHANNEL.GithubRelease, "github-release"],
    [DISTRIBUTION_CHANNEL.LocalDevelopment, "chromium-development"],
  ])(
    "uses the %s marker independently of runtime ID or management metadata",
    async (channel, reason) => {
      vi.stubGlobal("__AAH_DISTRIBUTION_CHANNEL__", channel)
      browserAny.management.getSelf = undefined
      const { releaseUpdateService } = await import(
        "~/services/updates/releaseUpdateService"
      )
      expect(await releaseUpdateService.getStatus()).toMatchObject({
        eligible: true,
        distributionChannel: channel,
        reason,
      })
      expect(globalThis.fetch).not.toHaveBeenCalled()
    },
  )

  it("keeps GitHub ahead informational, retries AMO failures and runs scheduled AMO checks", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.FirefoxAmo,
    )
    let fail = true
    vi.mocked(globalThis.fetch).mockImplementation(async (url) => {
      if (String(url).includes("addons.mozilla.org") && fail)
        throw new Error("AMO unavailable")
      return {
        ok: true,
        json: async () =>
          String(url).includes("addons.mozilla.org")
            ? { current_version: { version: "3.32.0" } }
            : { tag_name: "v3.40.0" },
      } as Response
    })
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    expect(await releaseUpdateService.checkNow()).toMatchObject({
      lastError: "AMO unavailable",
      updateAvailable: false,
      githubLatestVersion: "3.40.0",
    })
    fail = false
    expect(await releaseUpdateService.checkNow()).toMatchObject({
      lastError: null,
      latestVersion: "3.32.0",
      updateAvailable: false,
      githubLatestVersion: "3.40.0",
    })
    await releaseUpdateService.initialize()
    vi.mocked(globalThis.fetch).mockClear()
    await onAlarmMock.mock.calls[0]?.[0]({ name: "releaseUpdateDailyCheck" })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("addons.mozilla.org"),
      expect.anything(),
    )
  })

  it("compares nightly revisions even when the package version has not changed", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.GithubNightly,
    )
    vi.stubGlobal("__AAH_BUILD_REVISION__", "a".repeat(40))
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: { type: "commit", sha: "b".repeat(40) } }),
    } as Response)
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    expect(await releaseUpdateService.checkNow()).toMatchObject({
      reason: "github-nightly",
      latestVersion: "bbbbbbb",
      updateAvailable: true,
      releaseUrl:
        "https://github.com/qixing-jk/all-api-hub/releases/tag/nightly",
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/git/ref/tags/nightly"),
      expect.anything(),
    )
  })

  it.each([undefined, "A".repeat(40), "a".repeat(39)])(
    "reports an unavailable Nightly revision instead of offering an update: %s",
    async (revision) => {
      vi.stubGlobal(
        "__AAH_DISTRIBUTION_CHANNEL__",
        DISTRIBUTION_CHANNEL.GithubNightly,
      )
      vi.stubGlobal("__AAH_BUILD_REVISION__", revision)
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ object: { type: "commit", sha: "b".repeat(40) } }),
      } as Response)
      const { releaseUpdateService } = await import(
        "~/services/updates/releaseUpdateService"
      )
      expect(await releaseUpdateService.checkNow()).toMatchObject({
        buildRevision: null,
        latestVersion: null,
        updateAvailable: false,
        lastError: "Nightly revision unavailable",
      })
    },
  )

  it("keeps AMO results actionable when the informational GitHub lookup fails", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.FirefoxAmo,
    )
    vi.mocked(globalThis.fetch).mockImplementation(async (url) => {
      if (String(url).includes("api.github.com"))
        throw new Error("GitHub unavailable")
      return {
        ok: true,
        json: async () => ({ current_version: { version: "3.40.0" } }),
      } as Response
    })
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    expect(await releaseUpdateService.checkNow()).toMatchObject({
      latestVersion: "3.40.0",
      updateAvailable: true,
      githubLatestVersion: null,
      lastError: null,
    })
  })

  it.each([
    {
      ok: false,
      status: 503,
      payload: null,
      error: "Nightly request failed with HTTP 503",
    },
    {
      ok: true,
      status: 200,
      payload: { object: { type: "tag", sha: "b".repeat(40) } },
      error: "Nightly revision unavailable",
    },
    {
      ok: true,
      status: 200,
      payload: { object: { type: "commit", sha: 123 } },
      error: "Nightly revision unavailable",
    },
    {
      ok: true,
      status: 200,
      payload: null,
      error: "Nightly revision unavailable",
    },
  ])(
    "does not offer an update from an unusable Nightly response: $error",
    async ({ ok, status, payload, error }) => {
      vi.stubGlobal(
        "__AAH_DISTRIBUTION_CHANNEL__",
        DISTRIBUTION_CHANNEL.GithubNightly,
      )
      vi.stubGlobal("__AAH_BUILD_REVISION__", "a".repeat(40))
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok,
        status,
        json: async () => payload,
      } as Response)
      const { releaseUpdateService } = await import(
        "~/services/updates/releaseUpdateService"
      )
      expect(await releaseUpdateService.checkNow()).toMatchObject({
        latestVersion: null,
        updateAvailable: false,
        lastError: error,
      })
    },
  )

  it.each([
    ["a", true],
    ["c", false],
  ])(
    "reuses Nightly cache only for the same build revision: %s",
    async (revision, reuse) => {
      vi.stubGlobal(
        "__AAH_DISTRIBUTION_CHANNEL__",
        DISTRIBUTION_CHANNEL.GithubNightly,
      )
      vi.stubGlobal("__AAH_BUILD_REVISION__", "a".repeat(40))
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ object: { type: "commit", sha: "b".repeat(40) } }),
      } as Response)
      const { releaseUpdateService } = await import(
        "~/services/updates/releaseUpdateService"
      )
      const checked = await releaseUpdateService.checkNow()

      vi.stubGlobal("__AAH_BUILD_REVISION__", revision.repeat(40))
      expect(await releaseUpdateService.getStatus()).toMatchObject({
        currentVersion: checked.currentVersion,
        buildRevision: revision.repeat(40),
        latestVersion: reuse ? "bbbbbbb" : null,
        updateAvailable: reuse,
        checkedAt: reuse ? checked.checkedAt : null,
      })
      expect(globalThis.fetch).toHaveBeenCalledOnce()
    },
  )

  it("reuses legacy unknown-channel cache without triggering a network request", async () => {
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    const checkedAt = Date.now()
    const { Storage } = await import("@plasmohq/storage")
    ;(Storage as any).__store.set(STORAGE_KEYS.RELEASE_UPDATE_STATUS, {
      ...(await releaseUpdateService.getStatus()),
      distributionChannel: undefined,
      latestVersion: "3.40.0",
      updateAvailable: true,
      checkedAt,
    })
    expect(await releaseUpdateService.getStatus()).toMatchObject({
      latestVersion: "3.40.0",
      updateAvailable: true,
      checkedAt,
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("allows manual checks on unknown builds while keeping automatic checks disabled", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v3.40.0" }),
    } as Response)
    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )
    expect(await releaseUpdateService.checkNow()).toMatchObject({
      eligible: false,
      reason: "unknown",
      latestVersion: "3.40.0",
      updateAvailable: true,
    })
    expect(await releaseUpdateService.getStatus()).toMatchObject({
      latestVersion: "3.40.0",
    })
    await releaseUpdateService.initialize()
    vi.mocked(globalThis.fetch).mockClear()
    await onAlarmMock.mock.calls[0]?.[0]({ name: "releaseUpdateDailyCheck" })
    expect(globalThis.fetch).not.toHaveBeenCalled()
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

    const status = await releaseUpdateService.getStatus()

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

  it("reports self-update only when the packaged manifest advertises update_url", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.GithubRelease,
    )
    getManifestMock.mockReturnValue({
      manifest_version: 3,
      version: "3.32.0",
      optional_permissions: [],
      update_url:
        "https://github.com/qixing-jk/all-api-hub/releases/latest/download/updates.xml",
    })

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    expect(await releaseUpdateService.getStatus()).toMatchObject({
      reason: "github-release",
      selfUpdate: true,
    })
  })

  it("keeps a plain GitHub ZIP install on manual updates", async () => {
    vi.stubGlobal(
      "__AAH_DISTRIBUTION_CHANNEL__",
      DISTRIBUTION_CHANNEL.GithubRelease,
    )

    const { releaseUpdateService } = await import(
      "~/services/updates/releaseUpdateService"
    )

    expect(await releaseUpdateService.getStatus()).toMatchObject({
      reason: "github-release",
      selfUpdate: false,
    })
  })
})
