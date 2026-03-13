import { describe, expect, it } from "vitest"

import {
  normalizeAppLanguage,
  resolveInitialAppLanguage,
} from "~/utils/i18n/language"

describe("i18n language helpers", () => {
  it("normalizes browser language variants to supported app locales", () => {
    expect(normalizeAppLanguage("en-US")).toBe("en")
    expect(normalizeAppLanguage("en")).toBe("en")
    expect(normalizeAppLanguage("zh-CN")).toBe("zh_CN")
    expect(normalizeAppLanguage("zh_CN")).toBe("zh_CN")
  })

  it("returns undefined for unsupported languages", () => {
    expect(normalizeAppLanguage("fr-FR")).toBeUndefined()
    expect(normalizeAppLanguage("")).toBeUndefined()
    expect(normalizeAppLanguage(undefined)).toBeUndefined()
  })

  it("prefers explicit user language over detected browser language", () => {
    expect(
      resolveInitialAppLanguage({
        userPreferenceLanguage: "zh_CN",
        detectedLanguage: "en-US",
      }),
    ).toBe("zh_CN")
  })

  it("keeps detected english when no explicit preference exists", () => {
    expect(
      resolveInitialAppLanguage({
        detectedLanguage: "en-US",
      }),
    ).toBe("en")
  })

  it("falls back to the default locale when detection is unsupported", () => {
    expect(
      resolveInitialAppLanguage({
        detectedLanguage: "fr-FR",
      }),
    ).toBe("zh_CN")
  })
})
