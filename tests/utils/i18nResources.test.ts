import type { i18n } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

const EN_RESOURCES = {
  common: { actions: { cancel: "Cancel" } },
  ui: { title: "UI" },
}
const ZH_CN_RESOURCES = {
  common: { actions: { cancel: "取消" } },
  ui: { title: "界面" },
}

function createJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe("i18n resources", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal("browser", {
      runtime: {
        getURL: vi.fn((path: string) => `extension://${path}`),
      },
    })
  })

  it("loads only the requested language and the configured fallback asset", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/en.json")) return createJsonResponse(EN_RESOURCES)
      if (url.endsWith("/zh-CN.json")) {
        return createJsonResponse(ZH_CN_RESOURCES)
      }
      return createJsonResponse({}, false)
    })
    vi.stubGlobal("fetch", fetchMock)

    const { loadAppLanguageResources } = await import("~/utils/i18n/resources")

    await expect(loadAppLanguageResources("en")).resolves.toEqual({
      en: EN_RESOURCES,
      "zh-CN": ZH_CN_RESOURCES,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith("extension://app-locales/en.json")
    expect(fetchMock).toHaveBeenCalledWith("extension://app-locales/zh-CN.json")
  })

  it("deduplicates locale fetches and retries after a failed request", async () => {
    let englishAttempts = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/en.json") && englishAttempts++ === 0) {
        return createJsonResponse({}, false)
      }
      return createJsonResponse(EN_RESOURCES)
    })
    vi.stubGlobal("fetch", fetchMock)

    const { loadAppLanguageResources } = await import("~/utils/i18n/resources")

    await expect(loadAppLanguageResources("en")).rejects.toThrow(
      "Failed to load locale asset",
    )
    await expect(loadAppLanguageResources("en")).resolves.toEqual({
      en: EN_RESOURCES,
      "zh-CN": EN_RESOURCES,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("installs every loaded namespace before changing language", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createJsonResponse(EN_RESOURCES)),
    )
    const addResourceBundle = vi.fn()
    const changeLanguage = vi.fn().mockResolvedValue(undefined)
    const instance = { addResourceBundle, changeLanguage } as unknown as i18n
    const { changeAppLanguage } = await import("~/utils/i18n/resources")

    await changeAppLanguage(instance, "en")

    expect(addResourceBundle).toHaveBeenCalledWith(
      "en",
      "common",
      EN_RESOURCES.common,
      true,
      true,
    )
    expect(addResourceBundle).toHaveBeenCalledWith(
      "en",
      "ui",
      EN_RESOURCES.ui,
      true,
      true,
    )
    expect(changeLanguage).toHaveBeenCalledWith("en")
    expect(addResourceBundle.mock.invocationCallOrder.at(-1)).toBeLessThan(
      changeLanguage.mock.invocationCallOrder[0]!,
    )
  })
})
