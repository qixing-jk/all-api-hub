import { describe, expect, it } from "vitest"

import {
  normalizeAppLanguage,
  resolveInitialAppLanguage,
} from "~/utils/i18n/language"

describe("i18n language helpers", () => {
  it("normalizes browser language variants to supported app locales", () => {
    expect(normalizeAppLanguage("en-US")).toBe("en")
    expect(normalizeAppLanguage("en")).toBe("en")
    expect(normalizeAppLanguage("zh-CN")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh_CN")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh-SG")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh-MY")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh-Hans-SG")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh")).toBe("zh-CN")
    expect(normalizeAppLanguage("zh-TW")).toBe("zh-TW")
    expect(normalizeAppLanguage("zh-HK")).toBe("zh-TW")
    expect(normalizeAppLanguage("zh-MO")).toBe("zh-TW")
    expect(normalizeAppLanguage("zh-Hant-TW")).toBe("zh-TW")
    expect(normalizeAppLanguage("zh-Hant-HK")).toBe("zh-TW")
  })

  it("returns undefined for unsupported languages", () => {
    expect(normalizeAppLanguage("fr-FR")).toBeUndefined()
    expect(normalizeAppLanguage("ja-JP")).toBeUndefined()
    expect(normalizeAppLanguage("english")).toBeUndefined()
    expect(normalizeAppLanguage("zhongwen")).toBeUndefined()
    expect(normalizeAppLanguage("")).toBeUndefined()
    expect(normalizeAppLanguage(undefined)).toBeUndefined()
  })

  it("prefers explicit user language over detected browser language", () => {
    expect(
      resolveInitialAppLanguage({
        userPreferenceLanguage: "zh_CN",
        detectedLanguage: "en-US",
      }),
    ).toBe("zh-CN")
  })

  it("prefers explicit traditional chinese user language over detected simplified chinese", () => {
    expect(
      resolveInitialAppLanguage({
        userPreferenceLanguage: "zh-Hant-HK",
        detectedLanguage: "zh-CN",
      }),
    ).toBe("zh-TW")
  })

  it("keeps detected english when no explicit preference exists", () => {
    expect(
      resolveInitialAppLanguage({
        detectedLanguage: "en-US",
      }),
    ).toBe("en")
  })

  it("falls back to English when detection is unsupported", () => {
    expect(
      resolveInitialAppLanguage({
        detectedLanguage: "fr-FR",
      }),
    ).toBe("en")
  })

  it("falls back to English when no language signal exists", () => {
    expect(resolveInitialAppLanguage({})).toBe("en")
  })
})
