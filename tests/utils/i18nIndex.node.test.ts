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
  normalizeAppLanguage: (language?: string | null) => language ?? undefined,
  resolveInitialAppLanguage: resolveInitialAppLanguageMock,
}))

vi.mock("~/utils/i18n/resources", () => ({
  mapToDayjsLocale: mapToDayjsLocaleMock,
  resources: {
    en: { common: { greeting: "Hello" } },
  },
}))

vi.mock("i18next-browser-languagedetector", () => ({
  default: languageDetectorPlugin,
}))

vi.mock("react-i18next", () => ({
  initReactI18next: reactI18nextPlugin,
}))

describe("app i18n initialization without a document", () => {
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
    mapToDayjsLocaleMock.mockImplementation((language: string) => language)

    i18nCoreMock.language = "en"
    i18nCoreMock.resolvedLanguage = "en"
  })

  it("keeps initialization working when no DOM document exists", async () => {
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("ja")
    getLanguageMock.mockResolvedValueOnce(undefined)
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    try {
      await import("~/utils/i18n/index")

      await vi.waitFor(() => {
        expect(getLanguageMock).toHaveBeenCalledTimes(1)
      })

      expect(i18nCoreMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackLng: DEFAULT_LANG,
          detection: {
            lookupLocalStorage: I18NEXT_LANGUAGE_STORAGE_KEY,
          },
        }),
      )
      expect(localeSpy).toHaveBeenCalledWith("ja")
    } finally {
      localeSpy.mockRestore()
    }
  })
})
