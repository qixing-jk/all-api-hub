import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { productAnalyticsPreferences } from "~/services/productAnalytics/preferences"
import { uninstallSurveyService } from "~/services/uninstallSurvey/uninstallSurvey"
import { setUninstallUrl } from "~/utils/browser/browserApi"
import { isDevBuild, isTestMode } from "~/utils/core/environment"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const SURVEY_PAGE_URL = "https://all-api-hub.qixing1217.top/uninstall.html"
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * In-memory storage double so the read/write failure paths are controllable.
 */
const storageDouble = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  writes: [] as string[],
  failReads: false,
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      if (storageDouble.failReads) throw new Error("storage unavailable")
      return storageDouble.data.get(key)
    }

    async set(key: string, value: unknown) {
      storageDouble.writes.push(key)
      storageDouble.data.set(key, value)
    }

    async remove(key: string) {
      storageDouble.data.delete(key)
    }
  },
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getExtensionVersion: vi.fn(() => "1.2.3"),
  setUninstallUrl: vi.fn(async () => true),
}))

vi.mock("~/services/productAnalytics/preferences", () => ({
  productAnalyticsPreferences: {
    getAnonymousIdIfEnabled: vi.fn(async () => "analytics-abc"),
  },
}))

vi.mock("~/utils/core/environment", () => ({
  isDevBuild: vi.fn(() => false),
  isTestMode: vi.fn(() => false),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const i18nMock = vi.hoisted(() => ({
  resolvedLanguage: "zh-CN" as string | undefined,
  language: "zh-CN" as string | undefined,
}))

vi.mock("~/utils/i18n/core", () => ({
  default: i18nMock,
}))

const mockedSetUninstallUrl = vi.mocked(setUninstallUrl)
const mockedIsDevBuild = vi.mocked(isDevBuild)
const mockedIsTestMode = vi.mocked(isTestMode)
const mockedGetAnonymousId = vi.mocked(
  productAnalyticsPreferences.getAnonymousIdIfEnabled,
)

describe("uninstallSurveyService", () => {
  const now = new Date("2026-05-12T00:00:00.000Z")
  const stateKey = STORAGE_KEYS.UNINSTALL_SURVEY_STATE

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.clearAllMocks()
    storageDouble.data.clear()
    storageDouble.writes.length = 0
    storageDouble.failReads = false
    mockedIsDevBuild.mockReturnValue(false)
    mockedIsTestMode.mockReturnValue(false)
    mockedSetUninstallUrl.mockResolvedValue(true)
    mockedGetAnonymousId.mockResolvedValue("analytics-abc")
    i18nMock.resolvedLanguage = "zh-CN"
    i18nMock.language = "zh-CN"
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  /**
   * Parses the URL handed to the browser API in the most recent registration.
   */
  function readRegisteredUrl(): URL {
    expect(mockedSetUninstallUrl).toHaveBeenCalledTimes(1)
    return new URL(atIndex(mockedSetUninstallUrl.mock.calls, 0)[0])
  }

  it("registers the survey page with anonymous id and context", async () => {
    await expect(uninstallSurveyService.refresh()).resolves.toBe(true)

    const url = readRegisteredUrl()
    expect(`${url.origin}${url.pathname}`).toBe(SURVEY_PAGE_URL)
    expect(url.searchParams.get("uid")).toBe("analytics-abc")
    expect(url.searchParams.get("v")).toBe("1.2.3")
    expect(url.searchParams.get("lang")).toBe("zh-CN")
    expect(url.searchParams.get("d")).toBe("0")
  })

  it("omits the anonymous id while product analytics is disabled", async () => {
    mockedGetAnonymousId.mockResolvedValue(null)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(true)

    const url = readRegisteredUrl()
    expect(url.searchParams.has("uid")).toBe(false)
    expect(url.searchParams.get("lang")).toBe("zh-CN")
  })

  it("reports the install age from the persisted first-seen timestamp", async () => {
    await uninstallSurveyService.refresh()
    vi.setSystemTime(new Date(now.getTime() + 3 * DAY_MS))
    mockedSetUninstallUrl.mockClear()

    await expect(uninstallSurveyService.refresh()).resolves.toBe(true)

    expect(readRegisteredUrl().searchParams.get("d")).toBe("3")
    expect(storageDouble.data.get(stateKey)).toEqual({
      firstSeenAt: now.getTime(),
    })
    expect(storageDouble.writes).toEqual([stateKey])
  })

  it("falls back to the bare survey page when the URL exceeds the browser limit", async () => {
    mockedGetAnonymousId.mockResolvedValue(`analytics-${"a".repeat(300)}`)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(true)

    expect(mockedSetUninstallUrl).toHaveBeenCalledWith(SURVEY_PAGE_URL)
  })

  it("skips registration in dev builds", async () => {
    mockedIsDevBuild.mockReturnValue(true)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(false)

    expect(mockedSetUninstallUrl).not.toHaveBeenCalled()
    expect(storageDouble.data.has(stateKey)).toBe(false)
  })

  it("skips registration in test builds without touching storage", async () => {
    mockedIsTestMode.mockReturnValue(true)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(false)

    expect(mockedSetUninstallUrl).not.toHaveBeenCalled()
    expect(storageDouble.writes).toEqual([])
  })

  it("registers a local survey page in dev builds when the override is set", async () => {
    vi.stubEnv("VITE_PUBLIC_UNINSTALL_SURVEY_DEV", "1")
    vi.stubEnv(
      "VITE_PUBLIC_UNINSTALL_SURVEY_URL",
      "http://localhost:8080/uninstall.html",
    )
    mockedIsDevBuild.mockReturnValue(true)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(true)

    const url = readRegisteredUrl()
    expect(url.origin).toBe("http://localhost:8080")
    expect(url.pathname).toBe("/uninstall.html")
    expect(url.searchParams.get("uid")).toBe("analytics-abc")
  })

  it("reports failure when the browser has no uninstall URL API", async () => {
    mockedSetUninstallUrl.mockResolvedValue(false)

    await expect(uninstallSurveyService.refresh()).resolves.toBe(false)
  })

  it("keeps the stored first-seen timestamp when the read fails", async () => {
    const stored = { firstSeenAt: now.getTime() - DAY_MS }
    storageDouble.data.set(stateKey, stored)
    storageDouble.failReads = true

    await expect(uninstallSurveyService.refresh()).resolves.toBe(false)

    expect(mockedSetUninstallUrl).not.toHaveBeenCalled()
    expect(storageDouble.writes).toEqual([])
    expect(storageDouble.data.get(stateKey)).toEqual(stored)
  })

  it("composeUrl previews parameters without registering or persisting", async () => {
    const url = await uninstallSurveyService.composeUrl()

    expect(url).toContain(`${SURVEY_PAGE_URL}?`)
    expect(url).toContain("uid=analytics-abc")
    expect(mockedSetUninstallUrl).not.toHaveBeenCalled()
    expect(storageDouble.writes).toEqual([])
  })

  it("composeUrl previews an unreadable store as a recently installed extension", async () => {
    storageDouble.failReads = true

    const url = await uninstallSurveyService.composeUrl()

    expect(url).toContain(`${SURVEY_PAGE_URL}?`)
    expect(url).toContain("d=0")
    expect(url).toContain("lang=zh-CN")
  })

  it("registerNow bypasses the dev-build skip for the dev panel", async () => {
    mockedIsDevBuild.mockReturnValue(true)

    const url = await uninstallSurveyService.registerNow()

    expect(url).toContain(`${SURVEY_PAGE_URL}?`)
    expect(mockedSetUninstallUrl).toHaveBeenCalledTimes(1)
    expect(storageDouble.data.get(stateKey)).toEqual({
      firstSeenAt: now.getTime(),
    })
  })

  it("registerNow reports unavailable when the browser lacks the API", async () => {
    mockedSetUninstallUrl.mockResolvedValue(false)

    await expect(uninstallSurveyService.registerNow()).resolves.toBeNull()
  })

  it("clear empties the registered uninstall URL", async () => {
    await expect(uninstallSurveyService.clear()).resolves.toBe(true)

    expect(mockedSetUninstallUrl).toHaveBeenCalledWith("")
  })

  it("composes and registers against an explicit base URL override", async () => {
    const localUrl = "http://localhost:8080/uninstall.html"

    await expect(
      uninstallSurveyService.composeUrl({ baseUrl: localUrl }),
    ).resolves.toContain(`${localUrl}?`)

    await expect(
      uninstallSurveyService.registerNow({ baseUrl: localUrl }),
    ).resolves.toContain(`${localUrl}?`)
    expect(atIndex(mockedSetUninstallUrl.mock.calls, 0)[0]).toContain(
      `${localUrl}?`,
    )
  })

  it("resolves UI language using i18n.language when resolvedLanguage is absent", async () => {
    i18nMock.resolvedLanguage = undefined
    i18nMock.language = "en-US"

    const url = await uninstallSurveyService.composeUrl()
    expect(url).toContain("lang=en-US")
  })

  it("resolves UI language using fallback when i18n has no language", async () => {
    i18nMock.resolvedLanguage = undefined
    i18nMock.language = undefined

    const url = await uninstallSurveyService.composeUrl()
    expect(url).toMatch(/lang=(?:[a-zA-Z-]+|unknown)/)
  })

  it("resolves UI language using 'unknown' when neither i18n nor navigator has a language", async () => {
    i18nMock.resolvedLanguage = undefined
    i18nMock.language = undefined
    const navSpy = vi.spyOn(navigator, "language", "get").mockReturnValue("")

    try {
      const url = await uninstallSurveyService.composeUrl()
      expect(url).toContain("lang=unknown")
    } finally {
      navSpy.mockRestore()
    }
  })

  it("normalizes malformed stored state with non-finite firstSeenAt", async () => {
    storageDouble.data.set(stateKey, { firstSeenAt: "not-a-number" })

    const url = await uninstallSurveyService.composeUrl()
    expect(url).toContain("d=0")
  })

  it("catches and logs when buildSurveyUrl throws inside composeUrl", async () => {
    mockedGetAnonymousId.mockRejectedValueOnce(
      new Error("analytics read failed"),
    )

    const result = await uninstallSurveyService.composeUrl()
    expect(result).toBeNull()
  })

  it("catches and logs when buildSurveyUrl throws inside registerNow", async () => {
    mockedGetAnonymousId.mockRejectedValueOnce(
      new Error("analytics read failed"),
    )

    const result = await uninstallSurveyService.registerNow()
    expect(result).toBeNull()
  })
})
