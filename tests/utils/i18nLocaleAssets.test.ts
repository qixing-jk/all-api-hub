import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { SUPPORTED_UI_LANGUAGES } from "~/constants/i18n"
import { createLocaleAssetContents } from "~/locales/runtime-assets"

const localeRoot = fileURLToPath(new URL("../../src/locales", import.meta.url))

describe("locale asset generation", () => {
  it("emits one complete namespaced JSON asset per supported language", async () => {
    for (const language of SUPPORTED_UI_LANGUAGES) {
      const contents = await createLocaleAssetContents(localeRoot, language)
      const resources = JSON.parse(contents) as Record<string, unknown>

      expect(Object.keys(resources)).toHaveLength(30)
      expect(resources.common).toBeTypeOf("object")
      expect(resources.settings).toBeTypeOf("object")
    }
  })

  it("preserves namespace values while removing source indentation", async () => {
    const contents = await createLocaleAssetContents(localeRoot, "en")
    const resources = JSON.parse(contents) as {
      common: { actions: { cancel: string } }
    }

    expect(resources.common.actions.cancel).toBe("Cancel")
    expect(contents).not.toContain("\n")
  })
})
