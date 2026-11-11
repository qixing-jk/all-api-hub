import { GptEncoding } from "gpt-tokenizer/GptEncoding"
import { expect, it } from "vitest"
import type { ResolvedPublicFile, Wxt, WxtHooks } from "wxt"

import wxtConfig from "~~/wxt.config"

it("packages tokenizer data below AMO's file limit with the original token ranks", async () => {
  const hook = (wxtConfig.hooks as Partial<WxtHooks>)?.["build:publicAssets"]
  if (typeof hook !== "function") throw new Error("Expected public asset hook")
  const assets: ResolvedPublicFile[] = []
  await hook({} as Wxt, assets)
  expect(assets.map((asset) => asset.relativeDest)).toEqual([
    "tokenizers/cl100k_base.json",
    "tokenizers/o200k_base.json",
  ])
  for (const asset of assets) {
    if (!("contents" in asset)) throw new Error("Expected generated vocabulary")
    expect(Buffer.byteLength(asset.contents)).toBeLessThan(5 * 1024 * 1024)
    const encoding = asset.relativeDest.includes("cl100k")
      ? "cl100k_base"
      : "o200k_base"
    const api = GptEncoding.getEncodingApi(encoding, () =>
      JSON.parse(asset.contents),
    )
    expect(api.countTokens("Hello, world!")).toBe(4)
    expect(api.decode(api.encode("你好 🌍"))).toBe("你好 🌍")
  }
})

it.each(["chrome", "firefox"])(
  "makes packaged vocabularies available to %s content scripts",
  async (browser) => {
    if (typeof wxtConfig.manifest !== "function")
      throw new Error("Expected manifest factory")
    const manifest = await wxtConfig.manifest({
      command: "build",
      browser,
      manifestVersion: browser === "firefox" ? 2 : 3,
      mode: "production",
    })
    expect(manifest.web_accessible_resources).toContainEqual({
      resources: expect.arrayContaining(["tokenizers/*.json"]),
      matches: ["<all_urls>"],
      use_dynamic_url: true,
    })
  },
)
