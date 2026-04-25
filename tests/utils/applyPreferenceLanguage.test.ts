import { beforeEach, describe, expect, it, vi } from "vitest"

import { JAPANESE_LANG } from "~/constants/i18n"
import { applyPreferenceLanguage } from "~/utils/i18n/applyPreferenceLanguage"

const { i18nCoreMock } = vi.hoisted(() => ({
  i18nCoreMock: {
    resolvedLanguage: "en" as string | undefined,
    language: "en",
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/utils/i18n/core", () => ({
  default: i18nCoreMock,
}))

describe("applyPreferenceLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    i18nCoreMock.resolvedLanguage = "en"
    i18nCoreMock.language = "en"
  })

  it("returns false for unsupported or empty persisted languages", async () => {
    await expect(applyPreferenceLanguage("fr-FR")).resolves.toBe(false)
    await expect(applyPreferenceLanguage("   ")).resolves.toBe(false)
    await expect(applyPreferenceLanguage("")).resolves.toBe(false)
    await expect(applyPreferenceLanguage(null)).resolves.toBe(false)
    await expect(applyPreferenceLanguage(undefined)).resolves.toBe(false)

    expect(i18nCoreMock.changeLanguage).not.toHaveBeenCalled()
  })

  it("returns false when the normalized persisted language already matches the runtime language", async () => {
    i18nCoreMock.resolvedLanguage = undefined
    i18nCoreMock.language = "zh-TW"

    await expect(applyPreferenceLanguage("zh-HK")).resolves.toBe(false)

    expect(i18nCoreMock.changeLanguage).not.toHaveBeenCalled()
  })

  it("changes language when the normalized persisted language differs from the runtime language", async () => {
    await expect(applyPreferenceLanguage("ja-JP")).resolves.toBe(true)

    expect(i18nCoreMock.changeLanguage).toHaveBeenCalledWith(JAPANESE_LANG)
  })
})
