import dayjs from "dayjs"
import type { i18n, Resource } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  installAppLanguageResourcesMock,
  loadAppLanguageResourcesMock,
  loadDayjsLocaleMock,
} = vi.hoisted(() => ({
  installAppLanguageResourcesMock: vi.fn(),
  loadAppLanguageResourcesMock: vi.fn(),
  loadDayjsLocaleMock: vi.fn(),
}))

vi.mock("~/utils/i18n/resources", () => ({
  installAppLanguageResources: installAppLanguageResourcesMock,
  loadAppLanguageResources: loadAppLanguageResourcesMock,
}))

vi.mock("~/utils/i18n/dayjsLocale", () => ({
  loadDayjsLocale: loadDayjsLocaleMock,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe("page language switching", () => {
  beforeEach(() => {
    vi.resetModules()
    installAppLanguageResourcesMock.mockReset()
    loadAppLanguageResourcesMock.mockReset()
    loadDayjsLocaleMock.mockReset()
  })

  it("installs translations and the matching dayjs locale before resolving", async () => {
    const resources = { ja: { common: { greeting: "こんにちは" } } }
    loadAppLanguageResourcesMock.mockResolvedValue(resources)
    loadDayjsLocaleMock.mockResolvedValue("ja")
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("ja")
    const instance = { changeLanguage: vi.fn().mockResolvedValue(undefined) }

    const { changePageLanguage } = await import("~/utils/i18n/pageLanguage")

    await expect(
      changePageLanguage(instance as unknown as i18n, "ja"),
    ).resolves.toBe(true)
    expect(installAppLanguageResourcesMock).toHaveBeenCalledWith(
      instance,
      resources,
    )
    expect(instance.changeLanguage).toHaveBeenCalledWith("ja")
    expect(localeSpy).toHaveBeenCalledWith("ja")

    localeSpy.mockRestore()
  })

  it("lets the latest request win when locale loads finish out of order", async () => {
    const japaneseResources = deferred<Resource>()
    loadAppLanguageResourcesMock.mockImplementation((language: string) =>
      language === "ja"
        ? japaneseResources.promise
        : Promise.resolve({ de: { common: { greeting: "Hallo" } } }),
    )
    loadDayjsLocaleMock.mockImplementation((language: string) =>
      Promise.resolve(language),
    )
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("de")
    const instance = { changeLanguage: vi.fn().mockResolvedValue(undefined) }
    const { changePageLanguage } = await import("~/utils/i18n/pageLanguage")

    const japaneseRequest = changePageLanguage(
      instance as unknown as i18n,
      "ja",
    )
    const germanRequest = changePageLanguage(instance as unknown as i18n, "de")

    await expect(germanRequest).resolves.toBe(true)
    japaneseResources.resolve({
      ja: { common: { greeting: "こんにちは" } },
    })
    await expect(japaneseRequest).resolves.toBe(false)

    expect(instance.changeLanguage).toHaveBeenCalledTimes(1)
    expect(instance.changeLanguage).toHaveBeenCalledWith("de")
    expect(localeSpy).toHaveBeenCalledWith("de")
    expect(localeSpy).not.toHaveBeenCalledWith("ja")

    localeSpy.mockRestore()
  })

  it("keeps the latest language when change commits overlap", async () => {
    const japaneseCommit = deferred<void>()
    loadAppLanguageResourcesMock.mockImplementation((language: string) =>
      Promise.resolve({ [language]: { common: {} } }),
    )
    loadDayjsLocaleMock.mockImplementation((language: string) =>
      Promise.resolve(language),
    )
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("de")
    let activeLanguage = "en"
    const instance = {
      language: "en",
      changeLanguage: vi.fn(async (language: string) => {
        if (language === "ja") await japaneseCommit.promise
        activeLanguage = language
        instance.language = language
      }),
    }
    const { changePageLanguage } = await import("~/utils/i18n/pageLanguage")

    const japaneseRequest = changePageLanguage(
      instance as unknown as i18n,
      "ja",
    )
    await vi.waitFor(() => {
      expect(instance.changeLanguage).toHaveBeenCalledWith("ja")
    })

    const germanRequest = changePageLanguage(instance as unknown as i18n, "de")
    await vi.waitFor(() => {
      expect(loadAppLanguageResourcesMock).toHaveBeenCalledWith("de")
    })
    japaneseCommit.resolve()

    await expect(japaneseRequest).resolves.toBe(false)
    await expect(germanRequest).resolves.toBe(true)
    expect(activeLanguage).toBe("de")

    localeSpy.mockRestore()
  })

  it("restores the prior locales when a newer request fails during an older commit", async () => {
    const japaneseCommit = deferred<void>()
    loadAppLanguageResourcesMock.mockImplementation((language: string) => {
      if (language === "de") {
        return Promise.reject(new Error("German locale unavailable"))
      }
      return Promise.resolve({ ja: { common: {} } })
    })
    loadDayjsLocaleMock.mockImplementation((language: string) =>
      Promise.resolve(language),
    )
    let activeDayjsLocale = "en"
    const localeSpy = vi
      .spyOn(dayjs, "locale")
      .mockImplementation((locale?: Parameters<typeof dayjs.locale>[0]) => {
        if (typeof locale === "string") activeDayjsLocale = locale
        return activeDayjsLocale
      })
    let activeLanguage = "en"
    const instance = {
      language: "en",
      changeLanguage: vi.fn(async (language: string) => {
        if (language === "ja") await japaneseCommit.promise
        activeLanguage = language
        instance.language = language
      }),
    }
    const { changePageLanguage } = await import("~/utils/i18n/pageLanguage")

    const japaneseRequest = changePageLanguage(
      instance as unknown as i18n,
      "ja",
    )
    await vi.waitFor(() => {
      expect(instance.changeLanguage).toHaveBeenCalledWith("ja")
    })
    const germanRequest = changePageLanguage(instance as unknown as i18n, "de")

    await expect(germanRequest).rejects.toThrow("German locale unavailable")
    japaneseCommit.resolve()
    await expect(japaneseRequest).resolves.toBe(false)

    expect(instance.changeLanguage).toHaveBeenNthCalledWith(1, "ja")
    expect(instance.changeLanguage).toHaveBeenNthCalledWith(2, "en")
    expect(activeLanguage).toBe("en")
    expect(activeDayjsLocale).toBe("en")

    localeSpy.mockRestore()
  })

  it("restores the prior Day.js locale when i18next rejects a change", async () => {
    loadAppLanguageResourcesMock.mockResolvedValue({ ja: { common: {} } })
    loadDayjsLocaleMock.mockResolvedValue("ja")
    let activeDayjsLocale = "en"
    const localeSpy = vi
      .spyOn(dayjs, "locale")
      .mockImplementation((locale?: Parameters<typeof dayjs.locale>[0]) => {
        if (typeof locale === "string") activeDayjsLocale = locale
        return activeDayjsLocale
      })
    const instance = {
      language: "en",
      changeLanguage: vi.fn().mockRejectedValue(new Error("change failed")),
    }
    const { changePageLanguage } = await import("~/utils/i18n/pageLanguage")

    await expect(
      changePageLanguage(instance as unknown as i18n, "ja"),
    ).rejects.toThrow("change failed")
    expect(activeDayjsLocale).toBe("en")

    localeSpy.mockRestore()
  })
})
