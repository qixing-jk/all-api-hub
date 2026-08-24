import { describe, expect, it } from "vitest"

import {
  loadDatePickerLocale,
  resolveDatePickerLocaleKey,
} from "~/components/ui/datePickerLocale"

describe("date picker locale loading", () => {
  it.each([
    ["en", "en-US"],
    ["de-DE", "de"],
    ["es-MX", "es"],
    ["pt-PT", "pt-BR"],
    ["ja-JP", "ja"],
    ["vi_VN", "vi"],
    ["zh-Hans", "zh-CN"],
    ["zh-HK", "zh-TW"],
    ["unsupported", "en-US"],
  ])("maps %s to %s", (language, expected) => {
    expect(resolveDatePickerLocaleKey(language)).toBe(expected)
  })

  it.each([
    ["de", "de"],
    ["es-419", "es"],
    ["ja", "ja"],
    ["pt-BR", "pt-BR"],
    ["vi", "vi"],
    ["zh-CN", "zh-CN"],
    ["zh-TW", "zh-TW"],
  ])("loads only the requested %s locale contract", async (language, code) => {
    await expect(loadDatePickerLocale(language)).resolves.toMatchObject({
      code,
    })
  })

  it("reuses an in-flight locale import", () => {
    expect(loadDatePickerLocale("zh-HK")).toBe(loadDatePickerLocale("zh-TW"))
  })
})
