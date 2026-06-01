import dayjs from "dayjs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  i18nCoreMock,
  getLanguageMock,
  reactI18nextPlugin,
  resolveInitialAppLanguageMock,
  mapToDayjsLocaleMock,
} = vi.hoisted(() => ({
  i18nCoreMock: {
    use: vi.fn(),
    init: vi.fn(),
    changeLanguage: vi.fn(),
    on: vi.fn(),
    resolvedLanguage: "en" as string | undefined,
    language: "en",
  },
  getLanguageMock: vi.fn(),
  reactI18nextPlugin: { type: "3rdParty" },
  resolveInitialAppLanguageMock: vi.fn(),
  mapToDayjsLocaleMock: vi.fn(),
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
  normalizeAppLanguage: (language?: string | null) => {
    const normalized = language?.trim().toLowerCase()
    if (normalized?.startsWith("en")) return "en"
    if (normalized?.startsWith("ja")) return "ja"
    if (normalized?.startsWith("zh-tw")) return "zh-TW"
    if (normalized?.startsWith("zh")) return "zh-CN"
    return undefined
  },
  resolveInitialAppLanguage: resolveInitialAppLanguageMock,
}))

vi.mock("~/utils/i18n/resources", () => ({
  mapToDayjsLocale: mapToDayjsLocaleMock,
  resources: { en: { common: { hello: "Hello" } } },
}))

vi.mock("react-i18next", () => ({
  initReactI18next: reactI18nextPlugin,
}))

describe("content i18n initialization", () => {
  beforeEach(() => {
    vi.resetModules()
    i18nCoreMock.use.mockReset()
    i18nCoreMock.use.mockImplementation(() => i18nCoreMock)
    i18nCoreMock.init.mockReset()
    i18nCoreMock.changeLanguage.mockReset()
    i18nCoreMock.on.mockReset()
    i18nCoreMock.resolvedLanguage = "en"
    i18nCoreMock.language = "en"
    getLanguageMock.mockReset()
    resolveInitialAppLanguageMock.mockReset()
    mapToDayjsLocaleMock.mockReset()
    mapToDayjsLocaleMock.mockImplementation((language: string) =>
      language.toLowerCase(),
    )
  })

  it("initializes without app-page language detection and resolves from extension preferences", async () => {
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("en")
    getLanguageMock.mockResolvedValueOnce("ja")
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    const { ensureContentI18nReady } = await import("~/utils/i18n/content")

    await ensureContentI18nReady()

    expect(i18nCoreMock.use).toHaveBeenCalledTimes(1)
    expect(i18nCoreMock.use).toHaveBeenCalledWith(reactI18nextPlugin)
    expect(i18nCoreMock.init).toHaveBeenCalledWith({
      resources: { en: { common: { hello: "Hello" } } },
      fallbackLng: "zh-CN",
      defaultNS: "common",
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      react: { useSuspense: false },
    })
    expect(resolveInitialAppLanguageMock).toHaveBeenCalledWith({
      userPreferenceLanguage: "ja",
      detectedLanguage:
        typeof navigator !== "undefined" ? navigator.language : undefined,
    })
    expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith("ja")
    expect(localeSpy).toHaveBeenCalledWith("ja")

    localeSpy.mockRestore()
  })

  it("refreshes persisted language on later readiness calls for already-injected content scripts", async () => {
    getLanguageMock.mockResolvedValueOnce("zh-CN").mockResolvedValueOnce("en")
    resolveInitialAppLanguageMock.mockReturnValueOnce("zh-CN")
    i18nCoreMock.changeLanguage.mockImplementation(async (language: string) => {
      i18nCoreMock.resolvedLanguage = language
      i18nCoreMock.language = language
    })

    const { ensureContentI18nReady } = await import("~/utils/i18n/content")

    await ensureContentI18nReady()
    await ensureContentI18nReady()

    expect(getLanguageMock).toHaveBeenCalledTimes(2)
    expect(i18nCoreMock.changeLanguage).toHaveBeenLastCalledWith("en")
  })

  it("retries initialization after a failed attempt", async () => {
    const initError = new Error("init failed")
    i18nCoreMock.init
      .mockRejectedValueOnce(initError)
      .mockResolvedValueOnce(undefined)
    getLanguageMock.mockResolvedValueOnce("ja")
    resolveInitialAppLanguageMock.mockReturnValueOnce("ja")

    const { ensureContentI18nReady } = await import("~/utils/i18n/content")

    await expect(ensureContentI18nReady()).rejects.toThrow(initError)
    await ensureContentI18nReady()

    expect(i18nCoreMock.init).toHaveBeenCalledTimes(2)
    expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith("ja")
  })

  it("keeps dayjs locale aligned with later i18n language changes", async () => {
    const localeSpy = vi.spyOn(dayjs, "locale").mockReturnValue("en")

    await import("~/utils/i18n/content")

    const languageChangedHandler = i18nCoreMock.on.mock.calls.find(
      ([eventName]) => eventName === "languageChanged",
    )?.[1]
    expect(languageChangedHandler).toBeTypeOf("function")

    languageChangedHandler("zh-TW")

    expect(localeSpy).toHaveBeenCalledWith("zh-tw")

    localeSpy.mockRestore()
  })
})
