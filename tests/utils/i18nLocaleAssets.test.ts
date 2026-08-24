import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ResolvedPublicFile, Wxt } from "wxt"

import {
  APP_LOCALE_ASSET_GLOB,
  getAppLocaleAssetPath,
  SUPPORTED_UI_LANGUAGES,
} from "~/constants/i18n"
import runtimeAssetsModule, {
  createLocaleAssetContents,
} from "~/locales/runtime-assets"

const localeRoot = fileURLToPath(new URL("../../src/locales", import.meta.url))
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

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

  it("rejects a language directory without namespace files", async () => {
    const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "locale-assets-"))
    temporaryRoots.push(emptyRoot)
    await mkdir(path.join(emptyRoot, "en"))

    await expect(createLocaleAssetContents(emptyRoot, "en")).rejects.toThrow(
      "No locale namespaces found for en",
    )
  })

  it("registers generated assets for every supported language", async () => {
    let buildPublicAssets:
      | ((wxt: Wxt, files: ResolvedPublicFile[]) => Promise<void>)
      | undefined
    const projectRoot = path.resolve(localeRoot, "../..")
    const wxt = {
      config: { root: projectRoot },
      hooks: {
        hook: vi.fn(
          (
            _name: string,
            callback: (wxt: Wxt, files: ResolvedPublicFile[]) => Promise<void>,
          ) => {
            buildPublicAssets = callback
          },
        ),
      },
    } as unknown as Wxt

    await runtimeAssetsModule.setup?.(wxt)
    expect(buildPublicAssets).toBeDefined()
    const files: ResolvedPublicFile[] = []
    await buildPublicAssets!(wxt, files)

    expect(files).toHaveLength(SUPPORTED_UI_LANGUAGES.length)
    expect(files.map((file) => file.relativeDest)).toEqual(
      SUPPORTED_UI_LANGUAGES.map(getAppLocaleAssetPath),
    )
  })
})
