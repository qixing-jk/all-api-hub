import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

describe("financial labels in supported locale resources", () => {
  it.each(["de", "en", "es-419", "ja", "pt-BR", "vi", "zh-CN", "zh-TW"])(
    "renders translated financial labels and duplicate counts in %s",
    async (locale) => {
      const resource = (name: string) =>
        JSON.parse(
          readFileSync(
            join(process.cwd(), "src/locales", locale, `${name}.json`),
            "utf8",
          ),
        )
      const i18n = await createResourceTestI18n(
        {
          [locale]: {
            account: resource("account"),
            shareSnapshots: resource("shareSnapshots"),
          },
        },
        locale,
      )
      for (const key of [
        "account:financial.availableTotal",
        "shareSnapshots:financial.complete",
        "shareSnapshots:financial.partial",
      ]) {
        expect(i18n.exists(key)).toBe(true)
        expect(i18n.t(key)).not.toBe(key.split(":")[1])
      }
      for (const count of [1, 2, 5]) {
        expect(
          i18n.exists("account:financial.potentialDuplicates", { count }),
        ).toBe(true)
        expect(
          i18n.t("account:financial.potentialDuplicates", { count }),
        ).not.toBe("financial.potentialDuplicates")
        expect(
          i18n.t("account:financial.potentialDuplicates", { count }),
        ).toContain(String(count))
      }
    },
  )
})
