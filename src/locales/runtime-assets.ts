import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { defineWxtModule } from "wxt/modules"

import {
  APP_LOCALE_ASSET_DIR,
  SUPPORTED_UI_LANGUAGES,
  type SupportedUiLanguage,
} from "../constants/i18n"

/**
 * Combine a language's namespace files into one minified runtime asset.
 */
export async function createLocaleAssetContents(
  localeRoot: string,
  language: SupportedUiLanguage,
) {
  const languageDir = path.join(localeRoot, language)
  const namespaceFiles = (await readdir(languageDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()

  if (namespaceFiles.length === 0) {
    throw new Error(`No locale namespaces found for ${language}`)
  }

  const namespaceEntries = await Promise.all(
    namespaceFiles.map(async (filename) => {
      const namespace = filename.slice(0, -".json".length)
      const contents = await readFile(path.join(languageDir, filename), "utf8")
      return [namespace, JSON.parse(contents)] as const
    }),
  )

  return JSON.stringify(Object.fromEntries(namespaceEntries))
}

export default defineWxtModule((wxt) => {
  const localeRoot = path.resolve(wxt.config.root, "src/locales")

  wxt.hooks.hook("build:publicAssets", async (_wxt, files) => {
    const assets = await Promise.all(
      SUPPORTED_UI_LANGUAGES.map(async (language) => ({
        contents: await createLocaleAssetContents(localeRoot, language),
        relativeDest: `${APP_LOCALE_ASSET_DIR}/${language}.json`,
      })),
    )

    files.push(...assets)
  })
})
