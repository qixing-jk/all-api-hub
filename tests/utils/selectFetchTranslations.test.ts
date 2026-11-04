import fs from "node:fs/promises"
import path from "node:path"
import { createInstance } from "i18next"
import { describe, expect, it } from "vitest"

describe("model selector fetch feedback translations", () => {
  it.each([
    { language: "ja", count: 2, expected: "2 個のモデルを取得しました。" },
    { language: "vi", count: 2, expected: "Đã lấy 2 mô hình." },
    { language: "zh-TW", count: 2, expected: "已取得 2 個模型。" },
    {
      language: "es-419",
      count: 1_000_000,
      expected: "Se obtuvieron 1000000 modelos.",
    },
    {
      language: "pt-BR",
      count: 1_000_000,
      expected: "1000000 modelos obtidos.",
    },
  ])(
    "shows a localized model count in $language ($count)",
    async ({ language, count, expected }) => {
      const ui = JSON.parse(
        await fs.readFile(
          path.join(process.cwd(), "src/locales", language, "ui.json"),
          "utf8",
        ),
      )
      const instance = createInstance()
      await instance.init({
        lng: language,
        fallbackLng: false,
        resources: { [language]: { ui } },
        interpolation: { escapeValue: false },
      })
      expect(instance.t("ui:searchableSelect.fetchSuccess", { count })).toBe(
        expected,
      )
    },
  )
})
