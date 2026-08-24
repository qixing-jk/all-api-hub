import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  APP_LOCALE_ASSET_GLOB,
  getAppLocaleAssetPath,
  SUPPORTED_UI_LANGUAGES,
} from "~/constants/i18n"
import { createLocaleAssetContents } from "~/locales/runtime-assets"

const localeRoot = fileURLToPath(new URL("../../src/locales", import.meta.url))

async function listSourceNamespaces(language: string) {
  const entries = await readdir(path.join(localeRoot, language), {
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort()
}

describe("locale asset generation", () => {
  it("keeps generated asset paths aligned with the manifest glob", () => {
    expect(getAppLocaleAssetPath("en")).toBe("app-locales/en.json")
    expect(APP_LOCALE_ASSET_GLOB).toBe("app-locales/*.json")
  })

  it("emits one complete namespaced JSON asset per supported language", async () => {
    for (const language of SUPPORTED_UI_LANGUAGES) {
      const contents = await createLocaleAssetContents(localeRoot, language)
      const resources = JSON.parse(contents) as Record<string, unknown>

      expect(Object.keys(resources).sort()).toEqual(
        await listSourceNamespaces(language),
      )
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
