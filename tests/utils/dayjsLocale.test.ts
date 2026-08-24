import { describe, expect, it } from "vitest"

import { loadDayjsLocale, resolveDayjsLocale } from "~/utils/i18n/dayjsLocale"

describe("dayjs locale loading", () => {
  it.each([
    ["en", "en"],
    ["en-US", "en"],
    ["de-DE", "de"],
    ["es-MX", "es"],
    ["pt-PT", "pt-br"],
    ["ja-JP", "ja"],
    ["vi_VN", "vi"],
    ["zh-Hans", "zh-cn"],
    ["zh-HK", "zh-tw"],
    ["unsupported", "en"],
  ])("maps %s to %s", (language, expected) => {
    expect(resolveDayjsLocale(language)).toBe(expected)
  })

  it.each([
    ["de", "de"],
    ["es-419", "es"],
    ["ja", "ja"],
    ["pt-BR", "pt-br"],
    ["vi", "vi"],
    ["zh-CN", "zh-cn"],
    ["zh-TW", "zh-tw"],
  ])("loads the %s locale module", async (language, expected) => {
    await expect(loadDayjsLocale(language)).resolves.toBe(expected)
  })

  it("reuses an in-flight locale import", async () => {
    const firstLoad = loadDayjsLocale("de")

    expect(firstLoad).toBe(loadDayjsLocale("de-DE"))
    await expect(firstLoad).resolves.toBe("de")
  })
})
