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

  it("reuses an in-flight locale import", () => {
    expect(loadDayjsLocale("de")).toBe(loadDayjsLocale("de-DE"))
  })
})
