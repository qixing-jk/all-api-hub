import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  i18nCoreMock,
  getLanguageMock,
  loadAppLanguageResourcesMock,
  resolveInitialAppLanguageMock,
} = vi.hoisted(() => ({
  i18nCoreMock: {
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn(),
  },
  getLanguageMock: vi.fn(),
  loadAppLanguageResourcesMock: vi.fn(),
  resolveInitialAppLanguageMock: vi.fn(),
}))

vi.mock("~/utils/i18n/core", () => ({
  default: i18nCoreMock,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getLanguage: getLanguageMock,
  },
}))

vi.mock("~/utils/i18n/language", () => ({
  resolveInitialAppLanguage: resolveInitialAppLanguageMock,
}))

vi.mock("~/utils/i18n/resources", () => ({
  loadAppLanguageResources: loadAppLanguageResourcesMock,
}))

describe("initBackgroundI18n", () => {
  beforeEach(() => {
    i18nCoreMock.init.mockReset()
    i18nCoreMock.changeLanguage.mockReset()
    i18nCoreMock.on.mockReset()
    getLanguageMock.mockReset()
    loadAppLanguageResourcesMock.mockReset()
    loadAppLanguageResourcesMock.mockResolvedValue({
      en: { common: { hello: "Hello" } },
    })
    resolveInitialAppLanguageMock.mockReset()
    vi.resetModules()
  })

  it("initializes i18n and resolves the initial language", async () => {
    getLanguageMock.mockResolvedValueOnce("ja")
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    const { initBackgroundI18n } = await import("~/utils/i18n/background")

    await initBackgroundI18n()

    expect(i18nCoreMock.init).toHaveBeenCalledWith({
      resources: { en: { common: { hello: "Hello" } } },
      fallbackLng: "zh-CN",
      defaultNS: "common",
      interpolation: { escapeValue: false },
      returnEmptyString: false,
    })
    expect(loadAppLanguageResourcesMock).toHaveBeenCalledWith("ja")
    expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
      userPreferenceLanguage: "ja",
      detectedLanguage:
        typeof navigator !== "undefined" ? navigator.language : undefined,
    })
    expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith("ja")
  })

  it("resolves the initial language without navigator when the background runtime has no browser language", async () => {
    const originalNavigator = globalThis.navigator
    getLanguageMock.mockResolvedValueOnce(undefined)
    resolveInitialAppLanguageMock.mockReturnValueOnce("en")

    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      const { initBackgroundI18n } = await import("~/utils/i18n/background")

      await initBackgroundI18n()

      expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
        userPreferenceLanguage: undefined,
        detectedLanguage: undefined,
      })
      expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith("en")
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      })
    }
  })
})
