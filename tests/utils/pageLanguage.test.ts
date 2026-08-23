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
})
