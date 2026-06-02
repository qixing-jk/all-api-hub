import dayjs from "dayjs"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_LANG } from "~/constants"
import { I18NEXT_LANGUAGE_STORAGE_KEY } from "~/services/core/storageKeys"

const {
  getLanguageMock,
  i18nCoreMock,
  languageDetectorPlugin,
  mapToDayjsLocaleMock,
  reactI18nextPlugin,
  resolveInitialAppLanguageMock,
} = vi.hoisted(() => ({
  getLanguageMock: vi.fn(),
  i18nCoreMock: {
    use: vi.fn(),
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn(),
    language: "en",
    resolvedLanguage: "en" as string | undefined,
  },
  languageDetectorPlugin: { type: "languageDetector" },
  mapToDayjsLocaleMock: vi.fn(),
  reactI18nextPlugin: { type: "3rdParty" },
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
  mapToDayjsLocale: mapToDayjsLocaleMock,
  resources: {
    en: { common: { greeting: "Hello" } },
    ja: { common: { greeting: "こんにちは" } },
  },
}))

vi.mock("i18next-browser-languagedetector", () => ({
  default: languageDetectorPlugin,
}))

vi.mock("react-i18next", () => ({
  initReactI18next: reactI18nextPlugin,
}))

describe("app i18n initialization", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()

    i18nCoreMock.use.mockReset()
    i18nCoreMock.use.mockImplementation(() => i18nCoreMock)
    i18nCoreMock.init.mockReset()
    i18nCoreMock.init.mockResolvedValue(undefined)
    i18nCoreMock.changeLanguage.mockReset()
    i18nCoreMock.changeLanguage.mockResolvedValue(undefined)
    i18nCoreMock.on.mockReset()

    getLanguageMock.mockReset()
    resolveInitialAppLanguageMock.mockReset()
    mapToDayjsLocaleMock.mockReset()
    mapToDayjsLocaleMock.mockImplementation((language: string) =>
      language.toLowerCase().replace("_", "-"),
    )

    i18nCoreMock.language = "en"
    i18nCoreMock.resolvedLanguage = "en"
  })

  it("registers plugins, initializes i18n, changes language when preferences win, and syncs dayjs", async () => {
    vi.stubEnv("MODE", "development")
    vi.stubEnv("DEV", true)

    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("en")
    getLanguageMock.mockResolvedValueOnce("ja")
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    try {
      await import("~/utils/i18n/index")

      await vi.waitFor(() => {
        expect(getLanguageMock).toHaveBeenCalledTimes(1)
      })

      expect(i18nCoreMock.use).toHaveBeenNthCalledWith(
        1,
        languageDetectorPlugin,
      )
      expect(i18nCoreMock.use).toHaveBeenNthCalledWith(2, reactI18nextPlugin)
      expect(i18nCoreMock.init).toHaveBeenCalledWith({
        debug: true,
        fallbackLng: DEFAULT_LANG,
        defaultNS: "common",
        detection: {
          lookupLocalStorage: I18NEXT_LANGUAGE_STORAGE_KEY,
        },
        resources: {
          en: { common: { greeting: "Hello" } },
          ja: { common: { greeting: "こんにちは" } },
        },
        interpolation: {
          escapeValue: false,
        },
        missingInterpolationHandler: expect.any(Function),
        react: {
          useSuspense: false,
        },
      })
      const initConfig = i18nCoreMock.init.mock.calls[0]?.[0] as
        | { missingInterpolationHandler?: () => string }
        | undefined
      expect(initConfig?.missingInterpolationHandler?.()).toBe("")
      expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
        userPreferenceLanguage: "ja",
        detectedLanguage: "en",
      })
      expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith("ja")
      expect(localeSpy).toHaveBeenCalledWith("ja")

      const languageChangedHandler = i18nCoreMock.on.mock.calls.find(
        ([eventName]) => eventName === "languageChanged",
      )?.[1] as ((language: string) => void) | undefined

      expect(languageChangedHandler).toBeTypeOf("function")
      languageChangedHandler?.("zh_TW")

      expect(localeSpy).toHaveBeenLastCalledWith("zh-tw")
    } finally {
      localeSpy.mockRestore()
    }
  })

  it("enables i18n debug output in custom development build modes", async () => {
    vi.stubEnv("MODE", "local")
    vi.stubEnv("DEV", true)
    getLanguageMock.mockResolvedValueOnce(undefined)
    resolveInitialAppLanguageMock.mockReturnValueOnce("en")

    await import("~/utils/i18n/index")

    await vi.waitFor(() => {
      expect(i18nCoreMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          debug: true,
        }),
      )
    })
  })

  it("keeps the current resolved language without calling changeLanguage again", async () => {
    vi.stubEnv("DEV", false)
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("ja")
    i18nCoreMock.resolvedLanguage = "ja"
    i18nCoreMock.language = "en"
    getLanguageMock.mockResolvedValueOnce(undefined)
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    try {
      await import("~/utils/i18n/index")

      await vi.waitFor(() => {
        expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
          userPreferenceLanguage: undefined,
          detectedLanguage: "ja",
        })
      })

      expect(i18nCoreMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          debug: false,
        }),
      )
      expect(i18nCoreMock.changeLanguage).not.toHaveBeenCalled()
      expect(localeSpy).toHaveBeenCalledWith("ja")
    } finally {
      localeSpy.mockRestore()
    }
  })

  it("falls back to i18n.language when resolvedLanguage is missing and skips a redundant change", async () => {
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("zh-tw")
    i18nCoreMock.resolvedLanguage = undefined
    i18nCoreMock.language = "zh-TW"
    getLanguageMock.mockResolvedValueOnce("zh-TW")
    resolveInitialAppLanguageMock.mockReturnValueOnce("zh-TW")

    try {
      await import("~/utils/i18n/index")

      await vi.waitFor(() => {
        expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
          userPreferenceLanguage: "zh-TW",
          detectedLanguage: "zh-TW",
        })
      })

      expect(i18nCoreMock.changeLanguage).not.toHaveBeenCalled()
      expect(localeSpy).toHaveBeenCalledWith("zh-tw")
    } finally {
      localeSpy.mockRestore()
    }
  })
})
